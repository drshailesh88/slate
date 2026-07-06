/**
 * Ranking + annotation pipeline.
 *
 * Pure transform (the only side effects are the in-place enrichers it calls):
 *   fused results → enrich study types → enrich journal quality →
 *   quality rank (or recency sort) → annotate each result with a ranking trace,
 *   missing-metadata flags, and a deterministic "why this matters" line.
 *
 * Kept separate from `run-search.ts` (which owns the network fan-out) so the
 * ranking logic is deterministic and unit-testable without hitting any API.
 */

import type { RankingTrace, UnifiedSearchResult } from "@/types/search";
import {
  rankWithTrace,
  enrichJournalQuality,
  configForIntent,
  RELEVANCE_GATE_FLOOR,
  type ScoredResult,
  type RankingIntent,
} from "./quality-ranker";
import { enrichStudyTypes } from "./study-type-detector";
import { getEvidenceLevel } from "./evidence-level";
import { diversifyTopK } from "./diversity";

const STOPWORDS = new Set([
  "the", "are", "what", "how", "does", "do", "and", "for", "with", "from",
  "this", "that", "have", "has", "been", "were", "was", "its", "can", "may",
  "not", "but", "all", "any", "which", "their", "them", "than", "these",
  "those", "when", "will", "into", "over", "some", "could", "would", "should",
  "about", "between", "through", "versus", "vs", "compared", "compare",
  "effect", "effects", "outcome", "outcomes", "impact", "results", "patients",
  "adults", "risk", "trial", "trials", "study", "studies", "latest", "newest",
  "recent", "year", "years",
]);

function keywords(query: string): string[] {
  return [
    ...new Set(
      query
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
    ),
  ];
}

function titleTokenSet(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
  );
}

/**
 * Index of a result whose title is a near-verbatim match of the query — i.e. the
 * user did an exact-paper lookup by pasting a title. Uses a high Jaccard overlap
 * (≥0.85) so only a title with essentially the SAME token set qualifies: a longer
 * review that merely *contains* every query token is excluded. Gated to title-like
 * queries (≥6 tokens, not a question) so keyword/acronym/PICO queries never trigger.
 * Returns -1 when there is no exact-title match.
 */
export function exactTitleMatchIndex(
  results: UnifiedSearchResult[],
  query: string
): number {
  const q = query.trim();
  if (q.endsWith("?")) return -1;
  const qTokens = titleTokenSet(q);
  if (qTokens.size < 6) return -1;
  let best = -1;
  let bestJaccard = 0;
  for (let i = 0; i < results.length; i++) {
    const tTokens = titleTokenSet(results[i].title ?? "");
    if (tTokens.size === 0) continue;
    let inter = 0;
    for (const t of qTokens) if (tTokens.has(t)) inter++;
    const jaccard = inter / (qTokens.size + tTokens.size - inter);
    if (jaccard >= 0.85 && jaccard > bestJaccard) {
      bestJaccard = jaccard;
      best = i;
    }
  }
  return best;
}

function boostExactTitle(
  results: UnifiedSearchResult[],
  query: string
): UnifiedSearchResult[] {
  const idx = exactTitleMatchIndex(results, query);
  if (idx <= 0) return results; // no match, or already first
  return [results[idx], ...results.slice(0, idx), ...results.slice(idx + 1)];
}

/** Missing / low-confidence metadata + integrity flags, surfaced not hidden. */
export function buildFlags(r: UnifiedSearchResult): string[] {
  const flags = new Set<string>(r.flags ?? []);
  if (!r.doi) flags.add("missing_doi");
  if (!r.pmid) flags.add("missing_pmid");
  if (!r.year) flags.add("missing_year");
  if (!r.journal) flags.add("missing_journal");
  if (!r.citationCount) flags.add("missing_citation_count");
  if (!r.journalQuartile) flags.add("unrated_journal");
  if (!r.studyType || r.studyType === "other") flags.add("unclassified_study_type");
  if (!r.abstract) flags.add("missing_abstract");

  // Research-integrity signals from PubMed publication types / Crossref updates.
  const pubTypes = (r.publicationTypes ?? []).join(" ").toLowerCase();
  if (pubTypes.includes("retracted publication")) flags.add("retracted");
  if (
    pubTypes.includes("retraction of publication") ||
    pubTypes.includes("published erratum") ||
    pubTypes.includes("erratum")
  ) {
    flags.add("correction_or_retraction_notice");
  }
  return [...flags];
}

