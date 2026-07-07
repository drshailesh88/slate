import type { UnifiedSearchResult } from '@/types/search';
import styles from './journal-quartile-badge.module.css';

const TOP_TIER = new Set(['Q1', 'Q2']);

export function JournalQuartileBadge({
  quartile,
}: {
  quartile: UnifiedSearchResult['journalQuartile'];
}) {
  if (!quartile) return null;

  const isTopTier = TOP_TIER.has(quartile);

  return (
    <span
      className={`${styles.badge} ${isTopTier ? styles.topTier : styles.lowerTier}`}
    >
      {quartile}
    </span>
  );
}
