import { Fragment } from 'react';
import { ChevronDown } from 'lucide-react';
import type { SearchResponse } from '@/types/search';
import { honestCount } from './honest-count';
import { sourceStatusModel, SourceStatusChip } from './source-status-chip';
import styles from './result-header.module.css';

// The count line mixes prose and grouped numerals; only the numerals render
// in --mono (design.md §3), so split on digit runs (with thousands commas)
// and wrap just those spans.
function renderCountLine(line: string) {
  return line.split(/(\d[\d,]*)/g).map((chunk, index) =>
    /^\d/.test(chunk) ? (
      <span key={index} className={styles.num}>
        {chunk}
      </span>
    ) : (
      <Fragment key={index}>{chunk}</Fragment>
    ),
  );
}

export function ResultHeader({ data }: { data: SearchResponse }) {
  const model = sourceStatusModel(
    data.sourceStatuses,
    Object.keys(data.sourceCounts).length,
  );

  return (
    <div className={styles.header}>
      <p className={styles.count}>{renderCountLine(honestCount(data))}</p>
      <div className={styles.sources}>
        <SourceStatusChip model={model} />
        <button type="button" className={styles.sourcesButton}>
          Sources
          <ChevronDown size={14} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}
