import {
  getScreeningDecisions,
  type BlindedContext,
  type ScreeningDecisionView,
} from '@/lib/sr/authz/blinded-read';
import type { ScreeningStage } from './stage';
import type { OwnDecisionDTO, ScreeningDecisionKind } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// The screen's ONLY read of screening decisions — always through the blinding
// chokepoint (never a blinded table). The chokepoint already returns own-only
// during `independent`; this seam adds two screen-specific guarantees on top:
//
//   1. `reviewerId === ctx.requesterId` — the screening screen is an OWN surface.
//      Even at `reconcile` (where the chokepoint would hand back every row so the
//      Conflicts screen can reconcile), THIS screen still shows only the caller's
//      own calls. Co-reviewer reconciliation lives on its own screen (T13).
//   2. `!isAi` — the AI reviewer's verdict is blinded like a human's; it never
//      appears on the screening screen. Its calls surface only at reconciliation.
//
// A leak of a co-reviewer's or the AI's decision through this seam would breach
// blinding — it is exercised by the T6-style side-channel test for this screen.
// ─────────────────────────────────────────────────────────────────────────────

function toKind(decision: string): ScreeningDecisionKind | null {
  if (decision === 'include' || decision === 'maybe' || decision === 'exclude') {
    return decision;
  }
  return null;
}

function toOwnDecision(row: ScreeningDecisionView): OwnDecisionDTO | null {
  const decision = toKind(row.decision);
  if (!decision) return null;
  return {
    studyId: row.studyId,
    decision,
    excludeReasonCode: row.excludeReasonCode,
    excludeReasonDetail: row.excludeReasonDetail,
    locked: row.lockedAt != null,
  };
}

export async function getOwnScreeningDecisions(
  ctx: BlindedContext,
  stage: ScreeningStage,
): Promise<OwnDecisionDTO[]> {
  const rows = await getScreeningDecisions(ctx);
  const own: OwnDecisionDTO[] = [];
  for (const row of rows) {
    if (row.reviewerId !== ctx.requesterId) continue;
    if (row.isAi) continue;
    if (row.stage !== stage) continue;
    const decision = toOwnDecision(row);
    if (decision) own.push(decision);
  }
  return own;
}

// True once the reviewer has finished screening — i.e. they have authored at
// least one decision for this stage and every one of them is locked.
export function hasFinishedScreening(decisions: readonly OwnDecisionDTO[]): boolean {
  return decisions.length > 0 && decisions.every((d) => d.locked);
}
