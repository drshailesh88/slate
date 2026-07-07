/**
 * Retrieval confidence signal.
 *
 * Dense retrieval always returns SOMETHING, so for a negative-control query
 * ("KEYNOTE trials for heart failure") or an ambiguous acronym it can present a
 * confident-looking page of tangential hits. The cross-encoder relevance score
 * (rerankScore, 0-1) is the honest measure of how well the BEST result actually
 * matches the query: when even the top result is weakly relevant, we mark the
 * result set low-confidence so the UI can say "no strong match — these may be
 * tangential" instead of over-committing to a wrong answer.
 *
 * This is a pure, additive signal — it does not reorder or drop anything.
 */

/** Below this top relevance, no result is a strong match for the query. */
export const LOW_CONFIDENCE_RELEVANCE = 0.3;

export type Confidence = "ok" | "low";

/**
 * Assess whether a ranked result set has a strong match. Returns "low" only when
 * a relevance signal exists AND even the best result falls below `floor`. Absent
 * any rerankScore (e.g. rerank skipped for a trial-acronym lookup) we never assert
 * low confidence — silence is not evidence of a weak match.
 */
export function assessConfidence(
  results: readonly { rerankScore?: number }[],
  floor: number = LOW_CONFIDENCE_RELEVANCE
): Confidence {
  const scores = results
    .map((r) => r.rerankScore)
    .filter((s): s is number => typeof s === "number");
  if (scores.length === 0) return "ok";
  const best = Math.max(...scores);
  return best < floor ? "low" : "ok";
}
