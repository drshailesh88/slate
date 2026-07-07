import type { UnifiedSearchResult } from "@/types/search";
import { resilientFetch } from "@/lib/http/resilient-fetch";

interface CohereRerankResponse {
  results: {
    index: number;
    relevance_score: number;
  }[];
}

/** OpenRouter's rerank endpoint mirrors Cohere's v2 shape: a `results` array that
 * pairs each input document back to a [0,1] `relevance_score` by its input `index`
 * (the `document` echo is optional and ignored — we map by index, never by text). */
interface OpenRouterRerankResponse {
  results: {
    index: number;
    relevance_score: number;
    document?: { text: string };
  }[];
  usage?: { search_units?: number; cost?: number };
}

/** A relevance score paired to a candidate's index in the input list. The score
 * is ALWAYS a [0,1] relevance probability regardless of backend — OpenRouter and
 * Cohere return that natively; the MedCPT cross-encoder returns a raw logit which we
 * squash here (see {@link logitToProbability}) so downstream ranking treats every
 * backend the same and never sees an unbounded value. */
type RerankScore = { index: number; relevance_score: number };

/** The OpenRouter rerank model for the academic literature path. Env-overridable
 * via ACADEMIC_RERANK_MODEL; cohere/rerank-4-pro returns a [0,1] relevance score
 * already commensurate with the quality-ranker's relevance signal. Read lazily (not
 * a module-load constant) so tests/deploys can override it via the environment. */
function academicRerankModel(): string {
  return process.env.ACADEMIC_RERANK_MODEL || "cohere/rerank-4-pro";
}

/** Cap each document sent to a reranker. Title + abstract past a few thousand chars
 * adds cost/latency without sharpening the relevance signal (the model truncates
 * internally anyway), so we bound it before the wire. */
const RERANK_DOC_MAX_CHARS = 2000;

/** Title + abstract (or TLDR), trimmed to {@link RERANK_DOC_MAX_CHARS}, as the unit
 * of text every reranker scores against the query. */
function buildRerankDocument(result: UnifiedSearchResult): string {
  const doc = `${result.title}. ${result.abstract || result.tldr || ""}`;
  return doc.length > RERANK_DOC_MAX_CHARS
    ? doc.slice(0, RERANK_DOC_MAX_CHARS)
    : doc;
}

/** Squash a cross-encoder relevance logit (MedCPT range ≈ −16…+10) into the [0,1]
 * probability that `relevance_score` is contracted to carry. Sigmoid is the standard
 * read-out for a single-logit relevance classifier and is monotonic, so it never
 * changes the sort order — only the magnitude, so the score is commensurate with the
 * other [0,1] signals in the quality composite instead of dominating them. */
function logitToProbability(logit: number): number {
  return 1 / (1 + Math.exp(-logit));
}

/** True when SOME reranker is configured. OpenRouter is the PRIMARY literature
 * backend (managed, always-warm); the self-hosted MedCPT cross-encoder and
 * Cohere-direct remain optional fallbacks. */
export function hasReranker(): boolean {
  return Boolean(
    process.env.OPENROUTER_API_KEY ||
      process.env.MEDCPT_RERANK_URL ||
      process.env.COHERE_API_KEY
  );
}

/**
 * Self-hosted cross-encoder (Modal, scale-to-zero) — biomedical MedCPT for the
 * literature path, general bge-reranker for the web path. Both expose the same
 * contract: a raw relevance LOGIT per document IN INPUT ORDER (range ≈ −16…+10),
 * which we squash to a [0,1] probability ({@link logitToProbability}) — the contract
 * every backend's `relevance_score` honors — then pair to indices, sort desc, and
 * trim to `topN`. Throttle-proof — no external rate limit. `service` is the
 * circuit-breaker/log label so each domain's lane is isolated. Fail-open: a cold
 * start that exceeds the timeout (or any error) throws so the caller keeps order.
 */
