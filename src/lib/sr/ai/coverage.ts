import type { ReviewMode } from '@/lib/sr/review-modes';

// ─────────────────────────────────────────────────────────────────────────────
// Human-coverage invariant (FOUNDATION-auth-tenancy.md §9.8): the AI NEVER
// reduces the number of independent HUMAN decisions a review requires.
//
//   • two_reviewer   — TWO humans per record. The AI is a *third* input (QC); it
//                      does not replace either required human decision.
//   • ai_co_reviewer — ONE human per record, with the AI as the validated second
//                      independent reviewer.
//
// This is a pure function of the review mode ALONE — the presence, activation, or
// validation state of the AI can never change it. The AI is a synthetic user and
// is never counted as one of these required humans (it is not a review_members
// row), so completion/coverage math is structurally unaffected.
// ─────────────────────────────────────────────────────────────────────────────

export function requiredHumanReviewers(mode: ReviewMode): number {
  switch (mode) {
    case 'two_reviewer':
      return 2;
    case 'ai_co_reviewer':
      return 1;
    default:
      // Deny-by-default: an unknown mode demands the stricter two-human floor.
      return 2;
  }
}

// Whether the AI is the validated SECOND reviewer (ai_co_reviewer) or an
// additional QC/third input (two_reviewer). In neither case does it lower the
// human count above.
export function aiReviewerRoleForMode(
  mode: ReviewMode,
): 'second_reviewer' | 'additional_qc' {
  return mode === 'ai_co_reviewer' ? 'second_reviewer' : 'additional_qc';
}
