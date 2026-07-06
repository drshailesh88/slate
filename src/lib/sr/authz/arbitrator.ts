import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { ArbitratorIndependenceError } from './errors';

// ─────────────────────────────────────────────────────────────────────────────
// Arbitrator independence (server-enforced) — FOUNDATION-auth-tenancy.md §5.
//
// An arbitrator resolves conflicts on a study; they must NOT also be one of that
// study's reviewers. "Reviewer of the study" = anyone who authored a screening
// decision, extraction entry, or RoB assessment on it.
//
// Participation lives ONLY in the three blinded base tables, which the runtime
// role cannot SELECT directly (drizzle/0002_sr_privilege_wall.sql). The single
// legal read path is the audited SECURITY DEFINER functions
// public.sr_read_{screening_decisions,extraction_entries,rob_assessments}(uuid).
// This module lives in src/lib/sr/authz/**, the only place allowed to name the
// blinded tables (ESLint + CI grep + CODEOWNERS). We disclose nothing beyond a
// single boolean about the very user being assigned — no co-reviewer data.
// ─────────────────────────────────────────────────────────────────────────────

type ParticipationArgs = {
  reviewId: string;
  studyId: string;
  userId: string;
};

// True if `userId` authored ANY screening decision, extraction entry, or RoB
// assessment on `studyId` within `reviewId`. Each subquery is filtered to the
// exact (study, reviewer) pair inside the definer function's result set, so the
// runtime role never sees another reviewer's rows.
export async function hasStudyParticipation({
  reviewId,
  studyId,
  userId,
}: ParticipationArgs): Promise<boolean> {
  const db = getDb();
  const result = await db.execute<{ found: number }>(sql`
    SELECT 1 AS found
    FROM sr_read_screening_decisions(${reviewId})
    WHERE study_id = ${studyId} AND reviewer_id = ${userId}
    UNION ALL
    SELECT 1 AS found
    FROM sr_read_extraction_entries(${reviewId})
    WHERE study_id = ${studyId} AND reviewer_id = ${userId}
    UNION ALL
    SELECT 1 AS found
    FROM sr_read_rob_assessments(${reviewId})
    WHERE study_id = ${studyId} AND reviewer_id = ${userId}
    LIMIT 1
  `);

  return result.rows.length > 0;
}

// Refuse to make `userId` the arbitrator of `studyId` if they worked on it.
// Throws ArbitratorIndependenceError (422). Call this BEFORE writing the
// arbitrator assignment; the caller has already resolved membership and
// confirmed the study belongs to the review (requireStudyInReview).
export async function assertArbitratorIndependent(
  args: ParticipationArgs,
): Promise<void> {
  if (await hasStudyParticipation(args)) {
    throw new ArbitratorIndependenceError();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Review-wide arbitrator independence — the Members/Team screen (T7) assigns the
// review-wide `arbitrator` ROLE, not a per-study arbitration. A user who has
// authored ANY screening / extraction / RoB row on ANY study in the review is
// not a neutral arbitrator (they would be adjudicating conflicts on studies they
// themselves reviewed). This is the same disclosure posture as the per-study
// check: it reads participation ONLY through the audited definer functions and
// discloses just a single boolean about the assignee.
// ─────────────────────────────────────────────────────────────────────────────

type ReviewParticipationArgs = { reviewId: string; userId: string };

// True if `userId` authored ANY blinded row (screening / extraction / RoB) on
// ANY study within `reviewId`. Same legal read path as hasStudyParticipation,
// with the study filter dropped.
export async function hasReviewParticipation({
  reviewId,
  userId,
}: ReviewParticipationArgs): Promise<boolean> {
  const db = getDb();
  const result = await db.execute<{ found: number }>(sql`
    SELECT 1 AS found
    FROM sr_read_screening_decisions(${reviewId})
    WHERE reviewer_id = ${userId}
    UNION ALL
    SELECT 1 AS found
    FROM sr_read_extraction_entries(${reviewId})
    WHERE reviewer_id = ${userId}
    UNION ALL
    SELECT 1 AS found
    FROM sr_read_rob_assessments(${reviewId})
    WHERE reviewer_id = ${userId}
    LIMIT 1
  `);

  return result.rows.length > 0;
}

// Refuse to give `userId` the review-wide arbitrator role if they have reviewed
// any study in the review. Throws ArbitratorIndependenceError (422). Call BEFORE
// writing the role assignment.
export async function assertArbitratorIndependentForReview(
  args: ReviewParticipationArgs,
): Promise<void> {
  if (await hasReviewParticipation(args)) {
    throw new ArbitratorIndependenceError();
  }
}
