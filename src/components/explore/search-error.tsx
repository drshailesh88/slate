'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import styles from './search-error.module.css';

export function SearchError({
  query,
  onRetry,
}: {
  query: string;
  onRetry: () => void;
}) {
  return (
    <div
      className={styles.wrap}
      role="alert"
      aria-label={`Search for "${query}" failed`}
    >
      <AlertTriangle
        size={20}
        strokeWidth={1.75}
        className={styles.icon}
        aria-hidden="true"
      />
      <p className={styles.headline}>Couldn&apos;t run that search</p>
      <p className={styles.body}>
        Something went wrong on our end — your query is saved. Try again in a
        moment.
      </p>
      <button type="button" className={styles.retry} onClick={onRetry}>
        <RefreshCw size={14} strokeWidth={1.75} aria-hidden="true" />
        Try again
      </button>
    </div>
  );
}
