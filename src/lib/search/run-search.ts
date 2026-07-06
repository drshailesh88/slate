/**
 * Server-side literature search orchestration.
 *
 * Single source of truth for fanning out to PubMed / Europe PMC (plus the owned
 * MedCPT dense lane), fusing with RRF, filtering, and normalizing results. Both
 * the web API route (`/api/research/search`) and the MCP tool (`/api/mcp`) call
 * this — neither reimplements the search logic, and neither performs auth here
 * (auth lives at each transport's boundary).
 */

import { searchPubMed } from "@/lib/search/sources/pubmed";
import { searchEuropePMC } from "@/lib/search/sources/europepmc";
import { searchArxiv } from "@/lib/search/sources/arxiv";
import { searchSemanticScholar } from "@/lib/search/sources/semantic-scholar";
import { searchScopus } from "@/lib/search/sources/scopus";
import { searchSpringer } from "@/lib/search/sources/springer";
import { searchMedcptDense } from "@/lib/search/sources/medcpt-dense";
import { fetchCrossrefByDoi } from "@/lib/search/sources/crossref";
import { searchClinicalTrials } from "@/lib/search/sources/clinical-trials";
import { searchTavily } from "@/lib/search/sources/tavily";
import { expandByPmra } from "@/lib/search/sources/expansion";
import { reciprocalRankFusion } from "@/lib/search/rank-fusion";
import { enrichCitationsByIds } from "@/lib/search/sources/openalex";
import { planQuery } from "@/lib/search/query-planner";
import { rankAndAnnotate } from "@/lib/search/pipeline";
import type { RankingIntent } from "@/lib/search/quality-ranker";
import { rerankProfileForDomain } from "@/lib/search/domains";
import { searchResultCache, buildCacheKey } from "@/lib/search/result-cache";
import { attachRerankScores } from "@/lib/search/rerank";
import {
  generateSearchVariants,
  hasHyde,
  isPaperLookupQuery,
  type HydeResult,
} from "@/lib/search/hyde";
import { okStatus, type SourceStatus } from "@/lib/search/source-status";
import { isTransientEmpty } from "@/lib/search/transient-empty";
import { assessConfidence, type Confidence } from "@/lib/search/confidence";
import { backfillPmidsByDoi } from "@/lib/search/pmid-backfill";
import type { UnifiedSearchResult } from "@/types/search";

export const SEARCH_SOURCES = ["pubmed", "europepmc", "scopus", "springer", "semantic_scholar"] as const;
export type SearchSourceId = (typeof SEARCH_SOURCES)[number];

/**
 * Sources used when a caller does not specify any. PubMed-first for clinical
 * relevance; Europe PMC for open-access links AND native citation counts (its
 * `citedByCount` replaces the dropped OpenAlex citation-enrichment step). Scopus
 * adds broad multidisciplinary coverage plus its own `citedby-count`; Springer
 * Nature adds book/journal full text and open-access PDFs. All four are
 * throttle-tolerant lexical lanes, each key-gated so an unconfigured lane stays
 * inert (missing_config) rather than degrading search. Semantic Scholar (~200M
 * all-field papers) is re-added as a cross-domain lane that helps medicine AND
 * non-medical — fail-open with its own circuit breaker, so it is a bonus source and
 * never critical. The owned MedCPT dense lane remains the recall backbone and always
 * contributes (see the guaranteed-floor logic below).
 */
export const DEFAULT_SOURCES: SearchSourceId[] = [
  "pubmed",
  "europepmc",
  "scopus",
  "springer",
  "semantic_scholar",
];

/** Hard ceiling on results per search, shared across web and MCP transports. */
export const MAX_RESULTS = 50;
export const DEFAULT_PER_PAGE = 10;

/** Normalized study-type buckets surfaced to clients. */
export const STUDY_TYPES = [
  "systematic_review",
  "meta_analysis",
  "rct",
  "clinical_trial",
  "cohort",
  "case_report",
  "narrative_review",
  "guideline",
  "other",
] as const;

export interface RunLiteratureSearchParams {
  query: string;
  /** Optional PubMed-specific query override (e.g. from a research plan). */
  pubmedQuery?: string;
  sources?: SearchSourceId[];
  yearFrom?: number;
  yearTo?: number;
  studyTypes?: string[];
  fullTextOnly?: boolean;
  page?: number;
  perPage?: number;
  /**
   * Ranking intent from the UI (Landmark/Latest chip): re-weights the citation vs
   * recency tie-breaker the cross-encoder can't resolve. Defaults to balanced.
   */
  rankingIntent?: RankingIntent;
  /**
   * Scientific discipline of the query (medicine, computer_science, …). Routes the
   * reranker: biomedical → MedCPT, everything else → the general bge model. Defaults
   * to biomedical (medicine) when absent.
   */
  domainId?: string;
  /**
   * Opt-in citation/PMRA neighbour expansion (a high-recall, slower mode for
   * systematic-review-style searches). Off by default to keep the default path
   * fast — the owned MedCPT dense semantic lane already provides corpus-free recall.
   */
  expandCitations?: boolean;
  /**
   * Eval-only: also return the post-enrichment/rerank candidate POOL (pre-final-
   * ranking), so the offline harness can freeze it and re-rank deterministically.
   * Off by default; never set on the live web/MCP path.
   */
  includeRawCandidates?: boolean;
}

