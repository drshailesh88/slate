'use client';

import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type { UnifiedSearchResult } from '@/types/search';
import { getResultUrl } from './result-url';
import { youtubeThumbnail } from './youtube';
import styles from './video-result-card.module.css';

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

export function VideoResultCard({ result }: { result: UnifiedSearchResult }) {
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const href = getResultUrl(result);
  const thumbnailSrc = youtubeThumbnail(result.url);
  const showThumbnail = Boolean(thumbnailSrc) && !thumbnailFailed;
  const date = formatDate(result.publishedAt);

  const thumbnailImg = (
    // next/image requires a known dimension/loader config; YouTube's
    // img.youtube.com thumbnails are an external, first-party exception
    // (design.md's "no external images" rule doesn't apply to a video's own
    // thumbnail), so a plain <img> with onError fallback is intentional here.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={thumbnailSrc ?? undefined}
      alt={result.title}
      loading="lazy"
      className={styles.thumbnailImage}
      onError={() => setThumbnailFailed(true)}
    />
  );

  return (
    <article className={styles.card}>
      {showThumbnail && (
        <div className={styles.thumbnail}>
          {href ? (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {thumbnailImg}
            </a>
          ) : (
            thumbnailImg
          )}
        </div>
      )}

      <div className={styles.body}>
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
          {result.sourceLabel}
          {date && (
            <>
              {' '}
              · <span className={styles.date}>{date}</span>
            </>
          )}
        </p>

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
      </div>
    </article>
  );
}