/** Deterministic, template-based explanation (never an LLM — no hallucination). */
export function buildWhyRelevant(
  r: UnifiedSearchResult,
  matchedTerms: string[]
): string {
  const parts: string[] = [];
  const ev = getEvidenceLevel(r.studyType ?? "other");
  if (r.studyType && r.studyType !== "other") {
    parts.push(`${ev.label} (Level ${ev.level})`);
  }
  if (r.year) parts.push(String(r.year));
  if (r.citationCount && r.citationCount > 0) {
    parts.push(`${r.citationCount.toLocaleString()} citations`);
  }
  if (r.journalQuartile) parts.push(`${r.journalQuartile} journal`);
  if (r.nctId) parts.push(`registered trial ${r.nctId}`);
  if (matchedTerms.length > 0) parts.push(`matches: ${matchedTerms.slice(0, 5).join(", ")}`);
  return parts.join(" · ");
}

function annotate(
  scored: ScoredResult,
  strategy: RankingTrace["strategy"],
  queryTerms: string[]
): UnifiedSearchResult {
  const { result, composite, signals } = scored;
  const text = `${result.title} ${result.abstract ?? ""}`.toLowerCase();
  const matched = queryTerms.filter((t) => text.includes(t));
  const trace: RankingTrace = {
    composite: Math.round(composite * 10000) / 10000,
    evidence: Math.round(signals.evidence * 1000) / 1000,
    citation: Math.round(signals.citation * 1000) / 1000,
    velocity: Math.round(signals.velocity * 1000) / 1000,
    journal: Math.round(signals.journal * 1000) / 1000,
    rrf: Math.round(signals.rrf * 1000) / 1000,
    relevance: Math.round(signals.relevance * 1000) / 1000,
    entityDrift: Math.round(signals.entityDrift * 1000) / 1000,
    strategy,
  };
  const flags = buildFlags(result);
  // Surface (don't hide) that this result was demoted as off-subtype / off-drug.
  if (signals.entityDrift < 1 && !flags.includes("off_topic_entity")) {
    flags.push("off_topic_entity");
  }
  return {
    ...result,
    rrfScore: trace.composite,
    rankingTrace: trace,
    flags,
    whyRelevant: buildWhyRelevant(result, matched),
  };
}

export interface RankAndAnnotateOptions {
  query: string;
  /** When true, order by recency (newest first), keeping the quality trace. */
  recency?: boolean;
  /** When true (a trial-acronym/NCT lookup), float the primary trial report above
   *  its meta-analyses, sub-studies, and follow-ups. */
  isTrialLookup?: boolean;
  /** When true (a guideline/consensus lookup), float the authoritative guideline
   *  document — newest version first — above primary literature. */
  isGuidelineLookup?: boolean;
  /** Intent captured by the UI (Landmark/Latest chip): re-weights the citation vs
   *  recency tie-breaker the cross-encoder can't resolve. Defaults to balanced. */
  rankingIntent?: RankingIntent;
}

/**
 * How strongly recency amplifies a paper's quality composite. The boost is
 * MULTIPLICATIVE (`composite × (1 + RECENCY_BOOST × recencyNorm)`) rather than an
 * additive term, so recency scales quality instead of substituting for it: a
 * pivotal high-composite trial (e.g. CLARITY-AD) cannot be displaced from the top
 * by a stream of recent low-value papers, while among similar-quality papers the
 * newer one still wins. 0.5 ⇒ the newest paper is worth up to 1.5× its composite.
 */
export const RECENCY_BOOST = 0.5;

/** Page size diversified by MMR, and its relevance-vs-diversity trade-off. λ high
 *  (0.78) keeps relevance dominant — diversity only breaks near-duplicate ties. */
export const MMR_PAGE = 10;
export const MMR_LAMBDA = 0.78;

/**
 * Recency-aware rank key. `recencyNorm` scales the year into [0,1] over the
 * result set (newest = 1); the composite is amplified by up to RECENCY_BOOST.
 * A zero span (all one year) leaves the composite unchanged.
 */
