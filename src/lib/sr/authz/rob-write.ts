import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { robAssessments } from '@/lib/db/schema/sr-blinded';

// ─────────────────────────────────────────────────────────────────────────────
// RISK-OF-BIAS WRITE CHOKEPOINT (T16) — the ONLY module outside the schema that
// names the blinded `rob_assessments` table for a human WRITE. It lives inside
// the wall-allowed src/lib/sr/authz/** so ESLint + the CI grep permit the import.
//
// The Postgres runtime role has INSERT/UPDATE but NO SELECT and NO DELETE on the
// blinded table (drizzle/0002_sr_privilege_wall.sql). Two consequences enforced
// here:
//   1. NO `.returning()` anywhere — RETURNING requires SELECT privilege, which
//      the runtime role lacks. These writes are fire-and-forget by design.
//   2. A reviewer may only touch their OWN rows. `reviewerId` is passed in by the
//      server action as the caller's resolved users.id (never a client value),
//      and every statement is scoped to it. There is no code path here that
//      writes, reads, or reveals another reviewer's judgement.
//
// Blinding is unaffected: writing your own domain judgement leaks nothing. Reads
// stay on the read chokepoint (blinded-read.ts); this file never SELECTs.
// Mirrors screening-write.ts (T12).
// ─────────────────────────────────────────────────────────────────────────────

export type RobJudgementValue = 'low' | 'some' | 'high';

export interface CastOwnRobJudgementInput {
  reviewId: string;
  studyId: string;
  /** The caller's OWN internal users.id — set by the server action, never a client value. */
  reviewerId: string;
  domain: string;
  judgement: RobJudgementValue;
  /** Evidence for the judgement (provenance) — required upstream in validate.ts. */
  supportQuote: string;
}

// Upsert the caller's own judgement for (review, study, domain). Atomic +
// idempotent via the unique index (review_id, study_id, reviewer_id, domain): a
// first call inserts, a later call revises. `setWhere lockedAt IS NULL` means a
// judgement the reviewer has already FINISHED (locked) is not silently rewritten
// — the update simply matches no row. No RETURNING (the runtime role cannot
// SELECT). isAi is always false here — this is a HUMAN's row.
export async function castOwnRobJudgement(
  input: CastOwnRobJudgementInput,
): Promise<void> {
  const db = getDb();
  await db
    .insert(robAssessments)
    .values({
      reviewId: input.reviewId,
      studyId: input.studyId,
      reviewerId: input.reviewerId,
      domain: input.domain,
      judgement: input.judgement,
      supportQuote: input.supportQuote,
      isAi: false,
    })
    .onConflictDoUpdate({
      target: [
        robAssessments.reviewId,
        robAssessments.studyId,
        robAssessments.reviewerId,
        robAssessments.domain,
      ],
      set: {
        judgement: input.judgement,
        supportQuote: input.supportQuote,
        updatedAt: new Date(),
      },
      setWhere: isNull(robAssessments.lockedAt),
    });
}

export interface FinishOwnRobInput {
  reviewId: string;
  /** The caller's OWN internal users.id — set by the server action. */
  reviewerId: string;
}

// Finish appraising for the caller: lock every one of THEIR OWN as-yet-unlocked
// judgements for the review. Locking feeds the chokepoint's safe-progress
// ("N of M reviewers finished") and freezes the reviewer's calls ahead of
// reconciliation. Scoped strictly to `reviewer_id = caller` and `locked_at IS
// NULL`; it can never touch another reviewer's rows. No RETURNING.
export async function finishOwnRob(input: FinishOwnRobInput): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db
    .update(robAssessments)
    .set({ lockedAt: now, updatedAt: now })
    .where(
      and(
        eq(robAssessments.reviewId, input.reviewId),
        eq(robAssessments.reviewerId, input.reviewerId),
        isNull(robAssessments.lockedAt),
      ),
    );
}
