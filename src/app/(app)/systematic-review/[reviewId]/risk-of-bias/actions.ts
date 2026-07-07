'use server';

import { revalidatePath } from 'next/cache';
import { castOwnRobJudgement, finishOwnRob } from '@/lib/sr/authz/rob-write';
import {
  isSrAuthzError,
  requireMember,
  requireStudyInReview,
  type MemberContext,
} from '@/lib/sr/authz/require-member';
import { isRobInstrument } from '@/lib/sr/rob/domains';
import {
  createDeterministicRobModel,
  runAiRobSuggestions,
} from '@/lib/sr/rob/ai-suggester';
import { loadRobFacts, unblindRob } from '@/lib/sr/rob/phase';
import {
  canAppraiseRob,
  canReconcileRob,
  canUnblindRob,
} from '@/lib/sr/rob/roles';
import {
  validateRobJudgementInput,
  type RawRobJudgementInput,
} from '@/lib/sr/rob/validate';

// ─────────────────────────────────────────────────────────────────────────────
// Risk-of-Bias server actions (T16) — the trust boundary. Every action:
//   • re-resolves LIVE membership (requireMember, defense in depth) — a role is
//     never read from the client or a JWT;
//   • gates the mutation on that live role;
//   • re-reads the authoritative phase from `reviews.rob_phase` (never trusts the
//     client), so an independent cast after unblind — or a reconcile confirm
//     before it — is refused;
//   • writes with `reviewerId = ctx.userId` ONLY — a reviewer can only ever cast
//     their OWN judgement. There is no code path that accepts a client reviewerId.
//   • resolves the study's instrument SERVER-SIDE so a client cannot smuggle a
//     domain from the wrong instrument.
//
// Domain refusals come back as { ok: false, error } for the screen to show;
// unexpected/infra errors reject (→ 500). No blinded READ happens here.
// ─────────────────────────────────────────────────────────────────────────────

export interface RobActionResult {
  ok: boolean;
  error?: string;
}

export interface UnblindRobActionResult extends RobActionResult {
  flipped?: boolean;
}

const NOT_AN_APPRAISER =
  'Only reviewers and collaborators can appraise studies on this review.';
const NOT_A_RECONCILER =
  'Only the owner or arbitrator can record the reconciled judgement.';
const NOT_OWNER =
  'Only the review owner can reveal judgements for reconciliation.';
const ALREADY_REVEALED =
  'Risk of bias has been revealed for reconciliation — independent judgements are locked.';
const NOT_YET_REVEALED =
  'Risk of bias is still in independent appraisal — reconcile after the owner reveals.';
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
  revalidatePath(`/systematic-review/${reviewId}/risk-of-bias`);
}

export interface RobJudgementActionInput extends RawRobJudgementInput {
  reviewId: string;
}

// Shared write path for both the independent cast and the reconcile confirm: they
// differ only in the role gate and the required phase. The study's instrument is
// resolved server-side from the study row (IDOR-scoped through the review).
async function writeRobJudgement(
  input: RobJudgementActionInput,
  opts: {
    requiredPhase: 'independent' | 'reconcile';
    isAllowed: (role: MemberContext['member']['role']) => boolean;
    notAllowedMessage: string;
    wrongPhaseMessage: string;
  },
): Promise<RobActionResult> {
  const auth = await resolveMember(input.reviewId);
  if ('error' in auth) return { ok: false, error: auth.error };
  if (!opts.isAllowed(auth.ctx.member.role)) {
    return { ok: false, error: opts.notAllowedMessage };
  }

  const facts = await loadRobFacts(input.reviewId);
  if (!facts) return { ok: false, error: REVIEW_NOT_FOUND };
  if (facts.phase !== opts.requiredPhase) {
    return { ok: false, error: opts.wrongPhaseMessage };
  }

  // IDOR kill: the study must belong to THIS review (never fetched by id alone).
  // The Study row carries the appraisal instrument.
  let instrument: 'rob2' | 'robins_i' = 'rob2';
  try {
    const study = await requireStudyInReview({
      reviewId: input.reviewId,
      studyId: typeof input.studyId === 'string' ? input.studyId : '',
    });
    instrument = isRobInstrument(study.robInstrument)
      ? study.robInstrument
      : 'rob2';
  } catch (error) {
    if (isSrAuthzError(error)) return { ok: false, error: REVIEW_NOT_FOUND };
    throw error;
  }

  const clean = validateRobJudgementInput(input, instrument);
  if (!clean.ok) return { ok: false, error: clean.message };

  await castOwnRobJudgement({
    reviewId: input.reviewId,
    studyId: clean.value.studyId,
    // The caller's OWN id — never a client-supplied reviewerId.
    reviewerId: auth.ctx.userId,
    domain: clean.value.domainId,
    judgement: clean.value.judgement,
    supportQuote: clean.value.supportQuote,
  });

  revalidate(input.reviewId);
  return { ok: true };
}

