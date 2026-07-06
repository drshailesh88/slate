import type { UnifiedSearchResult, EvidenceLevel } from "@/types/search";
import { lookupJournalQuality } from "./journal-quality";

// ── Configuration ───────────────────────────────────────────────────

export interface QualityRankingConfig {
  /** Weight for evidence level signal (0-1) */
  evidenceWeight: number;
  /** Weight for citation count signal (0-1) */
  citationWeight: number;
  /** Weight for citation velocity (citations/year) signal (0-1) */
  velocityWeight: number;
  /** Weight for journal quartile signal (0-1) */
  journalWeight: number;
  /** Weight for original RRF score (0-1) */
  rrfWeight: number;
  /** Weight for query relevance signal (0-1) — cross-encoder rerank score when present */
  relevanceWeight: number;
}

/**
 * Metadata-dominant weights — the EXACT validated config (the ranking the LLM
 * council scored 4/6). The clinical-quality signals (evidence hierarchy, citations,
 * journal, RRF prior) carry the ranking; relevance is ONE capped signal, not the
 * ruler. Used whether or not a cross-encoder ran — the only difference is the
 * relevance SOURCE (a [0,1]-normalized cross-encoder score when present, else
 * keyword overlap). Weights sum to 1.
 *
 * This replaced a "rerank-dominant" config (relevanceWeight 0.40). The cross-encoder
 * score now arrives already squashed to [0,1] (the reranker adapter applies the
 * sigmoid read-out — see `rerank.ts`), so it is commensurate with the other signals;
 * capping its weight at 0.30 keeps it from overruling the clinical-quality priors. The
 * earlier pathology — a RAW logit (range ≈ −16…+10) summed against [0,1] signals, where
 * a single negative logit on a trial's primary report drove the composite to ≈ −2.8 and
 * buried the correct answer beneath acronym-mentioning secondaries — is fixed at the
 * source (measured: trial-acronym recall 0.72 → 0.85+ on the 87q harness).
 */
const BALANCED_CONFIG: QualityRankingConfig = {
  evidenceWeight: 0.16,
  citationWeight: 0.07,
  velocityWeight: 0.0,
  journalWeight: 0.07,
  rrfWeight: 0.20,
  relevanceWeight: 0.50,
};

/**
 * Ranking intent — the one fact the ranker cannot infer from the query text, so the
 * UI captures it (the "Landmark / Latest / Exhaustive" chip) and passes it down. It
 * only re-weights the tie-breaker signals; relevance stays dominant in every mode.
 *   - "landmark": the user wants the foundational trials. Nearly triples the citation
 *     weight (0.07 → 0.18, drawn from RRF) so a heavily-cited landmark floats past the
 *     recent lookalikes the cross-encoder ties it with. Resolves the measured
 *     "PARTNER trials" vs "six-year outcomes" ambiguity (same paper, opposite intent).
 *   - "recent": the user wants the newest evidence. Citations are near-muted (0.07 →
 *     0.02) so a 3,000-cite classic can't crowd out this year's trial; recency ordering
 *     is driven separately via the recency flag.
 *   - "balanced" (default): the validated config, used when no intent is given.
 */
export type RankingIntent = "landmark" | "recent" | "balanced";

const LANDMARK_CONFIG: QualityRankingConfig = {
  ...BALANCED_CONFIG,
  citationWeight: 0.18,
  rrfWeight: 0.09,
};

const RECENT_CONFIG: QualityRankingConfig = {
  ...BALANCED_CONFIG,
  citationWeight: 0.02,
  rrfWeight: 0.25,
};

export function configForIntent(intent?: RankingIntent): QualityRankingConfig {
  if (intent === "landmark") return LANDMARK_CONFIG;
  if (intent === "recent") return RECENT_CONFIG;
  return BALANCED_CONFIG;
}

/**
 * Relevance GATE. The weighted composite alone let off-topic mega-cited papers
 * (e.g. PRISMA: Level I, Q1, 83k citations) out-score a perfectly relevant but
 * recent, 0-citation paper, because the clinical priors maxed out while relevance
 * was just one term. The gate makes relevance NECESSARY: the whole composite is
 * multiplied by min(1, relevance / FLOOR), so a paper the cross-encoder scores
 * below the floor is crushed no matter how prestigious it is, while everything at
 * or above the floor is unpenalized and ordered by the quality priors as before.
 */
