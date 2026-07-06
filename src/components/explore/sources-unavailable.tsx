'use client';

import { CloudOff, RefreshCw } from 'lucide-react';
import styles from './sources-unavailable.module.css';

/**
 * Whole-tab-down variant of the Source-degraded state (design.md
 * explore-search-states.md §4): every source failed, so there is nothing
 * degraded-but-partial to show — this must never render as `NoResults`,
 * which would read a real outage as "no papers matched" (silent-failure-
 * as-zero). Amber, not Tomato: this is a source-health disclosure, not a
 * request failure (see `search-error.tsx` for that case).
 */
export function SourcesUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className={styles.wrap}
      role="status"
      aria-label="Academic search is temporarily unavailable"
    >
      <CloudOff
        size={20}
        strokeWidth={1.75}
        className={styles.icon}
        aria-hidden="true"
      />
      <p className={styles.headline}>
        Academic search is temporarily unavailable
      </p>
      <p className={styles.body}>
        Your query is saved — try again in a moment.
      </p>
      <button type="button" className={styles.retry} onClick={onRetry}>
        <RefreshCw size={14} strokeWidth={1.75} aria-hidden="true" />
        Try again
      </button>
    </div>
  );
}