async function rerankSelfHosted(
  url: string,
  query: string,
  documents: string[],
  topN: number,
  service: string,
  fetchOpts: { timeout: number; maxRetries: number } = { timeout: 15000, maxRetries: 1 }
): Promise<RerankScore[]> {
  const res = await resilientFetch(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, documents }),
    },
    { service, ...fetchOpts }
  );
  const data: { scores?: number[] } = await res.json();
  const scores = Array.isArray(data?.scores) ? data.scores : [];
  return scores
    .map((logit, index) => ({ index, relevance_score: logitToProbability(logit) }))
    .sort((a, b) => b.relevance_score - a.relevance_score)
    .slice(0, topN);
}

/**
 * OpenRouter rerank — the PRIMARY, managed/always-warm literature reranker
 * (model {@link academicRerankModel}, default cohere/rerank-4-pro). POSTs the
 * candidate documents and reads back a [0,1] `relevance_score` per document, paired
 * to its input position by the response `index`. Warm latency ≈ 1.2s, ~$0.0025 per
 * search. Fail-open: a non-200 or timeout throws (resilientFetch) so the caller
 * advances to the next backend instead of returning empty results.
 */
async function rerankOpenRouter(
  apiKey: string,
  query: string,
  documents: string[],
  topN: number
): Promise<RerankScore[]> {
  const response = await resilientFetch(
    "https://openrouter.ai/api/v1/rerank",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: academicRerankModel(),
        query,
        documents,
        top_n: topN,
      }),
    },
    { service: "OpenRouter-Rerank", timeout: 4000, maxRetries: 1 }
  );
  const data: OpenRouterRerankResponse = await response.json();
  const results = Array.isArray(data?.results) ? data.results : [];
  return results
    .filter(
      (r) =>
        typeof r?.index === "number" &&
        typeof r?.relevance_score === "number"
    )
    .map((r) => ({ index: r.index, relevance_score: r.relevance_score }));
}

/** External Cohere reranker (fallback). Returns its already-sorted top-N. */
async function rerankCohere(
  apiKey: string,
  query: string,
  documents: string[],
  topN: number
): Promise<RerankScore[]> {
  const response = await resilientFetch(
    "https://api.cohere.com/v2/rerank",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "rerank-v3.5",
        query,
        documents,
        top_n: topN,
        return_documents: false,
      }),
    },
    { service: "Cohere", timeout: 10000, maxRetries: 2 }
  );
  const data: CohereRerankResponse = await response.json();
  return data.results;
}

/**
 * Rerank by query↔document relevance through a fail-open backend CHAIN.
 *
 * LITERATURE path (default domain): OpenRouter `cohere/rerank-4-pro`
 * (`OPENROUTER_API_KEY`) is the PRIMARY, always-warm reranker (~1.2s, ~$0.0025) — it
 * is on the critical path so a real `rerankScore` is attached on every normal search.
 * The self-hosted MedCPT cross-encoder (`MEDCPT_RERANK_URL`, Modal A10G scale-to-zero,
 * ~20s cold) is DROPPED off the critical path: it is only attempted when explicitly
 * opted in via `ACADEMIC_USE_MEDCPT_RERANK=1`. Cohere-direct (`COHERE_API_KEY`)
 * remains a tertiary fallback. Order: OpenRouter → [MedCPT if flagged] → Cohere.
 *
 * WEB path (`domain: "web"`): unchanged — the general cross-encoder (`WEB_RERANK_URL`)
 * leads, Cohere-direct backs it up. A query is never reranked by the wrong-domain
 * model and each domain uses its own circuit-breaker label so an outage in one lane
 * can't trip the other.
 *
 * A backend is tried only if configured/enabled; if it errors or yields no scores,
 * the next is attempted. With none configured — or all failing — the input is
 * returned unchanged and the quality ranker falls back to keyword-overlap relevance:
 * the "no model, never fails" floor.
 */
