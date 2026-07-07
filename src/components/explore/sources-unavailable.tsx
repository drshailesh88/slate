'use client';

import { CloudOff, RefreshCw } from 'lucide-react';
import type { ExploreTab } from './tab-bar';
import styles from './sources-unavailable.module.css';

const TAB_LABELS: Record<ExploreTab, string> = {
  academic: 'Academic',
  web: 'Web',
  news: 'News',
  discussions: 'Discussions',
  videos: 'Videos',
};

/**
 * Whole-tab-down variant of the Source-degraded state (design.md
 * explore-search-states.md §4): every source failed, so there is nothing
 * degraded-but-partial to show — this must never render as `NoResults`,
 * which would read a real outage as "no papers matched" (silent-failure-
 * as-zero). Amber, not Tomato: this is a source-health disclosure, not a
 * request failure (see `search-error.tsx` for that case).
 */
export function SourcesUnavailable({
  onRetry,
  tab = 'academic',
}: {
  onRetry: () => void;
  tab?: ExploreTab;
}) {
  const isAcademic = tab === 'academic';
  const headline = `${TAB_LABELS[tab]} search is temporarily unavailable`;

  return (
    <div className={styles.wrap} role="status" aria-label={headline}>
      <CloudOff
        size={20}
        strokeWidth={1.75}
        className={styles.icon}
        aria-hidden="true"
      />
      <p className={styles.headline}>{headline}</p>
      <p className={styles.body}>
        Your query is saved — try again in a moment.
      </p>
      {!isAcademic && <p className={styles.muted}>Academic is unaffected.</p>}
      <button type="button" className={styles.retry} onClick={onRetry}>
        <RefreshCw size={14} strokeWidth={1.75} aria-hidden="true" />
        Try again
      </button>
    </div>
  );
}