export function recencyRankKey(
  composite: number,
  year: number,
  minYear: number,
  span: number
): number {
  const recencyNorm =
    span > 0 ? Math.min(1, Math.max(0, (year - minYear) / span)) : 0;
  return composite * (1 + RECENCY_BOOST * recencyNorm);
}

/**
 * Hard rerank-window boundary (Lever 1 / F2). Any candidate the cross-encoder
 * scored (a model `rerankScore`) is placed strictly ABOVE any candidate it did
 * NOT score — the un-reranked tail beyond the rerank depth, whose relevance is a
 * saturating keyword-overlap fallback that can otherwise out-sort a calibrated
 * model score. Stable within each partition, so the incoming composite order is
 * preserved inside the reranked set and inside the tail. A no-op when every
 * candidate was reranked (the common case now that the whole pool is reranked) or
 * none was (reranker absent / skipped → all lexical → single partition). This is
 * the "reranked-on-top, non-reranked strictly below" window semantics the IR
 * literature converges on (Elasticsearch #120670; sbert/BEIR/Cohere).
 */
function rerankedAboveTail(scored: ScoredResult[]): ScoredResult[] {
  const reranked: ScoredResult[] = [];
  const tail: ScoredResult[] = [];
  for (const s of scored) {
    if (typeof s.result.rerankScore === "number") reranked.push(s);
    else tail.push(s);
  }
  if (reranked.length === 0 || tail.length === 0) return scored;
  return [...reranked, ...tail];
}

function orderByRecency(scored: ScoredResult[]): ScoredResult[] {
  const years = scored.map((s) => s.result.year || 0).filter(Boolean);
  const minY = years.length ? Math.min(...years) : 0;
  const maxY = years.length ? Math.max(...years) : 0;
  const span = Math.max(1, maxY - minY);
  return [...scored]
    .map((s) => ({
      s,
      key: recencyRankKey(s.composite, s.result.year || minY, minY, span),
    }))
    .sort((a, b) => b.key - a.key)
    .map((x) => x.s);
}

/**
 * Enrich, rank, and annotate fused search results. Returns a new array; the
 * input objects are enriched in place (study type + journal quality) as a
 * deliberate, contained side effect of the enrichers.
 */
export function rankAndAnnotate(
  results: UnifiedSearchResult[],
  opts: RankAndAnnotateOptions
): UnifiedSearchResult[] {
  if (results.length === 0) return [];

  enrichStudyTypes(results);
  enrichJournalQuality(results);

  // Intent-aware weighting: the UI's Landmark/Latest chip re-weights the tie-breaker
  // (citation vs recency) that the cross-encoder cannot resolve. Defaults to balanced.
  const scored = rankWithTrace(
    results,
    opts.query,
    configForIntent(opts.rankingIntent)
  );
  const queryTerms = keywords(opts.query);

  const recencyOrder = opts.recency || opts.rankingIntent === "recent";
  let ordered = scored;
  if (recencyOrder) {
    // Recency amplifies the quality composite multiplicatively (see
    // recencyRankKey) instead of an additive year term — so a pivotal
    // high-composite trial (e.g. CLARITY-AD) is not buried under a stream of
    // recent low-value papers, while among similar-quality papers the newer wins.
    ordered = orderByRecency(scored);
  }
  // Enforce the rerank-window boundary on the composite order: a calibrated
  // model relevance never loses its slot to a saturating lexical-overlap score
  // from an un-reranked tail candidate. No-op in the common all-reranked path.
  ordered = rerankedAboveTail(ordered);

  const annotated = ordered.map((s) =>
    annotate(s, recencyOrder ? "recency" : "quality", queryTerms)
  );

  // Exact-paper lookup: if the user pasted a paper title, that paper must rank #1
  // even if related meta-analyses out-score it on citations. Field-standard
  // exact-match boosting, gated tightly so only verbatim-title queries trigger.
  const boosted = boostExactTitle(annotated, opts.query);

  // Trial secondary-report demotion RETIRED (2026-07): its title-marker table
  // ("registry", "N-year", "economic outcomes") was reverse-engineered from specific
  // benchmark trials. The restored citation signal already floats a trial's primary
  // report (heavily cited) above its sub-studies; kept out of the path pending deletion.
  const trialOrdered = boosted;

  // Guideline lookup: float the authoritative guideline document (newest version
  // first) above primary literature. Only raises guidelines; non-guideline order
  // preserved. Done BEFORE demoteRetracted so a retracted guideline still sinks.
  const guidelinePromoted = opts.isGuidelineLookup
    ? promoteGuidelines(trialOrdered)
    : trialOrdered;

  // Demote (never drop) retracted papers so they cannot occupy a top slot while
  // still being surfaced with their flag. Stable: preserves order within groups.
  const cleaned = demoteRetracted(guidelinePromoted);

  // Diversify the page (MMR) for BROAD topic queries only. Skipped for exact-paper
  // lookups (the user wants that one paper), trial-acronym lookups (primary-report
  // ordering is the whole point), guideline lookups (we want the authoritative doc
  // + its versions clustered at top), and recency sorts (newest-first is the intent).
  // MMR reorders only WITHIN the top page, so the top-K set — and recall@k — is
  // unchanged; it only prevents a page of five near-identical findings.
  const isExactLookup = exactTitleMatchIndex(cleaned, opts.query) >= 0;
  const shouldDiversify =
    !opts.isTrialLookup && !opts.recency && !isExactLookup && !opts.isGuidelineLookup;
  return shouldDiversify
    ? diversifyTopK(cleaned, { k: MMR_PAGE, lambda: MMR_LAMBDA, anchor: 1 })
    : cleaned;
}

