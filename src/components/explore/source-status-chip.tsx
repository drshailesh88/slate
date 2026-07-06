import { Check } from 'lucide-react';
import type { SourceStatus } from '@/types/search';
import styles from './source-status-chip.module.css';

export interface SourceStatusSummary {
  label: string;
  degraded: boolean;
  reasons: string[];
}

function prettifySourceName(key: string): string {
  return key
    .split('_')
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * A source absent from `sourceStatuses` (or present with status "ok") is a
 * genuine empty/complete result — only entries with a non-"ok" status are
 * degraded. Degraded sources are always named, never folded into a bare
 * count, so an outage can never read as "no results".
 */
export function sourceStatusModel(
  sourceStatuses?: Record<string, SourceStatus>,
  sourceCount?: number,
): SourceStatusSummary {
  const total = sourceCount ?? Object.keys(sourceStatuses ?? {}).length;
  const sourceWord = total === 1 ? 'source' : 'sources';

  const degraded = Object.entries(sourceStatuses ?? {}).filter(
    ([, status]) => status.status !== 'ok',
  );

  if (degraded.length === 0) {
    return { label: `${total} ${sourceWord}`, degraded: false, reasons: [] };
  }

  const okCount = total - degraded.length;
  const reasons = degraded.map(
    ([key]) => `${prettifySourceName(key)} temporarily unavailable`,
  );

  return {
    label: `${okCount} of ${total} ${sourceWord} · ${reasons.join(', ')}`,
    degraded: true,
    reasons,
  };
}

export function SourceStatusChip({ model }: { model: SourceStatusSummary }) {
  if (model.degraded) {
    return (
      <span
        className={`${styles.chip} ${styles.degraded}`}
        title={model.reasons.join(', ')}
      >
        <span className={styles.dot} aria-hidden="true" />
        {model.label}
      </span>
    );
  }

  return (
    <span className={styles.chip}>
      <Check
        size={12}
        strokeWidth={2}
        className={styles.check}
        aria-hidden="true"
      />
      {model.label}
    </span>
  );
}
