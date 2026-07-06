'use client';

import { useState } from 'react';
import { FileText, Plus, Sparkles } from 'lucide-react';
import type { SourceView } from '@/lib/reading-room/canvas-types';
import styles from './canvas.module.css';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const STATUS_LABEL: Record<SaveStatus, string> = {
  idle: '',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Save failed',
};

export function Toolbar({
  sources,
  onAddSource,
  onAddSynthesis,
  saveStatus,
}: {
  sources: SourceView[];
  onAddSource: (source: SourceView) => void;
  onAddSynthesis: () => void;
  saveStatus: SaveStatus;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className={styles.toolbar}>
      <div className={styles.menuWrap}>
        <button
          type="button"
          className={styles.button}
          onClick={() => setIsMenuOpen((open) => !open)}
          aria-expanded={isMenuOpen}
        >
          <Plus size={15} strokeWidth={1.75} />
          Add source
        </button>
        {isMenuOpen ? (
          <div className={styles.menu} role="menu">
            {sources.length === 0 ? (
              <p className={styles.menuEmpty}>No sources available.</p>
            ) : (
              sources.map((source) => (
                <button
                  key={source.id}
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => {
                    onAddSource(source);
                    setIsMenuOpen(false);
                  }}
                >
                  <span className={styles.menuItemTitle}>
                    <FileText
                      size={12}
                      strokeWidth={1.75}
                      style={{ marginRight: 6, verticalAlign: '-1px' }}
                    />
                    {source.title}
                  </span>
                  <span className={styles.menuItemMeta}>
                    {source.authors ?? 'Unknown'}
                    {source.year ? ` · ${source.year}` : ''}
                  </span>
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>

      <button type="button" className={styles.button} onClick={onAddSynthesis}>
        <Sparkles size={15} strokeWidth={1.75} />
        Add synthesis
      </button>

      <span className={styles.status} aria-live="polite">
        {STATUS_LABEL[saveStatus]}
      </span>
    </div>
  );
}
