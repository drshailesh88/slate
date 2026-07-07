'use client';

import { useState } from 'react';
import { ExternalLink, Copy, Check, Quote } from 'lucide-react';
import type { UnifiedSearchResult } from '@/types/search';
import { formatCitation } from './format-citation';
import { getResultUrl } from './result-url';
import { JournalQuartileBadge } from './journal-quartile-badge';
import styles from './academic-result-card.module.css';

const MAX_DISPLAYED_AUTHORS = 3;

/**
 * The meta line is a one-line-ish glance, not a citation — a 20-author paper
 * must not turn it into a 5+ line author block. `formatCitation` (the Cite
 * action) always uses the full list; only this display truncates.
 */
function formatDisplayedAuthors(authors: string[]): string {
  if (authors.length <= MAX_DISPLAYED_AUTHORS) return authors.join(', ');
  return `${authors.slice(0, MAX_DISPLAYED_AUTHORS).join(', ')} et al.`;
}

export function AcademicResultCard({
  result,
}: {
  result: UnifiedSearchResult;
}) {
  const [copied, setCopied] = useState(false);
  const href = getResultUrl(result);
  const authors = formatDisplayedAuthors(result.authors);

  async function handleCite() {
    try {
      await navigator.clipboard.writeText(formatCitation(result));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied by the browser; the citation text is
      // still visible in the card, so the user can select and copy it by hand.
    }
  }

  return (
    <article className={styles.card}>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.title}
        >
          {result.title}
        </a>
      ) : (
        <span className={styles.title}>{result.title}</span>
      )}

      <p className={styles.meta}>
        {authors} · {result.journal} ·{' '}
        <span className={styles.year}>{result.year}</span>
      </p>

      <div className={styles.badgeRow}>
        <JournalQuartileBadge quartile={result.journalQuartile} />
        {result.studyType && (
          <span className={styles.studyTypeChip}>{result.studyType}</span>
        )}
        <span className={styles.citations}>
          <Quote size={12} strokeWidth={1.75} aria-hidden="true" />
          <span className={styles.citationCount}>{result.citationCount}</span>
        </span>
      </div>

      {result.abstract && <p className={styles.snippet}>{result.abstract}</p>}

      <div className={styles.actions}>
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.actionButton}
          >
            <ExternalLink size={13} strokeWidth={1.75} aria-hidden="true" />
            Open
          </a>
        )}
        <button
          type="button"
          className={styles.actionButton}
          onClick={handleCite}
        >
          {copied ? (
            <Check size={13} strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <Copy size={13} strokeWidth={1.75} aria-hidden="true" />
          )}
          {copied ? 'Copied' : 'Cite'}
        </button>
      </div>
    </article>
  );
}
