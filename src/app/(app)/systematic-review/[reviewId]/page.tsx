import { ReviewSummaryContainer } from '@/components/sr/summary/review-summary-container';

// The review Summary — the funnel home / index of a review. It renders inside
// the [reviewId] layout (which already gated the flag, authorized membership via
// requireMember, and resolved the blinding-safe review context). All funnel
// counts route through the chokepoint: the imported total from `studies`
// (non-blinded) and completion progress from `getSafeProgress` — never a client
// store and never the blinded tables. See sr-build-plan-p4/report.md §4 (row 0).
export default function ReviewSummaryPage() {
  return <ReviewSummaryContainer />;
}