export type LiteraturePaper = UnifiedSearchResult & {
  id: string;
  studyTypeEnum: string;
  verificationStatus: "pending";
  source: string;
  inLibrary: boolean;
};

export interface LiteratureSearchResult {
  results: LiteraturePaper[];
  /** Navigable result count (capped to {@link MAX_NAVIGABLE_RESULTS}) — drives pagination. */
  total: number;
  /** True cross-source match count (uncapped) — for an honest "N papers matched" context line. */
  matchedTotal: number;
  page: number;
  perPage: number;
  hasMore: boolean;
  sourceCounts: Record<string, number>;
  /**
   * Per-source health. A source marked anything other than "ok" was degraded —
   * its zero count must NOT be read as "no results". Surfaced so callers can
   * distinguish "source down" from "genuinely nothing found".
   */
  sourceStatuses: Record<string, SourceStatus>;
  /**
   * Whether any result is a strong match. "low" when even the top result is only
   * weakly relevant (negative-control / ambiguous-acronym traps), so the UI can
   * say "no strong match" instead of over-committing. Additive — never reorders.
   */
  confidence: Confidence;
  /** The retrieval plan used (sort strategy, expansions, trial detection). */
  plan: {
    pubmedQuery: string;
    recency: boolean;
    trialAcronyms: string[];
    wantsTrials: boolean;
  };
  /**
   * Eval-only: the frozen post-enrichment/rerank candidate pool (present only when
   * `includeRawCandidates` was set). Lets the offline harness re-rank a fixed pool
   * deterministically, isolating ranking changes from live-retrieval noise.
   */
  rawCandidates?: UnifiedSearchResult[];
}

function withSourceTimeout<T>(
  label: string,
  promise: Promise<T>,
  timeoutMs = 8000
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`${label} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }),
  ]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

/**
 * Global fan-out deadline (ms). A single stuck/throttled lane must not hold the
 * whole query — at the deadline we proceed with whatever lanes have resolved
 * (partial results), marking the rest as dropped. Caps the p95 tail.
 *
 * Set to 8s (was 5s): the owned MedCPT dense lane is the recall backbone — when
 * the lexical lanes are throttled or an upstream (Europe PMC) is down, the dense
 * lane alone returns the right papers. Under prod serverless latency + event-loop
 * contention from a slow lane, dense and PubMed were finishing just past 5s and
 * being dropped, collapsing the pool to whatever fast junk lane survived. 8s gives
 * the good lanes room; a lane that resolves early still returns immediately (this
 * is a ceiling, not a floor), so it only lengthens the degraded/one-lane-down tail.
 *
 * NOTE: the BASE MedCPT dense lane is NOT bound by this deadline — it is the
 * guaranteed floor and awaited on its own longer timeout (DENSE_FLOOR_TIMEOUT_MS).
 * Only the lexical lanes and the recency/HyDE dense lanes race this deadline.
 */
export const FANOUT_DEADLINE_MS = 6000;

/**
 * Guaranteed-floor timeout (ms) for the BASE MedCPT dense lane. This lane is
 * CPU-warm, owned, and outage-proof, so it must NEVER be dropped by the fan-out
 * deadline race — it is awaited independently on this longer budget and always
 * merged into the fused pool, even when every lexical lane was dropped. Slightly
 * longer than FANOUT_DEADLINE_MS so a dense lane finishing just past the fan-out
 * ceiling still contributes rather than collapsing recall to whatever survived.
 */
export const DENSE_FLOOR_TIMEOUT_MS = 7000;

/**
 * Dedicated timeout (ms) for the transient-empty recovery pass — a single fresh
 * attempt at the owned MedCPT dense lane after the main fan-out came back empty
 * because a lane failed transiently. Only fires on the rare empty/degraded path
 * (~3% of queries), so a generous timeout here trades a slower tail on those for
 * an answer instead of an empty result set.
 */
export const DENSE_RECOVERY_TIMEOUT_MS = 6000;

/** Window (calendar years, inclusive) for the recency-intent dense lane. */
export const RECENCY_DENSE_WINDOW_YEARS = 3;

/**
 * Year floor for the recency-windowed dense lane — the start of the last
 * `windowYears` calendar years (e.g. 2026 with a 3-year window → 2024, so the
 * lane covers 2024/2025/2026). A separate, year-restricted query over the SAME
 * owned index surfaces the freshest semantically-relevant papers, which the
 * unfiltered (similarity-only) dense lane can bury under older high-similarity
 * hits.
 */
export function recencyYearFloor(currentYear: number, windowYears: number): number {
  return currentYear - windowYears + 1;
}

// Cap for the metadata-backfill pool (PMID resolution). Bounded to the top
// candidates by RRF score, since a deep candidate can't reach the returned page.
export const POST_FUSION_POOL = 50;

// Cap for the cross-encoder rerank pool (Lever 1 / F2). The reranker scores the
// WHOLE fused pool in a single call — Cohere/OpenRouter accept ≤1000 docs per
// request and bill per search, not per doc, so 50→200 is one call at the same
// cost — and this cap sits above the largest pools we observe (~190), so the
// entire ranked region carries a calibrated model score and no un-reranked
// lexical tail can out-sort it. Reranking only the top 50 (the old behavior) left
// candidates 50+ on saturating keyword-overlap relevance that beat rank-5 model
// scores — the documented F2 inversion.
export const RERANK_POOL_CAP = 200;

// Cap the navigable page count. `total` used to be the largest source's raw hit
// count (millions), so the UI showed "page 2 of 340,000 pages" — but we only fetch
// + fuse + rerank a bounded pool per page, source APIs cap deep pagination (~10k
// offset), and relevance degrades fast past the first pages. Bound navigable pages
// to an honest depth; the true cross-source match count is surfaced as `matchedTotal`.
export const MAX_NAVIGABLE_RESULTS = 200;

const DEADLINE = Symbol("fanout-deadline");

/**
 * Await source lanes up to a global deadline, returning PARTIAL results: lanes
 * that resolved are used as-is; lanes still pending at the deadline are recorded
 * as a "timeout" outcome (so they never block the query, and `sourceStatuses`
 * shows them degraded rather than a false "ok with 0 results"). Each input
 * promise already resolves to a SourceOutcome (never rejects).
 */
export async function settleWithinDeadline(
  outcomes: Promise<SourceOutcome>[],
  labels: string[],
  deadlineMs: number
): Promise<SourceOutcome[]> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const deadline = new Promise<typeof DEADLINE>((resolve) => {
    timer = setTimeout(() => resolve(DEADLINE), deadlineMs);
  });
  try {
    return await Promise.all(
      outcomes.map(async (p, i) => {
        const res = await Promise.race([p, deadline]);
        if (res === DEADLINE) {
          return {
            source: labels[i] ?? `lane_${i}`,
            results: [],
            total: 0,
            status: {
              status: "timeout" as const,
              message: `dropped: fan-out exceeded ${deadlineMs}ms`,
            },
          };
        }
        return res;
      })
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const STUDY_TYPE_MAP: Record<string, string> = {
  "Randomized Controlled Trial": "rct",
  systematic_review: "systematic_review",
  meta_analysis: "meta_analysis",
  Review: "narrative_review",
  "Clinical Trial": "clinical_trial",
  "Case Reports": "case_report",
  "Cohort Studies": "cohort",
  Guideline: "guideline",
  "Practice Guideline": "guideline",
};

export function mapStudyType(studyType: string | undefined): string {
  if (!studyType) return "other";
  return STUDY_TYPE_MAP[studyType] || studyType;
}

function generatePaperId(result: UnifiedSearchResult): string {
  if (result.pmid) return `pm_${result.pmid}`;
  if (result.doi) return `doi_${result.doi.replace(/[^a-zA-Z0-9]/g, "_")}`;
  if (result.s2Id) return `s2_${result.s2Id}`;
  if (result.openalexId) return `oa_${result.openalexId.replace(/[^a-zA-Z0-9]/g, "_")}`;
  return `paper_${result.title.slice(0, 24).replace(/[^a-zA-Z0-9]/g, "_")}`;
}

function determineSource(result: UnifiedSearchResult): string {
  const sources = result.sources || [];
  const hasPubmed = sources.includes("pubmed");
  const hasSS = sources.includes("semantic_scholar");
  if (hasPubmed && hasSS) return "both";
  if (hasSS) return "semantic_scholar";
  if (hasPubmed) return "pubmed";
  return sources[0] || "unknown";
}

/** Ensure every paper has a resolvable URL, deriving one from its identifiers. */
export function resolvePaperUrl(result: UnifiedSearchResult): string | undefined {
  if (result.url) return result.url;
  if (result.pmid) return `https://pubmed.ncbi.nlm.nih.gov/${result.pmid}/`;
  if (result.doi) return `https://doi.org/${result.doi}`;
  if (result.openalexId) return result.openalexId;
  return undefined;
}

