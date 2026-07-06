'use client';

import { ChevronDown } from 'lucide-react';
import styles from './filter-pills.module.css';

const PILL_LABELS = ['Scope', 'Sort: Relevance', 'Time: Any year'] as const;

/**
 * Slice 1 renders the filter bar present but inert: results already arrive
 * relevance-sorted from the engine, so faking a live scope/sort/time filter
 * here would apply a filter that lies about state. Each pill stays fully
 * legible (no dimmed/greyed treatment) so it reads as "present, not yet
 * active" rather than broken. Slice 2 wires these to real filtering and
 * opens the dropdown menus — no structural change needed here.
 */
export function FilterPills() {
  return (
    <div className={styles.bar}>
      {PILL_LABELS.map((label) => (
        <button
          key={label}
          type="button"
          className={styles.pill}
          disabled
          aria-disabled="true"
        >
          {label}
          <ChevronDown size={14} strokeWidth={1.75} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
