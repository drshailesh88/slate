import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { screeningDecisions } from '@/lib/db/schema/sr-blinded';

// ─────────────────────────────────────────────────────────────────────────────
// SCREENING WRITE CHOKEPOINT (T12) — the ONLY module outside the schema that
// names the blinded `screening_decisions` table for a WRITE. It lives inside the
// wall-allowed src/lib/sr/authz/** so ESLint + the CI grep permit the import.
//
// The Postgres runtime role has INSERT/UPDATE but NO SELECT on the blinded table
// (drizzle/0002_sr_privilege_wall.sql). Two consequences enforced here:
//   1. NO `.returning()` anywhere — RETURNING requires SELECT privilege, which
//      the runtime role lacks. These writes are fire-and-forget by design.
//   2. A reviewer may only touch their OWN rows. `reviewerId` is passed in by the
//      server action as the caller's resolved users.id (never a client value),
//      and every statement is scoped to it. There is no code path here that
//      writes, reads, or reveals another reviewer's decision.
//
// Blinding is unaffected: writing your own vote leaks nothing. Reads stay on the
// read chokepoint (blinded-read.ts); this file never SELECTs.
// ─────────────────────────────────────────────────────────────────────────────

export type ScreeningStageValue = 'title_abstract' | 'full_text';
export type ScreeningDecisionValue = 'include' | 'maybe' | 'exclude';

export interface CastOwnScreeningDecisionInput {
  reviewId: string;
  studyId: string;
  /** The caller's OWN internal users.id — set by the server action, never a client value. */
  reviewerId: string;
  stage: ScreeningStageValue;
  decision: ScreeningDecisionValue;
  excludeReasonCode: string | null;
  excludeReasonDetail: string | null;
}

// Upsert the caller's own decision for (review, study, stage). Atomic + idempotent
// via the unique index (review_id, study_id, reviewer_id, stage): a first call
// inserts, a later call revises. `setWhere lockedAt IS NULL` means a decision the
// reviewer has already FINISHED (locked) is not silently rewritten — the update
// simply matches no row. No RETURNING (the runtime role cannot SELECT).
export async function castOwnScreeningDecision(
  input: CastOwnScreeningDecisionInput,
): Promise<void> {
  const db = getDb();
  await db
    .insert(screeningDecisions)
    .values({
      reviewId: input.reviewId,
      studyId: input.studyId,
      reviewerId: input.reviewerId,
      stage: input.stage,
      decision: input.decision,
      excludeReasonCode: input.excludeReasonCode,
      excludeReasonDetail: input.excludeReasonDetail,
      isAi: false,
    })
    .onConflictDoUpdate({
      target: [
        screeningDecisions.reviewId,
        screeningDecisions.studyId,
        screeningDecisions.reviewerId,
        screeningDecisions.stage,
      ],
      set: {
        decision: input.decision,
        excludeReasonCode: input.excludeReasonCode,
        excludeReasonDetail: input.excludeReasonDetail,
        updatedAt: new Date(),
      },
      setWhere: isNull(screeningDecisions.lockedAt),
    });
}

export interface FinishOwnScreeningInput {
  reviewId: string;
  /** The caller's OWN internal users.id — set by the server action. */
  reviewerId: string;
  stage: ScreeningStageValue;
}

// Finish screening for the caller: lock every one of THEIR OWN as-yet-unlocked
// decisions for the stage. Locking feeds the chokepoint's safe-progress
// ("N of M reviewers finished") and freezes the reviewer's calls ahead of
// reconciliation. Scoped strictly to `reviewer_id = caller` and `locked_at IS
// NULL`; it can never touch another reviewer's rows. No RETURNING.
export async function finishOwnScreening(
  input: FinishOwnScreeningInput,
): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db
    .update(screeningDecisions)
    .set({ lockedAt: now, updatedAt: now })
    .where(
      and(
        eq(screeningDecisions.reviewId, input.reviewId),
        eq(screeningDecisions.reviewerId, input.reviewerId),
        eq(screeningDecisions.stage, input.stage),
        isNull(screeningDecisions.lockedAt),
      ),
    );
}
