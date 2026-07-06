'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUp, Plus } from 'lucide-react';
import styles from './composer.module.css';

// Rest-state shell only — full composer states live in
// docs/design/specs/composer-states.md and are a fast-follow.
export function Composer() {
  const router = useRouter();
  const [value, setValue] = useState('');
  const hasText = value.trim().length > 0;

  function submit() {
    const q = value.trim();
    if (!q) return;
    router.push(`/explore?q=${encodeURIComponent(q)}`);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className={styles.composer}>
      <textarea
        className={styles.input}
        placeholder="What are you working on?"
        rows={2}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
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
          onClick={submit}
        >
          <ArrowUp size={16} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
