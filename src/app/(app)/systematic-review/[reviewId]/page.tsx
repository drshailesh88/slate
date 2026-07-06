'use client';

import { useSrReview } from '@/components/sr/review-context';
import styles from './sr-stage.module.css';

// Shell placeholder for the review Summary (the funnel index). The full Summary
// screen lands in its own M2 task and will replace this file; for now it proves
// the review-context seam by reading the layout-provided, blinding-safe context.
export default function ReviewSummaryPage() {
  const review = useSrReview();
  const { screening, extraction, rob } = review.safeProgress;

  return (
    <div className={styles.stage}>
      <div className={styles.eyebrow}>Systematic review</div>
      <h1 className={styles.title}>{review.title}</h1>
      <p className={styles.lead}>
        {review.reviewType} · you are {article(review.role)}{' '}
        <strong>{review.role}</strong> on this review.
      </p>

      <div className={styles.statRow}>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{review.studyCount}</div>
          <div className={styles.statLabel}>Studies imported</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>
            {screening.finishedReviewers}/{screening.totalReviewers}
          </div>
          <div className={styles.statLabel}>Screening complete</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>
            {extraction.finishedReviewers}/{extraction.totalReviewers}
          </div>
          <div className={styles.statLabel}>Extraction complete</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>
            {rob.finishedReviewers}/{rob.totalReviewers}
          </div>
          <div className={styles.statLabel}>Risk of bias complete</div>
        </div>
      </div>

      <p className={styles.note}>
        This is the review shell. Pick a built stage from the rail — the funnel
        stages beyond Import arrive in later milestones.
      </p>
    </div>
  );
}

function article(role: string): string {
  return /^[aeiou]/i.test(role) ? 'an' : 'a';
}
