import type { ReviewMode } from '@/lib/sr/review-modes';
import { aiReviewerRoleForMode } from './coverage';
import type { AiPhase1Mode } from './config';

// ─────────────────────────────────────────────────────────────────────────────
// AI-reviewer RAIL view-model — the composable hook T12's screening screen reads
// to render the AI reviewer beside the human reviewers. Pure (no DB, no React) so
// its invariants are unit-provable and T12 can drop it in unchanged.
//
// The invariants baked into the TYPES here (not just the runtime):
//   • showScore is the literal `false` — the AI relevance/confidence score is
//     NEVER shown (FOUNDATION §8). There is no code path that sets it true.
//   • verdictVisible is true ONLY at reconcile — the AI's verdict + reasoning are
//     withheld during independent, exactly like a human co-reviewer.
//   • Optionally a LABELLED queue order may be offered (never a score) — order is
//     the only AI-derived signal a reviewer may see, and it is clearly labelled.
// ─────────────────────────────────────────────────────────────────────────────

export interface AiReviewerRailModel {
  /** The AI is a labelled member of the team in both review modes. */
  present: true;
  /** Passed recall validation — only then does it actually cast verdicts. */
  validated: boolean;
  /** Second independent reviewer (ai_co_reviewer) vs additional QC (two_reviewer). */
  role: 'second_reviewer' | 'additional_qc';
  /** The AI verdict + reasoning are visible ONLY at reconcile. */
  verdictVisible: boolean;
  /** The relevance score is NEVER shown. Typed as the literal false. */
  showScore: false;
  /** Optional labelled queue ordering — the only AI signal allowed pre-reconcile. */
  queueOrder: { enabled: boolean; label: string } | null;
  /** A short, honest status line for the rail. */
  statusLabel: string;
}

export interface AiReviewerRailInput {
  reviewMode: ReviewMode;
  validated: boolean;
  phase: 'independent' | 'reconcile';
  phase1Mode: AiPhase1Mode;
  /** Turn on the optional labelled queue-order affordance (default off). */
  queueOrderEnabled?: boolean;
}

const QUEUE_ORDER_LABEL = 'AI-suggested order (not a score)';

function statusLabel(input: AiReviewerRailInput): string {
  if (!input.validated) {
    return 'AI reviewer · not validated — recall validation required before it screens';
  }
  if (input.phase === 'reconcile') {
    return 'AI reviewer · verdict revealed at reconciliation';
  }
  const running =
    input.phase1Mode === 'silent_hold'
      ? 'running silently'
      : 'holding until reconcile';
  return `AI reviewer · blinded during independent screening (${running})`;
}

export function buildAiReviewerRail(
  input: AiReviewerRailInput,
): AiReviewerRailModel {
  return {
    present: true,
    validated: input.validated,
    role: aiReviewerRoleForMode(input.reviewMode),
    verdictVisible: input.phase === 'reconcile',
    showScore: false,
    queueOrder: input.queueOrderEnabled
      ? { enabled: true, label: QUEUE_ORDER_LABEL }
      : null,
    statusLabel: statusLabel(input),
  };
}
