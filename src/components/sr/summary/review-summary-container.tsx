'use client';

import { useSrReview } from '@/components/sr/review-context';
import { buildFunnelSummary } from '@/lib/sr/summary/funnel';
import { ReviewSummary } from './review-summary';

// The Review Summary's data seam. It reads the review context resolved once,
// server-side, by the [reviewId] layout — which sourced the imported total from
// `studies` (non-blinded) and the completion progress from `getSafeProgress`
// (the T2 chokepoint). This REPLACES the precursor's monolithic client store
// that held every reviewer's votes (the structural blinding hole): the context
// carries only chokepoint-safe facts, so the funnel can only ever render safe
// counts. See sr-build-plan-p4/report.md §4 (row 0) + §5.

export function ReviewSummaryContainer() {
  const review = useSrReview();

  const model = buildFunnelSummary({
    reviewId: review.reviewId,
    studyCount: review.studyCount,
    safeProgress: review.safeProgress,
  });

  return (
    <ReviewSummary
      model={model}
      reviewTitle={review.title}
      reviewType={review.reviewType}
      role={review.role}
    />
  );
}