export async function rerankResults(
  query: string,
  results: UnifiedSearchResult[],
  topN?: number,
  opts?: { domain?: "web" | "literature"; rerankProfile?: "biomedical" | "general" }
): Promise<UnifiedSearchResult[]> {
  const isWeb = opts?.domain === "web";
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  // Reranker routing: web + non-biomedical literature (CS/econ/psych/stats) use the
  // general bge-reranker (WEB_RERANK_URL); biomedical literature uses MedCPT. A
  // PubMed-trained cross-encoder is off-distribution for non-clinical papers, so
  // routing them to the general model is what lifts multi-domain recall.
  const useGeneralReranker =
    isWeb ||
    (opts?.rerankProfile === "general" && Boolean(process.env.WEB_RERANK_URL));
  const selfHostedUrl = useGeneralReranker
    ? process.env.WEB_RERANK_URL
    : process.env.MEDCPT_RERANK_URL;
  const cohereKey = process.env.COHERE_API_KEY;

  // The self-hosted cross-encoder is the PRIMARY reranker for BOTH domains:
  //   web → WEB_RERANK_URL, literature → MedCPT (MEDCPT_RERANK_URL).
  // It is free (Modal GPU, scale-to-zero, $0 idle) and biomedical-SOTA. It absorbs a
  // ~20s cold start (longer ceiling + one retry) then serves <1s warm; on cold-start
  // failure the chain falls through to a paid fallback or the keyword-overlap floor.
  // `ACADEMIC_USE_MEDCPT_RERANK` is retained only as an escape hatch to force it OFF.
  const selfHostedEnabled =
    Boolean(selfHostedUrl) &&
    (isWeb || process.env.ACADEMIC_USE_MEDCPT_RERANK !== "0");
  // Paid fallbacks (literature only): OpenRouter cohere/rerank-4-pro, then Cohere-direct.
  // Used only if the free self-hosted lane is absent or failing — kept off the primary
  // path so a pre-revenue product never bleeds per-search reranker spend.
  const openRouterEnabled = !isWeb && Boolean(openRouterKey);

  if (
    results.length === 0 ||
    (!selfHostedEnabled && !openRouterEnabled && !cohereKey)
  ) {
    return results;
  }

  const limit = topN || Math.min(results.length, 50);
  const documents = results.map(buildRerankDocument);

  const backends: { name: string; run: () => Promise<RerankScore[]> }[] = [];

  // 1. Self-hosted cross-encoder (PRIMARY, free) — biomedical literature: MedCPT;
  //    web + non-biomedical literature: bge (WEB_RERANK_URL).
  if (selfHostedEnabled && selfHostedUrl)
    backends.push({
      name: isWeb ? "WebReranker" : useGeneralReranker ? "BGE" : "MedCPT",
      run: () =>
        rerankSelfHosted(
          selfHostedUrl,
          query,
          documents,
          limit,
          isWeb ? "Web-Rerank" : useGeneralReranker ? "BGE-Rerank" : "MedCPT-Rerank",
          // GPU scale-to-zero on both lanes. The web lane fail-open-fasts (short
          // ceiling, no retry) so a cold start degrades to un-reranked results
          // instantly. The literature MedCPT lane absorbs its ~20s cold start with a
          // longer ceiling + one retry. Warm: <1s.
          isWeb
            ? { timeout: Number(process.env.WEB_RERANK_TIMEOUT_MS) || 4000, maxRetries: 0 }
            : { timeout: Number(process.env.MEDCPT_RERANK_TIMEOUT_MS) || 25000, maxRetries: 1 }
        ),
    });

  // 2. OpenRouter cohere/rerank-4-pro (paid FALLBACK, literature only) — managed, ~1.2s.
  if (openRouterEnabled && openRouterKey)
    backends.push({
      name: "OpenRouter",
      run: () => rerankOpenRouter(openRouterKey, query, documents, limit),
    });

  // 3. Cohere-direct — last-resort paid fallback for either domain.
  if (cohereKey)
    backends.push({
      name: "Cohere",
      run: () => rerankCohere(cohereKey, query, documents, limit),
    });

  for (const backend of backends) {
    try {
      const scored = await backend.run();
      if (scored.length === 0) continue;
      console.info(`[Rerank] scored by ${backend.name} (${scored.length} docs)`);
      return scored.map((r) => ({
        ...results[r.index],
        rerankScore: r.relevance_score,
      }));
    } catch (error) {
      console.error(`Rerank error (${backend.name}):`, error);
    }
  }
  return results;
}

