import { ChevronDown } from 'lucide-react';
import type { SearchResponse } from '@/types/search';
import { honestCount } from './honest-count';
import { renderWithMonoNumerals } from './mono-numerals';
import { sourceStatusModel, SourceStatusChip } from './source-status-chip';
import { isAcademicTab } from './tab-meta';
import type { ExploreTab } from './tab-bar';
import styles from './result-header.module.css';

// The count line mixes prose and grouped numerals; only the numerals render
// in --mono (design.md §3).
function renderCountLine(line: string) {
  return renderWithMonoNumerals(line, styles.num);
}

export function ResultHeader({
  data,
  tab = 'academic',
}: {
  data: SearchResponse;
  tab?: ExploreTab;
}) {
  const model = sourceStatusModel(data.sourceStatuses, data.sourceCounts);

  return (
    <div className={styles.header}>
      <p className={styles.count}>{renderCountLine(honestCount(data, tab))}</p>
      {isAcademicTab(tab) && (
        <div className={styles.sources}>
          <SourceStatusChip model={model} />
          {/* Slice 1 has no source list to open — Slice 2 wires this. Present,
              not yet active (FilterPills/Beta-tab discipline), not a dead
              control that pretends to work. */}
          <button
            type="button"
            className={styles.sourcesButton}
            disabled
            aria-disabled="true"
          >
            Sources
            <ChevronDown size={14} strokeWidth={1.75} />
          </button>
        </div>
      )}
    </div>
  );
}
