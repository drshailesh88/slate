'use server';

import { revalidatePath } from 'next/cache';
import {
  castOwnScreeningDecision,
  finishOwnScreening,
} from '@/lib/sr/authz/screening-write';
import {
  isSrAuthzError,
  requireMember,
  requireStudyInReview,
  type MemberContext,
} from '@/lib/sr/authz/require-member';
import { loadScreeningFacts, unblindScreening } from '@/lib/sr/screening/phase';
import {
  canCastScreeningDecision,
  canUnblindScreening,
} from '@/lib/sr/screening/roles';
import { validateCastInput, type RawCastInput } from '@/lib/sr/screening/validate';

// ─────────────────────────────────────────────────────────────────────────────
// Screening server actions (T12) — the trust boundary. Every action:
//   • re-resolves LIVE membership (requireMember, defense in depth) — a role is
//     never read from the client or a JWT;
//   • gates the mutation on that live role;
//   • re-reads the authoritative phase from `reviews` (never trusts the client),
//     so a cast after unblind is refused;
//   • writes with `reviewerId = ctx.userId` ONLY — a reviewer can only ever cast
//     their OWN decision. There is no code path that accepts a client reviewerId.
//
// Domain refusals come back as { ok: false, error } for the screen to show;
// unexpected/infra errors reject (→ 500). No blinded read happens here.
// ─────────────────────────────────────────────────────────────────────────────

export interface ScreeningActionResult {
  ok: boolean;
  error?: string;
}

export interface UnblindActionResult extends ScreeningActionResult {
  flipped?: boolean;
}

const NOT_A_SCREENER =
  'Only reviewers and collaborators can screen studies on this review.';
const NOT_OWNER = 'Only the review owner can reveal decisions for reconciliation.';
const ALREADY_REVEALED =
  'Screening has been revealed for reconciliation — decisions are locked.';
const REVIEW_NOT_FOUND = 'Review not found.';

async function resolveMember(
  reviewId: string,
): Promise<{ ctx: MemberContext } | { error: string }> {
  try {
    return { ctx: await requireMember(reviewId) };
  } catch (error) {
    if (isSrAuthzError(error)) return { error: REVIEW_NOT_FOUND };
    throw error;
  }
}

function revalidate(reviewId: string): void {
  revalidatePath(`/systematic-review/${reviewId}/screening`);
}

export interface CastDecisionActionInput extends RawCastInput {
  reviewId: string;
}

export async function castDecisionAction(
  input: CastDecisionActionInput,
): Promise<ScreeningActionResult> {
  const auth = await resolveMember(input.reviewId);
  if ('error' in auth) return { ok: false, error: auth.error };
  if (!canCastScreeningDecision(auth.ctx.member.role)) {
    return { ok: false, error: NOT_A_SCREENER };
  }

  const facts = await loadScreeningFacts(input.reviewId);
  if (!facts) return { ok: false, error: REVIEW_NOT_FOUND };
  if (facts.phase !== 'independent') {
    return { ok: false, error: ALREADY_REVEALED };
  }

  const clean = validateCastInput(input);
  if (!clean.ok) return { ok: false, error: clean.message };

  // IDOR kill: the study must belong to THIS review (never fetched by id alone).
  try {
    await requireStudyInReview({
      reviewId: input.reviewId,
      studyId: clean.value.studyId,
    });
  } catch (error) {
    if (isSrAuthzError(error)) return { ok: false, error: REVIEW_NOT_FOUND };
    throw error;
  }

  await castOwnScreeningDecision({
    reviewId: input.reviewId,
    studyId: clean.value.studyId,
    // The caller's OWN id — never a client-supplied reviewerId.
    reviewerId: auth.ctx.userId,
    stage: facts.stage,
    decision: clean.value.decision,
    excludeReasonCode: clean.value.excludeReasonCode,
    excludeReasonDetail: clean.value.excludeReasonDetail,
  });

  revalidate(input.reviewId);
  return { ok: true };
}

export async function finishScreeningAction(
  reviewId: string,
): Promise<ScreeningActionResult> {
  const auth = await resolveMember(reviewId);
  if ('error' in auth) return { ok: false, error: auth.error };
  if (!canCastScreeningDecision(auth.ctx.member.role)) {
    return { ok: false, error: NOT_A_SCREENER };
  }

  const facts = await loadScreeningFacts(reviewId);
  if (!facts) return { ok: false, error: REVIEW_NOT_FOUND };
  if (facts.phase !== 'independent') {
    return { ok: false, error: ALREADY_REVEALED };
  }

  await finishOwnScreening({
    reviewId,
    reviewerId: auth.ctx.userId,
    stage: facts.stage,
  });

  revalidate(reviewId);
  return { ok: true };
}

export async function unblindScreeningAction(
  reviewId: string,
): Promise<UnblindActionResult> {
  const auth = await resolveMember(reviewId);
  if ('error' in auth) return { ok: false, error: auth.error };
  if (!canUnblindScreening(auth.ctx.member.role)) {
    return { ok: false, error: NOT_OWNER };
  }

  const { flipped } = await unblindScreening(reviewId, auth.ctx.userId);
  revalidate(reviewId);
  return { ok: true, flipped };
}