function normalizeSources(sources?: SearchSourceId[]): SearchSourceId[] {
  if (!sources || sources.length === 0) return DEFAULT_SOURCES;
  const allowed = sources.filter((s): s is SearchSourceId =>
    SEARCH_SOURCES.includes(s)
  );
  return allowed.length > 0 ? allowed : DEFAULT_SOURCES;
}

interface SourceOutcome {
  source: string;
  results: UnifiedSearchResult[];
  total: number;
  status: SourceStatus;
}

const errorOutcome = (source: string, message: string): SourceOutcome => ({
  source,
  results: [],
  total: 0,
  status: { status: "error", message },
});

/**
 * PubMed retrieval with a robust multi-query strategy:
 *  - Run the keyword-simplified PRIMARY query (relevance- or date-sorted).
 *  - Also run the BROADENED core-topic query (qualifiers stripped) and UNION it,
 *    so a seminal trial matching the topic but not the qualifiers ("six year
 *    outcomes") is still retrieved, then ranked.
 *  - If the union is empty AND a distinct verbatim FALLBACK exists, retry with it
 *    (eliminates empty-result-sets for natural-language / PICO queries).
 * Union dedup is handled downstream by RRF (`isSamePaper`).
 */
async function searchPubMedPlanned(
  queries: { primary: string; broadened: string | null; fallback: string; relaxed: string },
  opts: { maxResults: number; page: number; yearStart?: number; yearEnd?: number; recency: boolean }
): Promise<SourceOutcome> {
  const sort = opts.recency ? "date" : "relevance";
  const base = {
    maxResults: opts.maxResults,
    page: opts.page,
    yearStart: opts.yearStart,
    yearEnd: opts.yearEnd,
    sort,
  } as const;
  const safeSearch = (q: string) =>
    searchPubMed(q, base).catch(() => ({ results: [], total: 0, status: okStatus() }));

  const runs = await Promise.all(
    [queries.primary, queries.broadened].filter((q): q is string => Boolean(q)).map(safeSearch)
  );
  const merged = runs.flatMap((r) => r.results);
  const total = Math.max(0, ...runs.map((r) => r.total));
  const status = runs.find((r) => r.status.status === "ok")?.status ?? runs[0]?.status ?? okStatus();

  if (merged.length > 0) {
    return { source: "pubmed", results: merged, total, status };
  }

  // Tier 2: verbatim fallback (distinct natural-language phrasing).
  let out = { results: merged, total, status };
  if (queries.primary !== queries.fallback) {
    out = await safeSearch(queries.fallback);
  }

  // Tier 3: OR-relaxation — an over-constrained AND-query (e.g. a multi-trial
  // family lookup) produced nothing; retry with the distinctive tokens OR-ed so
  // recall never collapses to an empty result set.
  if (
    out.results.length === 0 &&
    queries.relaxed &&
    queries.relaxed !== queries.primary &&
    queries.relaxed !== queries.fallback
  ) {
    out = await safeSearch(queries.relaxed);
  }
  return { source: "pubmed", results: out.results, total: out.total, status: out.status };
}

