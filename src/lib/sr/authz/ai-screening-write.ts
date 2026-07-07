import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { screeningDecisions } from '@/lib/db/schema';
import type { screeningStageEnum } from '@/lib/db/schema/sr-enums';
import type { AiDecision } from '@/lib/sr/ai/types';

// ─────────────────────────────────────────────────────────────────────────────
// AI screening DECISION WRITER — the only code that inserts the AI's blinded
// verdicts into `screening_decisions`. It lives inside the authz/** wall because
// that is the one place allowed to name a blinded table (ESLint no-restricted-
// imports off here + CI grep allowlist + CODEOWNERS). Reads still go ONLY through
// the chokepoint (blinded-read.ts); this module only WRITES the AI's own rows.
//
// The never-autonomous invariant (FOUNDATION-auth-tenancy.md §8, §9.8) is
// STRUCTURAL here:
//   • This module touches `screening_decisions` and NOTHING else. It never
//     imports `studies` and has no path to change a study's pool membership or
//     mark it excluded — a human always makes the exclusion at reconcile.
//   • Every row it writes is `is_ai = true`: a blinded verdict (an auto-FLAG),
//     revealed to humans only at reconcile through the same chokepoint, and
//     reversible via `retractAiScreeningDecisions`.
//
// The AI reviewer is a synthetic user id passed in by the caller; it is NEVER a
// `review_members` row, so it can never be counted as one of the required HUMAN
// reviewers (coverage-preserving by construction).
// ─────────────────────────────────────────────────────────────────────────────

type ScreeningStage = (typeof screeningStageEnum.enumValues)[number];

export interface AiScreeningDecisionRow {
  studyId: string;
  decision: AiDecision;
  excludeReasonCode?: string | null;
  excludeReasonDetail?: string | null;
}

export interface CastAiScreeningArgs {
  reviewId: string;
  stage: ScreeningStage;
  /** The synthetic AI reviewer's users.id (never a review_members row). */
  aiReviewerId: string;
  rows: readonly AiScreeningDecisionRow[];
  /** Injectable clock for deterministic tests. */
  now?: Date;
}

// Cast (or re-cast) the AI's verdicts for a set of studies. Idempotent and
// reversible: any prior AI verdict for the same (review, stage, study) is
// removed first, then the fresh verdicts are inserted, so re-running the AI never
// duplicates rows. Writes ONLY `screening_decisions` — no study is ever removed.
export async function castAiScreeningDecisions(
  args: CastAiScreeningArgs,
): Promise<{ cast: number }> {
  if (args.rows.length === 0) return { cast: 0 };

  const db = getDb();
  const now = args.now ?? new Date();
  const studyIds = args.rows.map((r) => r.studyId);

  // Reversible re-cast: clear the AI's OWN prior verdicts for these studies.
  await db
    .delete(screeningDecisions)
    .where(
      and(
        eq(screeningDecisions.reviewId, args.reviewId),
        eq(screeningDecisions.stage, args.stage),
        eq(screeningDecisions.reviewerId, args.aiReviewerId),
        eq(screeningDecisions.isAi, true),
        inArray(screeningDecisions.studyId, studyIds),
      ),
    );

  await db.insert(screeningDecisions).values(
    args.rows.map((r) => ({
      reviewId: args.reviewId,
      studyId: r.studyId,
      reviewerId: args.aiReviewerId,
      stage: args.stage,
      decision: r.decision,
      excludeReasonCode: r.excludeReasonCode ?? null,
      excludeReasonDetail: r.excludeReasonDetail ?? null,
      isAi: true,
      // The AI's independent verdict is committed immediately, so it is ready at
      // reconcile. A human's reconcile decision still overrides it.
      lockedAt: now,
    })),
  );

  return { cast: args.rows.length };
}

export interface RetractAiScreeningArgs {
  reviewId: string;
  stage: ScreeningStage;
  aiReviewerId: string;
}

// Reverse the AI's participation for a stage — deletes only the AI's own rows.
// The auto-FLAG is reversible (FOUNDATION §8); a human's decisions are untouched.
export async function retractAiScreeningDecisions(
  args: RetractAiScreeningArgs,
): Promise<void> {
  const db = getDb();
  await db
    .delete(screeningDecisions)
    .where(
      and(
        eq(screeningDecisions.reviewId, args.reviewId),
        eq(screeningDecisions.stage, args.stage),
        eq(screeningDecisions.reviewerId, args.aiReviewerId),
        eq(screeningDecisions.isAi, true),
      ),
    );
}