/**
 * A guideline is only floated to the top if it actually answers the query. An
 * "ESC heart-failure guideline" must not surface for a kidney-transplant search
 * just because it is typed as a guideline. Promotion is RELEVANCE-AWARE: a
 * guideline is eligible only when it is not demonstrably off-topic, i.e. it carries
 * no off_topic_entity drift flag AND (its lexical/model relevance is unknown, or it
 * clears the relevance floor). An off-topic guideline is left in place and ordered
 * by its quality composite like any other result — never raised.
 */
function isPromotableGuideline(r: UnifiedSearchResult): boolean {
  if (r.studyType !== "guideline") return false;
  if (r.flags?.includes("off_topic_entity")) return false;
  const relevance = r.rankingTrace?.relevance;
  if (typeof relevance === "number" && relevance < RELEVANCE_GATE_FLOOR) return false;
  return true;
}

/**
 * Composite-descending comparator with year as a TIE-BREAKER only. The input is
 * already composite-sorted, so this preserves the quality order among guidelines
 * and only uses the newer version to break an otherwise-equal ranking (so the 2024
 * edition floats above the 2012 one when their composites are equal).
 */
function byCompositeThenYear(
  a: UnifiedSearchResult,
  b: UnifiedSearchResult
): number {
  const ca = a.rankingTrace?.composite ?? a.rrfScore ?? 0;
  const cb = b.rankingTrace?.composite ?? b.rrfScore ?? 0;
  if (cb !== ca) return cb - ca;
  return (b.year || 0) - (a.year || 0);
}

/**
 * Float clinical-practice-guideline documents to the top, ordered by quality
 * composite with the newest version as a tie-breaker. Only RAISES guidelines that
 * are relevant (see {@link isPromotableGuideline}); off-topic guidelines and every
 * non-guideline result keep their relative order. A no-op when the pool has no
 * promotable guideline. Gated by `isGuidelineLookup` in rankAndAnnotate so ordinary
 * clinical queries are untouched.
 */
export function promoteGuidelines(
  results: UnifiedSearchResult[]
): UnifiedSearchResult[] {
  const promotable: UnifiedSearchResult[] = [];
  const rest: UnifiedSearchResult[] = [];
  for (const r of results) {
    if (isPromotableGuideline(r)) promotable.push(r);
    else rest.push(r);
  }
  if (promotable.length === 0) return results;
  const ordered = [...promotable].sort(byCompositeThenYear);
  return [...ordered, ...rest];
}

function demoteRetracted(results: UnifiedSearchResult[]): UnifiedSearchResult[] {
  const clean: UnifiedSearchResult[] = [];
  const retracted: UnifiedSearchResult[] = [];
  for (const r of results) {
    if (r.flags?.includes("retracted")) retracted.push(r);
    else clean.push(r);
  }
  return retracted.length ? [...clean, ...retracted] : results;
}
