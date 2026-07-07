import {
  getRobAssessments,
  type BlindedContext,
  type RobAssessmentView,
} from '@/lib/sr/authz/blinded-read';
import { isRobJudgement } from './domains';
import type { OwnDomainJudgementDTO } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// The screen's ONLY read of RoB judgements during `independent` — always through
// the blinding chokepoint (never a blinded table). The chokepoint already returns
// own-only during `independent`; this seam adds two screen-specific guarantees on
// top, exactly mirroring screening/own-decisions.ts:
//
//   1. `reviewerId === ctx.requesterId` — the independent RoB surface is an OWN
//      surface. Even if a policy bug widened the chokepoint, this seam still shows
//      only the caller's own domain judgements.
//   2. `!isAi` — the AI reviewer's SUGGESTION is blinded like a human's; it never
//      appears during independent appraisal (showing it would anchor both human
//      reviewers into correlated errors — the failure the firewall exists to
//      prevent). The AI's suggestion surfaces only at reconcile, labeled.
//
// A leak of a co-reviewer's or the AI's judgement through this seam would breach
// blinding — it is exercised by the T6-style side-channel test for this screen.
// ─────────────────────────────────────────────────────────────────────────────

function toOwnJudgement(row: RobAssessmentView): OwnDomainJudgementDTO | null {
  if (!isRobJudgement(row.judgement)) return null;
  return {
    studyId: row.studyId,
    domainId: row.domain,
    judgement: row.judgement,
    supportQuote: row.supportQuote,
    locked: row.lockedAt != null,
  };
}

export async function getOwnRobJudgements(
  ctx: BlindedContext,
): Promise<OwnDomainJudgementDTO[]> {
  const rows = await getRobAssessments(ctx);
  const own: OwnDomainJudgementDTO[] = [];
  for (const row of rows) {
    if (row.reviewerId !== ctx.requesterId) continue;
    if (row.isAi) continue;
    const judgement = toOwnJudgement(row);
    if (judgement) own.push(judgement);
  }
  return own;
}

// True once the reviewer has finished appraising — i.e. they have authored at
// least one domain judgement and every one of them is locked.
export function hasFinishedRob(
  judgements: readonly OwnDomainJudgementDTO[],
): boolean {
  return judgements.length > 0 && judgements.every((j) => j.locked);
}
