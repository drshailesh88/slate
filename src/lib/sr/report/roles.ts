import type { ReviewRole } from '@/lib/sr/authz/policy';

// Who may trigger an AI draft of report prose. Reading the report needs only
// membership (the layout's gate); drafting is a review-shaping act, so it is
// held to the same bar as managing the review.
export function canDraftReport(role: ReviewRole): boolean {
  return role === 'owner' || role === 'collaborator';
}