export const RELEVANCE_GATE_FLOOR = 0.45;

/**
 * Stricter gate floor for the LEXICAL fallback. A real cross-encoder rerankScore is
 * a calibrated topical-relevance probability, so the 0.45 floor is meaningful for it.
 * A keyword-overlap score is NOT a probability — a generic paper that shares a couple
 * of filler words ("management", "treatment") can post a deceptively high overlap. So
 * when relevance is lexical we demand a higher overlap before treating the paper as
 * "relevant", as defense-in-depth: an off-topic high-citation paper cannot ride a few
 * shared generic words past the gate even if the reranker signal is ever missing.
 */
export const LEXICAL_RELEVANCE_GATE_FLOOR = 0.6;

/**
 * Where the relevance signal came from:
 *  - "model"   — a real cross-encoder rerankScore (calibrated [0,1] probability)
 *  - "lexical" — keyword-overlap fallback (NOT a probability; gated more strictly)
 *  - "neutral" — no query keywords to score against (gate is a no-op)
 */
export type RelevanceSource = "model" | "lexical" | "neutral";

function relevanceGate(relevance: number, source: RelevanceSource): number {
  if (source === "neutral") return 1; // nothing to gate on — leave the composite intact
  const floor =
    source === "lexical" ? LEXICAL_RELEVANCE_GATE_FLOOR : RELEVANCE_GATE_FLOOR;
  return Math.min(1, relevance / floor);
}

// ── Signal normalizers ──────────────────────────────────────────────

const EVIDENCE_SCORES: Record<EvidenceLevel, number> = {
  I: 1.0,
  II: 0.8,
  III: 0.6,
  IV: 0.3,
  V: 0.1,
};

function normalizeEvidence(level: EvidenceLevel | undefined): number {
  return EVIDENCE_SCORES[level ?? "V"];
}

/**
 * Log-scale normalization of citation counts, capped at the 99th percentile
 * of the result set to prevent extreme outliers from dominating.
 */
function normalizeCitations(count: number, cap: number): number {
  if (cap <= 0) return 0;
  const clamped = Math.min(count, cap);
  if (clamped <= 0) return 0;
  return Math.log1p(clamped) / Math.log1p(cap);
}

/** Citations per year since publication — separates fast-rising work from old-but-stale. */
function citationVelocity(count: number, year: number, currentYear: number): number {
  if (!count || !year) return 0;
  const age = Math.max(1, currentYear - year + 1);
  return count / age;
}

function normalizeVelocity(velocity: number, cap: number): number {
  if (cap <= 0 || velocity <= 0) return 0;
  return Math.log1p(Math.min(velocity, cap)) / Math.log1p(cap);
}

const QUARTILE_SCORES: Record<string, number> = {
  Q1: 1.0,
  Q2: 0.7,
  Q3: 0.4,
  Q4: 0.2,
};

function normalizeJournalQuartile(
  quartile: "Q1" | "Q2" | "Q3" | "Q4" | null | undefined
): number {
  if (!quartile) return 0.1; // Unknown journal
  return QUARTILE_SCORES[quartile] ?? 0.1;
}

function normalizeRrf(score: number | undefined, maxScore: number): number {
  if (!score || maxScore <= 0) return 0;
  return score / maxScore;
}

// ── Query relevance scoring ─────────────────────────────────────────

const STOPWORDS = new Set([
  "the", "are", "what", "how", "does", "and", "for", "with",
  "from", "this", "that", "have", "been", "were", "was", "its",
  "can", "may", "not", "but", "all", "any", "each", "which",
  "their", "them", "than", "these", "those", "when", "will",
  "into", "over", "some", "could", "would", "should", "about",
  "between", "through", "compare", "versus", "effect", "effects",
  "outcome", "outcomes", "impact", "result", "results", "find",
  "key", "trials", "study", "studies",
]);

