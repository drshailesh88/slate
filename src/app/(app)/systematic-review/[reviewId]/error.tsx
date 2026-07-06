'use client';

import { AlertTriangle } from 'lucide-react';
import styles from './sr-stage.module.css';

export default function SrStageError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className={styles.stage}>
      <div className={styles.errorBlock} role="alert">
        <AlertTriangle size={18} strokeWidth={1.75} aria-hidden />
        <h2 className={styles.errorTitle}>This stage could not load</h2>
        <p className={styles.errorBody}>
          {error.message ||
            'Something went wrong while loading the review. Your decisions are saved — retry to pick up where you left off.'}
        </p>
        <button type="button" className={styles.retry} onClick={reset}>
          Retry
        </button>
      </div>
    </div>
  );
}