/**
 * Attach the cross-encoder relevance score (self-hosted MedCPT or Cohere) to each
 * candidate (top `topN`) as `rerankScore`, WITHOUT reordering — so the quality
 * ranker can use it as the dominant relevance signal. Mutates and returns the
 * input. Fail-open: with no reranker configured or on error, returns the input
 * unchanged (scores absent → the ranker falls back to keyword overlap).
 */
export async function attachRerankScores(
  query: string,
  results: UnifiedSearchResult[],
  topN = 50,
  opts?: { rerankProfile?: "biomedical" | "general" }
): Promise<UnifiedSearchResult[]> {
  if (!hasReranker() || results.length < 2) return results;
  const head = results.slice(0, Math.min(results.length, topN));
  const reranked = await rerankResults(query, head, head.length, {
    domain: "literature",
    rerankProfile: opts?.rerankProfile,
  });
  if (reranked === head) return results; // failed → unchanged
  // rerankResults returns the head reordered with rerankScore; map scores back
  // onto the original objects by identity.
  for (const r of reranked) {
    const score = r.rerankScore;
    if (typeof score !== "number") continue;
    const original = head.find(
      (h) => h.title === r.title && h.year === r.year && h.doi === r.doi
    );
    if (original) original.rerankScore = score;
  }
  return results;
}

/**
 * Blended cross-encoder rerank: combine the cross-encoder relevance score
 * (semantic query↔document match) with the clinical-quality composite (evidence
 * level + citations + journal + RRF) from the ranking pipeline. This is the
 * recommended hybrid — the cross-encoder fixes "topically relevant but not the
 * answer" ordering, while the quality priors keep landmark/high-evidence papers
 * on top.
 *
 * Only the top `topN` candidates are sent to the cross-encoder (latency/cost);
 * the tail keeps its quality order. Fail-open: with no reranker configured or on
 * any error, the input ordering is returned unchanged.
 */
export async function crossEncoderRerank(
  query: string,
  results: UnifiedSearchResult[],
  opts: { topN?: number; weight?: number } = {}
): Promise<UnifiedSearchResult[]> {
  if (!hasReranker() || results.length < 2) return results;
  const topN = Math.min(results.length, opts.topN ?? 40);
  const weight = opts.weight ?? 0.5; // 0.5 = equal blend of semantic vs quality
  const head = results.slice(0, topN);
  const tail = results.slice(topN);

  const reranked = await rerankResults(query, head, topN);
  if (reranked === head) return results; // rerank failed → unchanged

  const blended = reranked
    .map((r) => {
      const quality = r.rankingTrace?.composite ?? r.rrfScore ?? 0;
      const semantic = r.rerankScore ?? 0;
      const score = weight * semantic + (1 - weight) * quality;
      return { r, score, semantic };
    })
    .sort((a, b) => b.score - a.score)
    .map(({ r, score, semantic }) => ({
      ...r,
      rrfScore: Math.round(score * 10000) / 10000,
      rankingTrace: r.rankingTrace
        ? {
            ...r.rankingTrace,
            relevance: Math.round(semantic * 1000) / 1000,
            composite: Math.round(score * 10000) / 10000,
          }
        : r.rankingTrace,
    }));

  return [...blended, ...tail];
}
