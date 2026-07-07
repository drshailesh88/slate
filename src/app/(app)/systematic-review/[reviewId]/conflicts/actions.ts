'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { reviews } from '@/lib/db/schema/sr';
import {
  assertArbitratorIndependent,
  isSrAuthzError,
  requireMember,
  requireStudyInReview,
} from '@/lib/sr/authz/require-member';
import { DrizzleConflictStore } from '@/lib/sr/conflicts/drizzle-store';
import { resolveConflict } from '@/lib/sr/conflicts/service';
import { canResolveConflict } from '@/lib/sr/conflicts/roles';
import {
  ConflictForbiddenError,
  ConflictNotInReconcileError,
  ConflictResolutionInvalidError,
  isConflictError,
} from '@/lib/sr/conflicts/errors';
import type {
  AlignDecision,
  ConflictActionResult,
  ResolutionMethod,
  ResolveConflictInput,
} from '@/lib/sr/conflicts/types';

// ─────────────────────────────────────────────────────────────────────────────
// Conflict-resolution server action. It owns the trust boundary the pure service
// does not: re-authorize (never trust the client), gate on the live review role,
// PROVE screening is at `reconcile` (a conflict cannot be resolved while blinded),
// scope the study to the review (IDOR kill), enforce arbitrator INDEPENDENCE
// server-side for send-to-arbitrator, then run the no-auto-resolve service.
// Domain/authz failures return an actionable `{ ok: false }`; infra rejects (500).
// ─────────────────────────────────────────────────────────────────────────────

function sanitizeInput(raw: unknown): ResolveConflictInput {
  if (typeof raw !== 'object' || raw === null) {
    throw new ConflictResolutionInvalidError('Malformed resolution request.');
  }
  const value = raw as Record<string, unknown>;

  const studyId = typeof value.studyId === 'string' ? value.studyId.trim() : '';
  if (!studyId) {
    throw new ConflictResolutionInvalidError('A study is required.');
  }

  const method = value.method;
  if (method !== 'align_on_one' && method !== 'send_to_arbitrator') {
    throw new ConflictResolutionInvalidError('Unknown resolution method.');
  }

  const decision =
    value.decision === 'include' || value.decision === 'exclude'
      ? (value.decision as AlignDecision)
      : undefined;
  const arbitratorId =
    typeof value.arbitratorId === 'string' && value.arbitratorId.trim()
      ? value.arbitratorId.trim()
      : undefined;
  const note = typeof value.note === 'string' ? value.note : undefined;

  return {
    studyId,
    method: method as ResolutionMethod,
    decision,
    arbitratorId,
    note,
  };
}

function toFailure(error: unknown): ConflictActionResult {
  if (isConflictError(error)) {
    return { ok: false, message: error.message, code: error.code };
  }
  // Arbitrator-not-independent (422) and access errors both land here.
  if (isSrAuthzError(error)) {
    return { ok: false, message: error.message, code: error.code };
  }
  throw error;
}

export async function resolveConflictAction(
  reviewId: string,
  rawInput: unknown,
): Promise<ConflictActionResult> {
  try {
    const ctx = await requireMember(reviewId);
    if (!canResolveConflict(ctx.member.role)) {
      throw new ConflictForbiddenError();
    }

    const [review] = await getDb()
      .select({
        screeningPhase: reviews.screeningPhase,
        screeningStage: reviews.screeningStage,
      })
      .from(reviews)
      .where(eq(reviews.id, reviewId))
      .limit(1);
    if (!review) {
      // Race: review vanished after membership resolved. Neutral failure.
      return {
        ok: false,
        message: 'Review not found.',
        code: 'review_access_denied',
      };
    }
    if (review.screeningPhase !== 'reconcile') {
      throw new ConflictNotInReconcileError();
    }

    const input = sanitizeInput(rawInput);

    // IDOR kill: the study must belong to THIS review (foreign → 404).
    await requireStudyInReview({ reviewId, studyId: input.studyId });

    if (input.method === 'send_to_arbitrator') {
      if (!input.arbitratorId) {
        throw new ConflictResolutionInvalidError(
          'Sending a conflict to arbitration requires an independent arbitrator.',
        );
      }
      // Refuses (422) if the assignee reviewed this study — server-enforced.
      await assertArbitratorIndependent({
        reviewId,
        studyId: input.studyId,
        userId: input.arbitratorId,
      });
    }

    await resolveConflict(
      new DrizzleConflictStore(),
      {
        reviewId,
        studyId: input.studyId,
        stage: review.screeningStage,
        method: input.method,
        decision: input.decision ?? null,
        arbitratorId: input.arbitratorId ?? null,
        note: input.note ?? null,
        actorId: ctx.userId,
      },
      new Date(),
    );

    revalidatePath(`/systematic-review/${reviewId}/conflicts`);
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}