/**
 * Cached entry point. Coalesces concurrent identical queries and serves from the
 * two-tier cache (memory → Upstash) — cutting latency and upstream-call pressure.
 * Only HEALTHY results (≥3 papers) are cached, so a throttle-degraded/empty
 * response can never poison the cache; stale-if-error serves a retained result
 * if a later compute fails. TTL 1h (literature is slow-changing).
 */
export async function runLiteratureSearch(
  params: RunLiteratureSearchParams
): Promise<LiteratureSearchResult> {
  const key = buildCacheKey("litsearch:v2", {
    query: params.query,
    pubmedQuery: params.pubmedQuery,
    sources: params.sources ? [...params.sources].sort() : undefined,
    yearFrom: params.yearFrom,
    yearTo: params.yearTo,
    studyTypes: params.studyTypes ? [...params.studyTypes].sort() : undefined,
    fullTextOnly: params.fullTextOnly,
    page: params.page,
    perPage: params.perPage,
    expandCitations: params.expandCitations,
  });
  const { value } = await searchResultCache.getOrCompute(
    key,
    () => runLiteratureSearchUncached(params),
    { ttlSeconds: 3600, staleSeconds: 6 * 3600, shouldCache: (r) => r.results.length >= 3 }
  );
  return value;
}

async function runLiteratureSearchUncached(
  params: RunLiteratureSearchParams
): Promise<LiteratureSearchResult> {
  const sources = normalizeSources(params.sources);
  const page = Math.max(0, params.page ?? 0);
  const perPage = Math.min(MAX_RESULTS, Math.max(1, params.perPage ?? DEFAULT_PER_PAGE));
  // Over-fetch a larger candidate pool per source than the page size, so a
  // landmark sitting just outside a source's top-N (e.g. PARTNER 3 at PubMed
  // rank ~15) still enters the pool, gets reranked, and can reach the top page.
  const poolPerSource = Math.min(MAX_RESULTS, Math.max(perPage, 25));
  const searchQuery = params.query || "";
  const plan = planQuery(searchQuery);
  const pmPrimary = params.pubmedQuery || plan.pubmedPrimary;
  const pmFallback = params.pubmedQuery || plan.pubmedFallback;
  // A caller-supplied pubmedQuery overrides planning entirely (no broadening/relaxation).
  const pmBroadened = params.pubmedQuery ? null : plan.pubmedBroadened;
  const pmRelaxed = params.pubmedQuery ? "" : plan.pubmedRelaxed;

  const promises: Promise<SourceOutcome>[] = [];
  const laneLabels: string[] = [];
  const pushLane = (label: string, p: Promise<SourceOutcome>) => {
    promises.push(p);
    laneLabels.push(label);
  };

  // LLM query expansion (HyDE + multi-query). ON by default when a DeepSeek key is
  // present (opt out with HYDE_ENABLED="0"); dormant + fail-open without a key. One
  // cheap LLM call yields a hypothetical abstract + alternative formulations that
  // become EXTRA dense lanes (below), fused by RRF — measured +9.5pt recall@10 and
  // 13→3 fewer empty result sets on the 87q harness, because the owned dense lanes
  // recover queries the rate-limited lexical lanes drop. SKIPPED for trial-acronym
  // lookups (acronym expansion only adds noise to primary-report ranking) and for
  // specific paper lookups (DOI/PMID/pasted-title — the target is already known),
  // where it can't help and would just cost latency. Bounded by a timeout and
  // fail-open: any failure → no extra lanes → default retrieval unchanged. Sequential
  // (must precede fan-out), but cached per query so repeats add nothing.
  const hydeEnabled =
    process.env.HYDE_ENABLED !== "0" &&
    hasHyde() &&
    !plan.isTrialLookup &&
    !isPaperLookupQuery(searchQuery);
  const hyde: HydeResult = hydeEnabled
    ? await withSourceTimeout("HyDE", generateSearchVariants(searchQuery), 3000).catch(
        () => ({ variants: [] as string[] })
      )
    : { variants: [] };

  if (sources.includes("pubmed")) {
    pushLane(
      "pubmed",
      withSourceTimeout(
        "PubMed",
        searchPubMedPlanned(
          { primary: pmPrimary, broadened: pmBroadened, fallback: pmFallback, relaxed: pmRelaxed },
          {
            maxResults: poolPerSource,
            page,
            yearStart: params.yearFrom,
            yearEnd: params.yearTo,
            recency: plan.recency,
          }
        )
      ).catch((e) => errorOutcome("pubmed", e instanceof Error ? e.message : "PubMed failed"))
    );
  }

  // Europe PMC: a second throttle-tolerant biomedical lexical lane (replaces the
  // dropped OpenAlex lane). Wired exactly like the PubMed lane — same year filters
  // and withSourceTimeout pattern, fed into the same RRF fusion. Carries native
  // `citedByCount`, so citation counts come from here (and later Scopus) instead
  // of the removed OpenAlex citation-enrichment step, and native open-access links.
  if (sources.includes("europepmc")) {
    pushLane(
      "europepmc",
      withSourceTimeout(
        "Europe PMC",
        searchEuropePMC(searchQuery, {
          limit: poolPerSource,
          page: page + 1,
          yearStart: params.yearFrom,
          yearEnd: params.yearTo,
        }).then(({ results, total, status }) => ({ source: "europepmc", results, total, status }))
      ).catch((e) => errorOutcome("europepmc", e instanceof Error ? e.message : "Europe PMC failed"))
    );
  }

  // Scopus (Elsevier): a broad multidisciplinary lexical lane carrying its own
  // `citedby-count`. Wired exactly like the PubMed / Europe PMC lanes — same year
  // filters and withSourceTimeout pattern, fed into the same RRF fusion. Key-gated
  // internally: without ELSEVIER_API_KEY / SCOPUS_API_KEY it returns an empty
  // missing_config outcome and never throws, so it is safe to always include here.
  if (sources.includes("scopus")) {
    pushLane(
      "scopus",
      withSourceTimeout(
        "Scopus",
        searchScopus(searchQuery, {
          limit: poolPerSource,
          yearStart: params.yearFrom,
          yearEnd: params.yearTo,
        }).then(({ results, total, status }) => ({ source: "scopus", results, total, status }))
      ).catch((e) => errorOutcome("scopus", e instanceof Error ? e.message : "Scopus failed"))
    );
  }

  // Springer Nature: journal/book full text with native open-access PDF links.
  // Wired exactly like the other lexical lanes — same year filters and
  // withSourceTimeout pattern, fused via the same RRF. Key-gated internally:
  // without SPRINGER_API_KEY it returns an empty missing_config outcome and never
  // throws, so it is safe to always include in the fan-out.
  if (sources.includes("springer")) {
    pushLane(
      "springer",
      withSourceTimeout(
        "Springer",
        searchSpringer(searchQuery, {
          limit: poolPerSource,
          yearStart: params.yearFrom,
          yearEnd: params.yearTo,
        }).then(({ results, total, status }) => ({ source: "springer", results, total, status }))
      ).catch((e) => errorOutcome("springer", e instanceof Error ? e.message : "Springer failed"))
    );
  }

  // Semantic Scholar (S2AG): ~200M all-field papers — a cross-domain lexical lane that
  // helps medicine AND non-medical retrieval. Key-gated via SEMANTIC_SCHOLAR_API_KEY
  // (works unauthenticated at a lower rate). Fail-open with its own circuit breaker and
  // RRF-fused, so it is a BONUS source, never critical — an S2 outage/throttle just
  // degrades the pool rather than breaking search (the lesson from its 2025 key death).
  if (sources.includes("semantic_scholar")) {
    pushLane(
      "semantic_scholar",
      withSourceTimeout(
        "Semantic Scholar",
        searchSemanticScholar(searchQuery, {
          limit: poolPerSource,
          yearStart: params.yearFrom,
          yearEnd: params.yearTo,
        }).then(({ results, total, status }) => ({ source: "semantic_scholar", results, total, status }))
      ).catch((e) => errorOutcome("semantic_scholar", e instanceof Error ? e.message : "Semantic Scholar failed"))
    );
  }

  // arXiv: preprint lane for NON-biomedical disciplines (CS / physics / math / stats /
  // econ), where the landmark papers are arXiv-native and no other lane indexes them
  // (measured: ResNet / AlexNet / word2vec / LASSO were missed by every lane). Free,
  // no key, stable public infrastructure. Gated to the general reranker profile so the
  // live biomedical path (PubMed-covered) is unchanged; fail-open, RRF-fused.
  if (rerankProfileForDomain(params.domainId) === "general") {
    pushLane(
      "arxiv",
      withSourceTimeout(
        "arXiv",
        searchArxiv(searchQuery, { maxResults: poolPerSource }).then(
          ({ results, total }) => ({ source: "arxiv", results, total, status: okStatus() })
        )
      ).catch((e) => errorOutcome("arxiv", e instanceof Error ? e.message : "arXiv failed"))
    );
  }

  // Dense first-stage retrieval over the self-hosted MedCPT PubMed index
  // (Turbopuffer int8 + a Modal-served MedCPT Query-Encoder) — the throttle-proof
  // replacement for the OpenAlex `search.semantic` lane. Retrieves by MEANING,
  // surfacing landmarks that share no surface terms with the query, and cannot be
  // rate-limited away because we own it. Fused into the candidate pool before RRF.
  // Runs alongside the core biomedical lexical lanes (PubMed / Europe PMC) and
  // fails open: dormant (missing_config) until the index + encoder are configured,
  // so it never degrades live search.
  const runsDense = sources.includes("pubmed") || sources.includes("europepmc");

  // GUARANTEED FLOOR: the BASE similarity dense lane is the outage-proof recall
  // backbone, so it must NEVER be dropped by the fan-out deadline race. Unlike the
  // other lanes it is NOT pushed into `promises` — it is started here (in parallel
  // with everything else) and awaited AFTER settleWithinDeadline on its own longer
  // DENSE_FLOOR_TIMEOUT_MS budget, then always merged into the fused pool even when
  // every lexical lane was dropped. The recency/HyDE dense lanes below stay on the
  // normal fan-out deadline — only this base lane is the floor.
  const baseDensePromise: Promise<SourceOutcome> | null = runsDense
    ? withSourceTimeout(
        "MedCPT Dense",
        searchMedcptDense(searchQuery, {
          limit: poolPerSource,
          yearStart: params.yearFrom,
          yearEnd: params.yearTo,
        }).then(({ results, total, status }) => ({
          source: "medcpt_dense",
          results,
          total,
          status,
        })),
        DENSE_FLOOR_TIMEOUT_MS
      ).catch((e) =>
        errorOutcome("medcpt_dense", e instanceof Error ? e.message : "MedCPT dense failed")
      )
    : null;

  if (runsDense) {
    // Recency intent: an additional recency-WINDOWED dense lane over the same
    // owned index. The base dense lane ranks purely by semantic similarity, so a
    // newer pivotal paper can sit below older high-similarity hits; restricting to
    // the last few years surfaces the freshest semantically-relevant papers into
    // the pool. RRF-fused and additive — the unfiltered lanes still carry older
    // landmarks, and the quality ranker still demotes recent junk — so it lifts
    // recall of fresh evidence without burying landmarks. Throttle-proof (owned
    // index), gated on recency intent, and only when the caller has not already
    // constrained the year range. Its reach is bounded by the index snapshot.
    if (plan.recency && params.yearFrom === undefined) {
      const recentFloor = recencyYearFloor(
        new Date().getFullYear(),
        RECENCY_DENSE_WINDOW_YEARS
      );
      pushLane(
        "medcpt_dense_recent",
        withSourceTimeout(
          "MedCPT Dense (recency)",
          searchMedcptDense(searchQuery, {
            limit: poolPerSource,
            yearStart: recentFloor,
            yearEnd: params.yearTo,
          }).then(({ results, total, status }) => ({
            source: "medcpt_dense_recent",
            results,
            total,
            status,
          }))
        ).catch((e) =>
          errorOutcome(
            "medcpt_dense_recent",
            e instanceof Error ? e.message : "MedCPT dense recency failed"
          )
        )
      );
    }

    // HyDE / multi-query: each LLM-generated formulation (and the hypothetical
    // abstract) runs as its OWN dense lane against the owned MedCPT index, then
    // RRF-fuses with everything else. The dense lane is throttle-proof, so extra
    // lanes add recall without external rate-limit pressure. Bounded by the same
    // fan-out deadline and fail-open per lane. Empty when HyDE is off/failed.
    const hydeDenseQueries = [
      ...(hyde.hypotheticalAbstract ? [hyde.hypotheticalAbstract] : []),
      ...hyde.variants,
    ];
    hydeDenseQueries.forEach((hq, i) => {
      pushLane(
        `medcpt_dense_hyde_${i}`,
        withSourceTimeout(
          "MedCPT Dense (HyDE)",
          searchMedcptDense(hq, {
            limit: poolPerSource,
            yearStart: params.yearFrom,
            yearEnd: params.yearTo,
          }).then(({ results, total, status }) => ({
            source: `medcpt_dense_hyde_${i}`,
            results,
            total,
            status,
          }))
        ).catch((e) =>
          errorOutcome(
            `medcpt_dense_hyde_${i}`,
            e instanceof Error ? e.message : "MedCPT dense (HyDE) failed"
          )
        )
      );
    });
  }

  // ClinicalTrials.gov linking for trial-acronym / NCT / explicit-trial queries.
  if (plan.wantsTrials) {
    pushLane(
      "clinical_trials",
      withSourceTimeout(
        "ClinicalTrials",
        searchClinicalTrials(searchQuery, { limit: Math.min(5, perPage) }).then(
          ({ results, total, status }) => ({ source: "clinical_trials", results, total, status })
        )
      ).catch((e) =>
        errorOutcome("clinical_trials", e instanceof Error ? e.message : "ClinicalTrials failed")
      )
    );
  }

  // Optional web fallback (Tavily) for guideline / recency queries. No-op without
  // TAVILY_API_KEY. Restricted to trusted biomedical/guideline domains and
  // trust-tiered so it can never out-rank stable primary literature.
  if (plan.wantsWeb && process.env.TAVILY_API_KEY) {
    pushLane(
      "web",
      withSourceTimeout(
        "Tavily",
        searchTavily(searchQuery, { maxResults: 5, topic: plan.recency ? "news" : "general" }).then(
          ({ results, total, status }) => ({ source: "web", results, total, status })
        )
      ).catch((e) => errorOutcome("web", e instanceof Error ? e.message : "Tavily failed"))
    );
  }

  // Await lanes up to a global deadline → partial results (a stuck/throttled lane
  // never holds the whole query; dropped lanes are marked "timeout", not "ok").
  const sourceResults = await settleWithinDeadline(promises, laneLabels, FANOUT_DEADLINE_MS);

  // GUARANTEED FLOOR: merge the BASE MedCPT dense lane independently of the fan-out
  // deadline. It was started in parallel above and is awaited here on its own longer
  // budget, so it ALWAYS contributes to the fused pool — even when every lexical lane
  // was dropped at FANOUT_DEADLINE_MS. This is the outage-proof recall backbone.
  if (baseDensePromise) {
    sourceResults.push(await baseDensePromise);
  }

  // Wave 2 (opt-in): neighbour/citation expansion on the top seeds — a corpus-free
  // recall booster that pulls PubMed related-articles (PMRA) of the best wave-1
  // hits, so landmark papers related to (but not lexically matching) the query
  // enter the pool. Sequential (depends on wave-1 seeds) and slower, so it is
  // gated behind `expandCitations` (high-recall mode); fail-open.
  if (params.expandCitations && sources.includes("pubmed")) {
    const seedPmids = sourceResults
      .flatMap((sr) => sr.results.slice(0, 5))
      .map((r) => r.pmid)
      .filter((p): p is string => Boolean(p));
    if (seedPmids.length > 0) {
      const expanded = await withSourceTimeout(
        "PMRA expand",
        expandByPmra(seedPmids, { limit: poolPerSource }),
        12000
      ).catch(() => [] as UnifiedSearchResult[]);
      if (expanded.length > 0) {
        sourceResults.push({
          source: "pubmed_pmra",
          results: expanded,
          total: expanded.length,
          status: okStatus(),
        });
      }
    }
  }

  let fused = reciprocalRankFusion(
    sourceResults.map((sr) => ({ source: sr.source, results: sr.results }))
  );

  // Transient-empty recovery: an empty/degraded pool caused by a TRANSIENT lane
  // failure (throttle / timeout / upstream error) — not a query that genuinely has
  // no answer — gets ONE fresh attempt at the owned, throttle-proof MedCPT dense
  // lane, whose results we merge and re-fuse. Bounded to a single extra attempt and
  // fail-open, so it can never loop or starve the next query. Skipped for a
  // legitimately empty result (every lane ok) or a dormant lane (missing_config),
  // where a retry cannot help — see isTransientEmpty.
  if (
    runsDense &&
    isTransientEmpty(
      fused.length,
      sourceResults.map((sr) => sr.status)
    )
  ) {
    const recovered = await withSourceTimeout(
      "MedCPT Dense (recovery)",
      searchMedcptDense(searchQuery, {
        limit: poolPerSource,
        yearStart: params.yearFrom,
        yearEnd: params.yearTo,
      }).then(({ results, total, status }) => ({
        source: "medcpt_dense_recovery",
        results,
        total,
        status,
      })),
      DENSE_RECOVERY_TIMEOUT_MS
    ).catch((e) =>
      errorOutcome(
        "medcpt_dense_recovery",
        e instanceof Error ? e.message : "MedCPT dense recovery failed"
      )
    );
    if (recovered.results.length > 0) {
      sourceResults.push(recovered);
      fused = reciprocalRankFusion(
        sourceResults.map((sr) => ({ source: sr.source, results: sr.results }))
      );
    }
  }

  const sourceCounts: Record<string, number> = {};
  const sourceStatuses: Record<string, SourceStatus> = {};
  let maxTotal = 0;
  for (const sr of sourceResults) {
    sourceCounts[sr.source] = sr.total;
    sourceStatuses[sr.source] = sr.status;
    maxTotal = Math.max(maxTotal, sr.total);
  }

  // Post-fusion rerank + citation enrichment (run concurrently below). Europe PMC and
  // Scopus carry `citedByCount` natively, but PubMed-only and dense-only results do
  // not — so OpenAlex backfills citations by PMID/DOI to give the composite its
  // landmark signal. Bounded to the top `POST_FUSION_POOL` candidates by RRF
  // score, in place (slice shares object refs, so the originals in `fused` still
  // get the mutated rerankScore). Candidates past the pool are never reranked, so
  // they can't reach the returned page anyway. Fail-open.
  //  - rerank: OpenRouter cohere/rerank-4-pro relevance score (managed, always-warm,
  //    ~1.2s; the dominant relevance signal). MedCPT is off the critical path now.
  // LEVER 1: rerank the WHOLE fused pool (bounded by RERANK_POOL_CAP), not just
  // the top POST_FUSION_POOL. One reranker call scores every candidate, so a
  // landmark that RRF ranked past 50 (single-lane PubMed hits especially) is
  // judged on calibrated relevance instead of falling back to saturating lexical
  // overlap — and the pipeline's rerank-window boundary keeps any un-reranked
  // tail strictly below the scored set.
  const rerankPool = fused.slice(0, RERANK_POOL_CAP);
  // The cross-encoder rerank is COUNTERPRODUCTIVE for a specific trial-acronym
  // lookup: fed a bare acronym ("KEYNOTE-189"), it scores secondary papers that
  // mention the acronym above the trial's PRIMARY report (whose title describes the
  // intervention, not the acronym), demoting the canonical answer off the page
  // (measured: the GT primary sits in the rerank pool but is pushed out of the top-10
  // only when reranked). For these the exact-match lexical lane + clinical-quality
  // composite + demoteSecondaryTrialResults already float the primary first, so we
  // skip the rerank. Non-acronym queries keep it.
  const skipRerank = plan.trialAcronyms.length > 0;
  // LEVER 2 (citation signal): backfill citation counts on the pool via OpenAlex by
  // PMID/DOI, concurrently with the rerank. The cross-encoder saturates on-topic
  // papers at ~1.0, so the citation count is the tie-breaker that floats a
  // foundational trial into the top-10 — but single-lane PubMed landmarks (PARTNER 3,
  // Evolut, ARISTOTLE) arrive with citationCount=0. This restores the dormant signal
  // the quality composite already log-normalizes. Fail-open: OpenAlex has a circuit
  // breaker and returns 0 when unreachable, so a bad key/outage is never worse than
  // the current zero-citation state. Mutates in place (shared refs with `fused`).
  await Promise.all([
    skipRerank
      ? Promise.resolve(null)
      : withSourceTimeout(
          "Cross-encoder rerank",
          attachRerankScores(searchQuery, rerankPool, rerankPool.length, {
            rerankProfile: rerankProfileForDomain(params.domainId),
          }),
          6000
        ).catch(() => fused),
    withSourceTimeout(
      "Citation enrichment",
      enrichCitationsByIds(rerankPool),
      5000
    ).catch(() => 0),
  ]);

  // PMID backfill: PubMed and Europe PMC (MEDLINE records) carry PMIDs natively,
  // but DOI-only results (Crossref, preprints, non-MEDLINE Europe PMC sources)
  // still lack one (the PMID metadata gate). Resolve the residual via NCBI
  // esearch[AID] — bounded to a handful of the top candidates, fail-open, additive
  // metadata only.
  await withSourceTimeout(
    "PMID backfill",
    backfillPmidsByDoi(fused.slice(0, POST_FUSION_POOL)),
    3000
  ).catch(() => 0);

  // Eval-only: snapshot the enriched candidate pool BEFORE final ranking, so the
  // offline harness can re-rank this exact pool deterministically.
  const rawCandidates = params.includeRawCandidates
    ? fused.map((r) => ({ ...r }))
    : undefined;

  // Rank by clinical quality (relevance[rerank] + evidence hierarchy + citations
  // + velocity + journal) and annotate with a trace, flags, and "why relevant".
  const ranked = rankAndAnnotate(fused, {
    query: searchQuery,
    recency: plan.recency,
    isTrialLookup: plan.isTrialLookup,
    isGuidelineLookup: plan.isGuidelineLookup,
    rankingIntent: params.rankingIntent,
  });

  let filtered = ranked;
  if (params.studyTypes && params.studyTypes.length > 0) {
    const allowedTypes = new Set(params.studyTypes);
    filtered = filtered.filter((r) => allowedTypes.has(mapStudyType(r.studyType)));
  }

  if (params.fullTextOnly) {
    filtered = filtered.filter((r) => r.isOpenAccess);
  }

  // The full pool was over-fetched and ranked; return only the requested page.
  const pageResults = filtered.slice(0, perPage);
  const results: LiteraturePaper[] = pageResults.map((r) => ({
    ...r,
    url: resolvePaperUrl(r),
    id: generatePaperId(r),
    studyTypeEnum: mapStudyType(r.studyType),
    verificationStatus: "pending" as const,
    source: determineSource(r),
    inLibrary: false,
  }));

  const navigableTotal = Math.min(maxTotal, MAX_NAVIGABLE_RESULTS);
  return {
    results,
    total: navigableTotal,
    matchedTotal: maxTotal,
    page,
    perPage,
    hasMore: filtered.length > perPage && (page + 1) * perPage < navigableTotal,
    sourceCounts,
    sourceStatuses,
    confidence: assessConfidence(pageResults),
    plan: {
      pubmedQuery: pmPrimary,
      recency: plan.recency,
      trialAcronyms: plan.trialAcronyms,
      wantsTrials: plan.wantsTrials,
    },
    ...(rawCandidates ? { rawCandidates } : {}),
  };
}

