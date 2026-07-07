import { ExternalLink, Globe } from 'lucide-react';
import type { UnifiedSearchResult } from '@/types/search';
import { getResultUrl } from './result-url';
import styles from './web-result-card.module.css';

export type WebResultVariant = 'web' | 'news' | 'discussions';

interface MetaPart {
  text: string;
  isNumeral: boolean;
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
      source && { text: source, isNumeral: false },
      result.engagement && { text: result.engagement, isNumeral: true },
    ].filter((part): part is MetaPart => Boolean(part));
  }

  const source =
    variant === 'news' ? (result.sourceLabel ?? result.domain) : result.domain;
  const date = formatDate(result.publishedAt);
  return [
    source && { text: source, isNumeral: false },
    date && { text: date, isNumeral: true },
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
              <span className={part.isNumeral ? styles.numeral : undefined}>
                {part.text}
              </span>
            </span>
          ))}
        </p>
      )}

      {result.abstract && <p className={styles.snippet}>{result.abstract}</p>}

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