// Independent phase: a reviewer/collaborator records their OWN domain judgement.
export async function castRobJudgmentAction(
  input: RobJudgementActionInput,
): Promise<RobActionResult> {
  return writeRobJudgement(input, {
    requiredPhase: 'independent',
    isAllowed: canAppraiseRob,
    notAllowedMessage: NOT_AN_APPRAISER,
    wrongPhaseMessage: ALREADY_REVEALED,
  });
}

// Reconcile phase: the owner/arbitrator records the reconciled (consensus)
// judgement — confirming or overriding a reviewer's or the AI's suggestion. The
// AI never writes this; a human always does.
export async function confirmRobJudgmentAction(
  input: RobJudgementActionInput,
): Promise<RobActionResult> {
  return writeRobJudgement(input, {
    requiredPhase: 'reconcile',
    isAllowed: canReconcileRob,
    notAllowedMessage: NOT_A_RECONCILER,
    wrongPhaseMessage: NOT_YET_REVEALED,
  });
}

export async function finishRobAction(
  reviewId: string,
): Promise<RobActionResult> {
  const auth = await resolveMember(reviewId);
  if ('error' in auth) return { ok: false, error: auth.error };
  if (!canAppraiseRob(auth.ctx.member.role)) {
    return { ok: false, error: NOT_AN_APPRAISER };
  }

  const facts = await loadRobFacts(reviewId);
  if (!facts) return { ok: false, error: REVIEW_NOT_FOUND };
  if (facts.phase !== 'independent') {
    return { ok: false, error: ALREADY_REVEALED };
  }

  await finishOwnRob({ reviewId, reviewerId: auth.ctx.userId });

  revalidate(reviewId);
  return { ok: true };
}

export async function unblindRobAction(
  reviewId: string,
): Promise<UnblindRobActionResult> {
  const auth = await resolveMember(reviewId);
  if ('error' in auth) return { ok: false, error: auth.error };
  if (!canUnblindRob(auth.ctx.member.role)) {
    return { ok: false, error: NOT_OWNER };
  }

  const { flipped } = await unblindRob(reviewId, auth.ctx.userId);
  revalidate(reviewId);
  return { ok: true, flipped };
}

export interface AiSuggestActionResult extends RobActionResult {
  suggested?: number;
}

// Owner-triggered AI appraisal. The suggestions are written BLINDED (is_ai, via
// the authz writer) and stay hidden behind the chokepoint until reconcile — the
// AI never records a final judgement. Owner-gated like the unblind.
export async function runAiRobSuggestionsAction(
  reviewId: string,
): Promise<AiSuggestActionResult> {
  const auth = await resolveMember(reviewId);
  if ('error' in auth) return { ok: false, error: auth.error };
  if (!canUnblindRob(auth.ctx.member.role)) {
    return { ok: false, error: NOT_OWNER };
  }

  const { suggested } = await runAiRobSuggestions({
    reviewId,
    model: createDeterministicRobModel(),
  });
  revalidate(reviewId);
  return { ok: true, suggested };
}