async function fetchSinglePubMed(term: string): Promise<UnifiedSearchResult | null> {
  try {
    const { results } = await searchPubMed(term, { maxResults: 1 });
    return results[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch a single paper by identifier. Accepts a DOI, PMID, or an internal
 * `pm_<pmid>` id and resolves through stable primary sources in order: PubMed
 * (by PMID or DOI), then Crossref (by DOI). `doi_`/`s2_`/`oa_` internal ids are
 * lossy and cannot be reversed — callers should pass the raw `doi`/`pmid` instead.
 */
export async function fetchPaperById(params: {
  doi?: string;
  pmid?: string;
  id?: string;
}): Promise<LiteraturePaper | null> {
  const pmid =
    params.pmid?.trim() ||
    (params.id?.startsWith("pm_") ? params.id.slice(3) : undefined);
  const doi = (params.doi ?? "")
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//, "")
    .toLowerCase();

  let paper: UnifiedSearchResult | null = null;
  if (pmid) paper = await fetchSinglePubMed(`${pmid}[uid]`);
  if (!paper && doi) {
    paper = await fetchSinglePubMed(`${doi}[doi]`);
    if (!paper) paper = await fetchCrossrefByDoi(doi);
  }
  if (!paper) return null;

  return {
    ...paper,
    url: resolvePaperUrl(paper),
    id: generatePaperId(paper),
    studyTypeEnum: mapStudyType(paper.studyType),
    verificationStatus: "pending" as const,
    source: determineSource(paper),
    inLibrary: false,
  };
}
