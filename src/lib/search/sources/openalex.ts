import type { UnifiedSearchResult } from "@/types/search";
import { mapOpenAlexType, getEvidenceLevel } from "@/lib/search/evidence-level";
import { resilientFetch } from "@/lib/http/resilient-fetch";
import { createCircuitBreaker } from "@/lib/http/circuit-breaker";
import { createOutboundLimiter } from "@/lib/http/outbound-limiter";
import {
  classifyFetchError,
  okStatus,
  type SourceStatus,
} from "@/lib/search/source-status";

const breaker = createCircuitBreaker({ service: "OpenAlex", failureThreshold: 5 });

/**
 * Strip OpenAlex full-text wildcard operators (`?` and `*`) from a free-text
 * search term. OpenAlex's default `search` is stemmed and rejects wildcards with
 * HTTP 400 ("Wildcards (* or ?) require exact (no-stem) search"), so a natural-
 * language / PICO question ("...reduce cardiovascular mortality?") silently kills
 * the whole OpenAlex lane. These characters are punctuation here, never an
 * intended wildcard, so we drop them and collapse the resulting whitespace.
 */
export function sanitizeOpenAlexSearch(query: string): string {
  return query.replace(/[?*]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * OpenAlex retired the email "polite pool" (Feb 2026); a free API key is now
 * required for reliable, un-throttled access (free tier: ~1,000 search +
 * 10,000 list calls/day). Append `&api_key=` when `OPENALEX_API_KEY` is set;
 * fall back to mailto (rate-limited / best-effort) when it is not.
 */
function oaAuth(): string {
  const key = process.env.OPENALEX_API_KEY;
  return key
    ? `&api_key=${encodeURIComponent(key)}`
    : "&mailto=contact@scholarsync.com";
}

// Outbound token-bucket limiter for OpenAlex (search + semantic + enrichment =
// 2-4 calls/query). Paces to stay under the rate and prevent self-inflicted 429s,
// while a small burst lets the lexical + semantic lanes proceed concurrently.
const openAlexLimiter = createOutboundLimiter({
  service: "OpenAlex",
  requestsPerSecond: 8,
  burst: 4,
});
const paceOpenAlex = () => openAlexLimiter.acquire();

interface OpenAlexSearchOptions {
  limit?: number;
  page?: number;
  yearStart?: number;
  yearEnd?: number;
  onlyOpenAccess?: boolean;
  type?: string;
}

interface OpenAlexWork {
  id: string;
  doi: string | null;
  title: string;
  display_name: string;
  publication_year: number;
  type: string;
  cited_by_count: number;
  is_oa: boolean;
  open_access: { is_oa: boolean; oa_url: string | null } | null;
  authorships: {
    author: { display_name: string };
    institutions: { display_name: string }[];
  }[];
  primary_location: {
    source: { display_name: string } | null;
  } | null;
  abstract_inverted_index: Record<string, number[]> | null;
  concepts: { display_name: string; level: number; score: number }[];
}

interface OpenAlexResponse {
  meta: { count: number; per_page: number; page: number };
  results: OpenAlexWork[];
}

function reconstructAbstract(
  invertedIndex: Record<string, number[]> | null
): string {
  if (!invertedIndex) return "";
  const words: [string, number][] = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const pos of positions) {
      words.push([word, pos]);
    }
  }
  words.sort((a, b) => a[1] - b[1]);
  return words.map((w) => w[0]).join(" ");
}

function mapWork(work: OpenAlexWork): UnifiedSearchResult {
  const studyType = mapOpenAlexType(work.type || "");
  const evidence = getEvidenceLevel(studyType);
  const doi = work.doi ? work.doi.replace("https://doi.org/", "") : undefined;

  return {
    title: work.display_name || work.title || "",
    authors: work.authorships?.map((a) => a.author.display_name) || [],
    journal: work.primary_location?.source?.display_name || "",
    year: work.publication_year || 0,
    doi,
    openalexId: work.id,
    abstract: reconstructAbstract(work.abstract_inverted_index) || undefined,
    citationCount: work.cited_by_count || 0,
    isOpenAccess: work.is_oa || false,
    openAccessPdfUrl: work.open_access?.oa_url || null,
    publicationTypes: work.type ? [work.type] : [],
    concepts: work.concepts
      ?.filter((c) => c.score > 0.3)
      .map((c) => c.display_name) || [],
    studyType,
    evidenceLevel: evidence.level,
    sources: ["openalex"],
  };
}

interface OpenAlexEnrichWork {
  id: string;
  ids?: { pmid?: string; doi?: string };
  doi: string | null;
  cited_by_count: number;
  open_access?: { is_oa: boolean; oa_url: string | null } | null;
  concepts?: { display_name: string; score: number }[];
}

function pmidFromOaIds(ids?: { pmid?: string }): string | undefined {
  if (!ids?.pmid) return undefined;
  return ids.pmid.replace("https://pubmed.ncbi.nlm.nih.gov/", "").replace(/\/$/, "");
}
function normDoi(doi: string | null | undefined): string | undefined {
  if (!doi) return undefined;
  return doi.toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, "");
}

async function fetchOpenAlexBatch(
  filter: string
): Promise<OpenAlexEnrichWork[]> {
  const url = `https://api.openalex.org/works?filter=${filter}&per_page=50${oaAuth()}&select=id,doi,ids,cited_by_count,open_access,concepts`;
  await paceOpenAlex();
  const res = await resilientFetch(url, {}, { service: "OpenAlex", timeout: 8000, maxRetries: 2 });
  const data: { results?: OpenAlexEnrichWork[] } = await res.json();
  return data.results ?? [];
}

