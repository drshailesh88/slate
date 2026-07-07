import type { AiDecision } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Recall / sensitivity ON THE INCLUDES — the ONLY metric that gates the AI
// (FOUNDATION-auth-tenancy.md §8). Pure, side-effect-free, exhaustively testable.
//
// Why recall-on-includes and NOT agreement/concordance: a screening set is
// overwhelmingly excludes, so overall agreement is dominated by true-negatives
// and stays high even when the AI misses real includes — exactly the error that
// invalidates a review. Sensitivity on the human-labelled includes measures the
// one thing that matters: does the AI wrongly exclude studies that belong in?
//
// A `maybe` is NOT a miss: it keeps the record in the pool for a human to decide,
// so no include is lost. Only an AI `exclude` on a human `include` is a false
// negative.
// ─────────────────────────────────────────────────────────────────────────────

export interface LabeledScreeningItem {
  /** The human GOLD label for this record in the validation sample. */
  humanLabel: AiDecision;
  /** What the AI decided for the same record. */
  aiVerdict: AiDecision;
}

export interface RecallResult {
  /** TP / (TP + FN) over the human includes, or null when there are no includes. */
  recall: number | null;
  /** Human-labelled includes — the denominator. */
  includeCount: number;
  /** Includes the AI kept in the pool (verdict !== 'exclude'). */
  caught: number;
  /** Includes the AI wrongly excluded (false negatives). */
  missed: number;
  /** Total labelled records in the sample. */
  sampleSize: number;
}

export function computeRecallOnIncludes(
  sample: readonly LabeledScreeningItem[],
): RecallResult {
  const includes = sample.filter((s) => s.humanLabel === 'include');
  const includeCount = includes.length;
  const missed = includes.filter((s) => s.aiVerdict === 'exclude').length;
  const caught = includeCount - missed;

  return {
    recall: includeCount === 0 ? null : caught / includeCount,
    includeCount,
    caught,
    missed,
    sampleSize: sample.length,
  };
}

// The gate comparison. A null recall (no includes to measure) can NEVER pass —
// deny-by-default extends to "we could not measure the thing that matters".
export function meetsRecallTarget(
  recall: number | null,
  target: number,
): boolean {
  return recall !== null && recall >= target;
}
