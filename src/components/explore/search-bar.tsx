'use client';

import { useState, type KeyboardEvent } from 'react';
import { Search } from 'lucide-react';
import styles from './search-bar.module.css';

export function SearchBar({
  value,
  onSubmit,
}: {
  value: string;
  onSubmit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  // Adjust state during render (React's recommended alternative to an
  // effect-driven sync) to pick up query changes from elsewhere — a retry or
  // a routing-chip arrival — without clobbering in-progress typing.
  const [syncedValue, setSyncedValue] = useState(value);
  if (value !== syncedValue) {
    setSyncedValue(value);
    setDraft(value);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      onSubmit(draft);
    }
  }

  return (
    <div className={styles.bar}>
      <Search
        size={16}
        strokeWidth={1.75}
        className={styles.icon}
        aria-hidden="true"
      />
      <input
        type="text"
        className={styles.input}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        aria-label="Search"
        placeholder="Search papers, topics, or claims"
      />
      <span className={styles.kbd} aria-hidden="true">
        ⌘K
      </span>
    </div>
  );
}