/**
 * Backfill citation counts (and open-access / concept metadata) on results that
 * lack them, by looking them up in OpenAlex by PMID/DOI in batch. This is the
 * S2-independent citation signal: PubMed returns citationCount=0, so without
 * this the quality ranker has no citation/landmark signal. Fail-open: on any
 * error the results are returned unchanged. Mutates in place; returns the count
 * enriched.
 */
export async function enrichCitationsByIds(
  results: UnifiedSearchResult[]
): Promise<number> {
  if (!breaker.canRequest()) return 0;
  // Anything with a PMID or DOI that is missing a citation count, a PMID, or a
  // DOI is worth a lookup (OpenAlex backfills all three from its id graph).
  const needs = results.filter(
    (r) => (r.pmid || r.doi) && (!r.citationCount || !r.pmid || !r.doi)
  );
  if (needs.length === 0) return 0;

  const pmids = [...new Set(needs.map((r) => r.pmid).filter(Boolean))] as string[];
  const dois = [
    ...new Set(
      needs.filter((r) => !r.pmid).map((r) => normDoi(r.doi)).filter(Boolean)
    ),
  ] as string[];

  const byPmid = new Map<string, OpenAlexEnrichWork>();
  const byDoi = new Map<string, OpenAlexEnrichWork>();
  try {
    const batches: Promise<OpenAlexEnrichWork[]>[] = [];
    for (let i = 0; i < pmids.length; i += 50) {
      batches.push(fetchOpenAlexBatch(`pmid:${pmids.slice(i, i + 50).join("|")}`));
    }
    for (let i = 0; i < dois.length; i += 50) {
      const enc = dois.slice(i, i + 50).map((d) => encodeURIComponent(d)).join("|");
      batches.push(fetchOpenAlexBatch(`doi:${enc}`));
    }
    const all = (await Promise.all(batches)).flat();
    for (const w of all) {
      const pmid = pmidFromOaIds(w.ids);
      const doi = normDoi(w.doi ?? w.ids?.doi);
      if (pmid) byPmid.set(pmid, w);
      if (doi) byDoi.set(doi, w);
    }
    breaker.onSuccess();
  } catch (error) {
    breaker.onFailure();
    console.error("[OpenAlex] Citation enrichment failed:", error);
    return 0;
  }

  let enriched = 0;
  for (const r of needs) {
    const w =
      (r.pmid && byPmid.get(r.pmid)) || (normDoi(r.doi) && byDoi.get(normDoi(r.doi)!));
    if (!w) continue;
    // Backfill a missing PMID from OpenAlex's id graph (DOI-only / OpenAlex /
    // Crossref results that are in fact indexed in PubMed).
    if (!r.pmid) {
      const oaPmid = pmidFromOaIds(w.ids);
      if (oaPmid) r.pmid = oaPmid;
    }
    if (!r.doi) {
      const oaDoi = normDoi(w.doi ?? w.ids?.doi);
      if (oaDoi) r.doi = oaDoi;
    }
    r.citationCount = w.cited_by_count || r.citationCount || 0;
    if (w.open_access?.is_oa) {
      r.isOpenAccess = true;
      r.openAccessPdfUrl = r.openAccessPdfUrl || w.open_access.oa_url || null;
    }
    if (!r.openalexId) r.openalexId = w.id;
    if (w.concepts?.length && !r.concepts?.length) {
      r.concepts = w.concepts.filter((c) => c.score > 0.3).map((c) => c.display_name);
    }
    if (!r.sources.includes("openalex")) r.sources.push("openalex");
    enriched++;
  }
  return enriched;
}

export async function searchOpenAlex(
  query: string,
  options: OpenAlexSearchOptions = {}
): Promise<{ results: UnifiedSearchResult[]; total: number; status: SourceStatus }> {
  if (!breaker.canRequest()) {
    console.warn("[OpenAlex] Circuit open — skipping");
    return {
      results: [],
      total: 0,
      status: { status: "error", message: "Circuit breaker open — recent OpenAlex failures" },
    };
  }

  const limit = options.limit || 20;
  const page = options.page || 1;

  let url = `https://api.openalex.org/works?search=${encodeURIComponent(
    sanitizeOpenAlexSearch(query)
  )}&per_page=${limit}&page=${page}${oaAuth()}`;

  const filters: string[] = [];
  if (options.yearStart && options.yearEnd) {
    filters.push(`publication_year:${options.yearStart}-${options.yearEnd}`);
  } else if (options.yearStart) {
    filters.push(`publication_year:${options.yearStart}-`);
  } else if (options.yearEnd) {
    filters.push(`publication_year:-${options.yearEnd}`);
  }
  if (options.onlyOpenAccess) {
    filters.push("is_oa:true");
  }
  if (options.type) {
    filters.push(`type:${options.type}`);
  }
  if (filters.length > 0) {
    url += `&filter=${filters.join(",")}`;
  }

  try {
    await paceOpenAlex();
    // Fail fast: a search lane races the fan-out deadline, so retrying a down/slow
    // OpenAlex (2 retries × 15s ≈ 45s) only starves the other lanes' event-loop
    // continuations without ever landing in time. One 6s attempt — if it's up it
    // answers well under that; if it's down we drop it and lean on PubMed + dense.
    const res = await resilientFetch(url, {}, { service: "OpenAlex", timeout: 6000, maxRetries: 0 });
    const data: OpenAlexResponse = await res.json();
    const results = (data.results || []).map(mapWork);

    breaker.onSuccess();
    return { results, total: data.meta?.count || 0, status: okStatus() };
  } catch (error) {
    breaker.onFailure();
    console.error("[OpenAlex] Search failed:", error);
    return { results: [], total: 0, status: classifyFetchError(error) };
  }
}
