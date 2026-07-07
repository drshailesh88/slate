'use server';

import { isSrAuthzError, requireMember } from '@/lib/sr/authz/require-member';
import { draftReportSections } from '@/lib/sr/report/draft';
import { buildGroundingSources } from '@/lib/sr/report/grounding';
import { buildReportView } from '@/lib/sr/report/load';
import { canDraftReport } from '@/lib/sr/report/roles';
import { createVercelReportDraftModel } from '@/lib/sr/report/vercel-model';
import type { DraftReportActionResult } from '@/lib/sr/report/types';

// ─────────────────────────────────────────────────────────────────────────────
// Report server actions (T18) — the trust boundary for AI drafting.
//   • re-resolves LIVE membership (defense in depth) and gates on the role;
//   • REBUILDS the grounding table server-side from the chokepoint-safe view —
//     the client never supplies the facts the model drafts from, so a tampered
//     client cannot smuggle numbers (or blinded data) into the prompt;
//   • the draft that comes back is validated sentence-by-sentence (≥1 known
//     citation, no unsupported number) and section-allowlisted (no
//     conclusions/GRADE) before it reaches the screen.
//
// Live drafting needs the founder-provisioned AI Gateway key (same SR_AI_MODEL
// config as screening); without it the SDK fails at call time and the screen
// shows the actionable message below. Tests use the deterministic mock model.
// ─────────────────────────────────────────────────────────────────────────────

const REVIEW_NOT_FOUND = 'Review not found.';
const NOT_A_DRAFTER =
  'Only the review owner or a collaborator can draft report prose.';
const DRAFT_FAILED =
  'Drafting failed — the AI model is not reachable. Check that the AI provider key (SR_AI_MODEL / AI Gateway) is provisioned, then try again.';

export async function draftReportAction(
  reviewId: string,
): Promise<DraftReportActionResult> {
  let ctx;
  try {
    ctx = await requireMember(reviewId);
  } catch (error) {
    if (isSrAuthzError(error)) return { ok: false, message: REVIEW_NOT_FOUND };
    throw error;
  }
  if (!canDraftReport(ctx.member.role)) {
    return { ok: false, message: NOT_A_DRAFTER };
  }

  const view = await buildReportView(ctx, reviewId);
  if (!view) return { ok: false, message: REVIEW_NOT_FOUND };

  const input = {
    reviewTitle: view.reviewTitle,
    reviewType: view.reviewType,
    sources: buildGroundingSources(view),
  };

  try {
    const draft = await draftReportSections({
      model: createVercelReportDraftModel(),
      input,
    });
    return { ok: true, draft };
  } catch {
    return { ok: false, message: DRAFT_FAILED };
  }
}
