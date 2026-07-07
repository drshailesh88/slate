import { getDb } from '@/lib/db/client';
import { robAssessments } from '@/lib/db/schema/sr-blinded';

// ─────────────────────────────────────────────────────────────────────────────
// AI RISK-OF-BIAS SUGGESTION WRITER (T16) — the only code that inserts the AI
// reviewer's SUGGESTED domain judgements into `rob_assessments`. It lives inside
// the authz/** wall because that is the one place allowed to name a blinded table
// (ESLint no-restricted-imports off here + CI grep allowlist + CODEOWNERS). Reads
// still go ONLY through the chokepoint (blinded-read.ts); this module only WRITES
// the AI's own rows.
//
// The never-autonomous invariant (FOUNDATION-auth-tenancy.md §8, §9.8) is
// STRUCTURAL here:
//   • This module touches `rob_assessments` and NOTHING else. It never imports
//     `studies` and has no path to mark a study, set a "final" judgement, or flip
//     any consensus — a human always confirms/overrides at reconcile.
//   • Every row it writes is `is_ai = true`: a blinded SUGGESTION, withheld from
//     humans during `independent` by the same chokepoint (own-only), and revealed
//     only at reconcile as a labeled, overridable input.
//
// The AI reviewer is a synthetic user id passed in by the caller; it is NEVER a
// `review_members` row, so it can never be counted as one of the required HUMAN
// reviewers (coverage-preserving by construction).
//
// Upsert (not delete+insert): the runtime role has INSERT/UPDATE but NO DELETE on
// the blinded table, so a re-suggestion revises the AI's own row via the unique
// (review, study, reviewer, domain) index.
// ─────────────────────────────────────────────────────────────────────────────

export type RobJudgementValue = 'low' | 'some' | 'high';

export interface AiRobSuggestionRow {
  studyId: string;
  domain: string;
  judgement: RobJudgementValue;
  /** The AI's cited support for the suggestion (from the methods text). */
  supportQuote: string;
}

export interface SuggestAiRobArgs {
  reviewId: string;
  /** The synthetic AI reviewer's users.id (never a review_members row). */
  aiReviewerId: string;
  rows: readonly AiRobSuggestionRow[];
  /** Injectable clock for deterministic tests. */
  now?: Date;
}

// Cast (or re-cast) the AI's SUGGESTED judgements for a set of (study, domain)
// pairs. Idempotent: any prior AI suggestion for the same key is revised in place
// (upsert on the AI's own rows). Writes ONLY `rob_assessments` with is_ai=true —
// it never writes a human/final judgement and never removes a study.
export async function suggestAiRobJudgements(
  args: SuggestAiRobArgs,
): Promise<{ suggested: number }> {
  if (args.rows.length === 0) return { suggested: 0 };

  const db = getDb();
  // The AI's independent suggestion is committed locked, so it is ready at
  // reconcile. A human's confirm/override at reconcile is a separate row.
  const now = args.now ?? new Date();

  for (const row of args.rows) {
    await db
      .insert(robAssessments)
      .values({
        reviewId: args.reviewId,
        studyId: row.studyId,
        reviewerId: args.aiReviewerId,
        domain: row.domain,
        judgement: row.judgement,
        supportQuote: row.supportQuote,
        isAi: true,
        lockedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          robAssessments.reviewId,
          robAssessments.studyId,
          robAssessments.reviewerId,
          robAssessments.domain,
        ],
        set: {
          judgement: row.judgement,
          supportQuote: row.supportQuote,
          lockedAt: now,
          updatedAt: now,
        },
      });
  }

  return { suggested: args.rows.length };
}
