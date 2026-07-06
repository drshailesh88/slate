'use client';

import { AlertTriangle } from 'lucide-react';
import styles from './sr-home-status.module.css';

export default function SystematicReviewHomeError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className={styles.wrap}>
      <div className={styles.errorBlock} role="alert">
        <AlertTriangle size={18} strokeWidth={1.75} aria-hidden />
        <h2 className={styles.errorTitle}>Systematic Review is unavailable</h2>
        <p className={styles.errorBody}>
          {error.message || "We couldn't load your reviews. Please try again."}
        </p>
        <button type="button" className={styles.retry} onClick={reset}>
          Retry
        </button>
      </div>
    </div>
  );
}