function extractQueryKeywords(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

/**
 * Generic clinical "filler" tokens. They survive stopword removal (they are not
 * grammatical glue) yet carry almost no discriminative power for WHICH paper is on
 * topic — every clinical corpus is saturated with them. Matching one of these is
 * weak evidence of relevance, so they are heavily down-weighted in the lexical
 * overlap score. Listed in both singular and plural so exact-token matching is
 * enough (no fragile stemming that would also catch "advanced", "patient-reported").
 */
const GENERIC_FILLER_TOKENS = new Set([
  "recent", "advance", "advances", "management", "treatment", "treatments",
  "guideline", "guidelines", "recommendation", "recommendations", "role", "roles",
  "update", "updates", "overview", "overviews", "clinical", "patient", "patients",
]);

const GENERIC_TOKEN_WEIGHT = 0.25;
const DISTINCTIVE_TOKEN_WEIGHT = 1.5;
const BASELINE_TOKEN_WEIGHT = 1.0;

/**
 * Relevance weight of a single query token. Generic filler is nearly discounted;
 * long tokens (≥8 chars — drug names, conditions, mechanisms like "tocilizumab",
 * "empagliflozin", "ferroptosis") are treated as rare/distinctive and up-weighted,
 * so matching one of them is strong evidence of on-topic relevance.
 */
function keywordWeight(kw: string): number {
  if (GENERIC_FILLER_TOKENS.has(kw)) return GENERIC_TOKEN_WEIGHT;
  return kw.length >= 8 ? DISTINCTIVE_TOKEN_WEIGHT : BASELINE_TOKEN_WEIGHT;
}

/**
 * Weighted keyword overlap between a paper and the query, in [0,1]. Unlike a plain
 * matched/total ratio, each token contributes its discriminative weight: a paper
 * that matches only generic filler ("management", "treatment") scores near zero,
 * while one that matches the distinctive disease/drug terms scores near one. This
 * is the LEXICAL fallback used only when no cross-encoder rerankScore is available;
 * it must never let a few shared generic words masquerade as semantic relevance.
 */
function computeRelevance(
  result: UnifiedSearchResult,
  queryKeywords: string[]
): number {
  if (queryKeywords.length === 0) return 0.5;

  const text = [
    result.title,
    result.abstract || "",
  ]
    .join(" ")
    .toLowerCase();

  let matchedWeight = 0;
  let totalWeight = 0;
  for (const kw of queryKeywords) {
    const w = keywordWeight(kw);
    totalWeight += w;
    if (text.includes(kw)) matchedWeight += w;
  }
  return totalWeight > 0 ? matchedWeight / totalWeight : 0;
}

// ── Journal quality enrichment ──────────────────────────────────────

/**
 * Enrich results with journal quality data from Scimago.
 * Mutates the results in place for efficiency.
 */
export function enrichJournalQuality(
  results: UnifiedSearchResult[]
): void {
  for (const r of results) {
    if (r.journalQuartile !== undefined) continue; // Already enriched
    if (!r.journal) continue;

    const quality = lookupJournalQuality(r.journal);
    if (quality) {
      r.journalQuartile = quality.quartile;
      r.journalImpactProxy = quality.citesPerDoc2y;
    }
  }
}

// ── Quality ranking ─────────────────────────────────────────────────

export interface QualitySignals {
  evidence: number;
  citation: number;
  velocity: number;
  journal: number;
  rrf: number;
  relevance: number;
  /** Off-entity drift multiplier in (0,1] applied to the composite; 1 = no drift. */
  entityDrift: number;
}

export interface ScoredResult {
  result: UnifiedSearchResult;
  composite: number;
  signals: QualitySignals;
}

interface ScoringContext {
  citationCap: number;
  velocityCap: number;
  currentYear: number;
  maxRrf: number;
  queryKeywords: string[];
  rawQuery: string;
  config: QualityRankingConfig;
}

function buildScoringContext(
  results: UnifiedSearchResult[],
  query: string | undefined,
  config: QualityRankingConfig
): ScoringContext {
  const currentYear = new Date().getFullYear();
  const citations = results.map((r) => r.citationCount || 0).sort((a, b) => a - b);
  const p99Index = Math.floor(citations.length * 0.99);
  const citationCap = citations[p99Index] || 1;
  const velocities = results
    .map((r) => citationVelocity(r.citationCount || 0, r.year, currentYear))
    .sort((a, b) => a - b);
  const velocityCap = velocities[Math.floor(velocities.length * 0.99)] || 1;
  const maxRrf = Math.max(...results.map((r) => r.rrfScore ?? 0), 0.001);
  const queryKeywords = query ? extractQueryKeywords(query) : [];
  return {
    citationCap,
    velocityCap,
    currentYear,
    maxRrf,
    queryKeywords,
    rawQuery: query ?? "",
    config,
  };
}

/**
 * Resolve the relevance signal AND where it came from. A real cross-encoder
 * rerankScore (already squashed to [0,1] by the reranker adapter) is the calibrated
 * "model" signal; absent it we fall back to the weighted keyword overlap ("lexical"),
 * which the gate treats far more conservatively. With no query keywords there is
 * nothing to gate on ("neutral").
 */
function resolveRelevance(
  r: UnifiedSearchResult,
  ctx: ScoringContext
): { value: number; source: RelevanceSource } {
  if (typeof r.rerankScore === "number") {
    return { value: r.rerankScore, source: "model" };
  }
  if (ctx.queryKeywords.length > 0) {
    return { value: computeRelevance(r, ctx.queryKeywords), source: "lexical" };
  }
  return { value: 0.5, source: "neutral" };
}

function scoreResult(r: UnifiedSearchResult, ctx: ScoringContext): ScoredResult {
  const relevance = resolveRelevance(r, ctx);
  const signals: QualitySignals = {
    evidence: normalizeEvidence(r.evidenceLevel),
    citation: normalizeCitations(r.citationCount || 0, ctx.citationCap),
    velocity: normalizeVelocity(
      citationVelocity(r.citationCount || 0, r.year, ctx.currentYear),
      ctx.velocityCap
    ),
    journal: normalizeJournalQuartile(r.journalQuartile),
    rrf: normalizeRrf(r.rrfScore, ctx.maxRrf),
    relevance: relevance.value,
    entityDrift: 1,
  };
  const c = ctx.config;
  const weighted =
    c.evidenceWeight * signals.evidence +
    c.citationWeight * signals.citation +
    c.velocityWeight * signals.velocity +
    c.journalWeight * signals.journal +
    c.rrfWeight * signals.rrf +
    c.relevanceWeight * signals.relevance;
  // Entity-drift penalty RETIRED (2026-07): its hardcoded drug/subtype tables were
  // fit to cardiology/endo/onc benchmark queries and don't transfer to other domains
  // (empty tables → no effect). The restored citation signal + whole-pool rerank now
  // do the general work; kept as a neutral trace field (always 1) pending deletion.
  signals.entityDrift = 1;
  // The gate is SIGNAL-AWARE: a model rerankScore is gated at the calibrated 0.45
  // floor; a lexical overlap is gated more strictly so generic word matches cannot
  // pass as cross-encoder-grade relevance.
  const composite =
    weighted * relevanceGate(signals.relevance, relevance.source);
  return { result: r, composite, signals };
}

/**
 * Score + sort results by the quality composite, returning the per-signal
 * breakdown for each so callers can build a ranking trace / explanation.
 * Call AFTER reciprocalRankFusion() and AFTER enrichJournalQuality().
 */
export function rankWithTrace(
  results: UnifiedSearchResult[],
  query?: string,
  config?: QualityRankingConfig
): ScoredResult[] {
  if (results.length === 0) return [];
  const ctx = buildScoringContext(results, query, config ?? BALANCED_CONFIG);
  const scored = results.map((r) => scoreResult(r, ctx));
  scored.sort((a, b) => b.composite - a.composite);
  return scored;
}

/**
 * Re-rank results using a weighted composite of evidence level, citation count,
 * journal quartile, original RRF score, and query relevance. Thin wrapper over
 * {@link rankWithTrace} that overwrites `rrfScore` with the composite (legacy shape).
 */
export function qualityRank(
  results: UnifiedSearchResult[],
  query?: string,
  config?: QualityRankingConfig
): UnifiedSearchResult[] {
  if (results.length === 0) return results;
  return rankWithTrace(results, query, config).map(({ result, composite }) => ({
    ...result,
    rrfScore: Math.round(composite * 10000) / 10000,
  }));
}
