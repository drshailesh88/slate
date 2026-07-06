'use client';

import { SrReviewProvider, type SrReviewContextValue } from './review-context';
import { SrStageRail } from './sr-stage-rail';
import styles from './sr-shell.module.css';

// The SR module frame: a contextual left rail (the funnel spine) beside the
// active stage canvas, rendered INSIDE Slate's locked app shell. It never
// touches the global shell/nav — it is a second panel within the app content
// area (anti-frankenstein-doctrine).

export function SrShell({
  reviewContext,
  children,
}: {
  reviewContext: SrReviewContextValue;
  children: React.ReactNode;
}) {
  const meta = `${reviewContext.reviewType} · ${reviewContext.studyCount} ${
    reviewContext.studyCount === 1 ? 'study' : 'studies'
  }`;

  return (
    <SrReviewProvider value={reviewContext}>
      <div className={styles.module}>
        <SrStageRail
          reviewId={reviewContext.reviewId}
          title={reviewContext.title}
          meta={meta}
          studyCount={reviewContext.studyCount}
        />
        <div className={styles.canvas}>{children}</div>
      </div>
    </SrReviewProvider>
  );
}
