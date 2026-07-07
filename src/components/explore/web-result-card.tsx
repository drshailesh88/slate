import { ExternalLink, Globe } from 'lucide-react';
import type { UnifiedSearchResult } from '@/types/search';
import { getResultUrl } from './result-url';
import { renderWithMonoNumerals } from './mono-numerals';
import { stripMarkdown } from './strip-markdown';
import styles from './web-result-card.module.css';

export type WebResultVariant = 'web' | 'news' | 'discussions';

// 'none' — plain prose, never mono.
// 'whole' — the entire value is a numeral-like token (e.g. a date).
// 'digits' — prose mixed with counts (e.g. engagement); only the digit
// runs render in --mono (design.md §4), never the surrounding words.
type MonoMode = 'none' | 'whole' | 'digits';

interface MetaPart {
  text: string;
  mono: MonoMode;
}

function formatDate(iso?: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function buildMetaParts(
  result: UnifiedSearchResult,
  variant: WebResultVariant,
): MetaPart[] {
  if (variant === 'discussions') {
    const source = result.platform ?? result.sourceLabel;
    return [
      source && { text: source, mono: 'none' },
      result.engagement && { text: result.engagement, mono: 'digits' },
    ].filter((part): part is MetaPart => Boolean(part));
  }

  const source =
    variant === 'news' ? (result.sourceLabel ?? result.domain) : result.domain;
  const date = formatDate(result.publishedAt);
  return [
    source && { text: source, mono: 'none' },
    date && { text: date, mono: 'whole' },
  ].filter((part): part is MetaPart => Boolean(part));
}

export function WebResultCard({
  result,
  variant,
}: {
  result: UnifiedSearchResult;
  variant: WebResultVariant;
}) {
  const href = getResultUrl(result);
  const metaParts = buildMetaParts(result, variant);
  const snippet = stripMarkdown(result.abstract);

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

      {metaParts.length > 0 && (
        <p className={styles.meta}>
          <Globe
            size={12}
            strokeWidth={1.75}
            aria-hidden="true"
            className={styles.marker}
          />
          {metaParts.map((part, index) => (
            <span key={part.text}>
              {index > 0 && ' · '}
              {part.mono === 'digits' ? (
                renderWithMonoNumerals(part.text, styles.numeral)
              ) : (
                <span
                  className={part.mono === 'whole' ? styles.numeral : undefined}
                >
                  {part.text}
                </span>
              )}
            </span>
          ))}
        </p>
      )}

      {snippet && <p className={styles.snippet}>{snippet}</p>}

      {href && (
        <div className={styles.actions}>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.actionButton}
          >
            <ExternalLink size={13} strokeWidth={1.75} aria-hidden="true" />
            Open
          </a>
        </div>
      )}
    </article>
  );
}
