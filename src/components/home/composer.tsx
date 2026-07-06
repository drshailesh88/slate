'use client';

import { useState } from 'react';
import { ArrowUp, Plus } from 'lucide-react';
import styles from './composer.module.css';

// Rest-state shell only — full composer states live in
// docs/design/specs/composer-states.md and are a fast-follow.
export function Composer() {
  const [value, setValue] = useState('');
  const hasText = value.trim().length > 0;

  return (
    <div className={styles.composer}>
      <textarea
        className={styles.input}
        placeholder="What are you working on?"
        rows={2}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        aria-label="What are you working on?"
      />
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.catalogueButton}
          aria-label="Open catalogue"
          title="Catalogue"
        >
          <Plus size={16} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className={styles.sendButton}
          disabled={!hasText}
          aria-label="Send"
        >
          <ArrowUp size={16} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
