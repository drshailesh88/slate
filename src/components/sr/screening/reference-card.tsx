'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { highlightAbstract } from '@/lib/sr/screening/highlight';
import type {
  HighlightTermsDTO,
  ScreeningStudyDTO,
} from '@/lib/sr/screening/types';
import styles from './screening-screen.module.css';

// The work surface (center zone): reference identity + abstract with inclusion
// terms highlighted Jade and exclusion terms Tomato (from the LOCKED protocol,
// resolved server-side — not the AI's take). Ported from the precursor's
// reference-card and re-skinned to tokens.

function Abstract({ text, terms }: { text: string; terms: HighlightTermsDTO }) {
  const segments = highlightAbstract(text, terms);
  return (
    <div className={styles.abstract}>
      {segments.map((segment, index) => {
        if (segment.kind === 'include') {
          return (
            <span className={styles.hlInclude} key={index}>
              {segment.text}
            </span>
          );
        }
        if (segment.kind === 'exclude') {
          return (
            <span className={styles.hlExclude} key={index}>
              {segment.text}
            </span>
          );
        }
        return <span key={index}>{segment.text}</span>;
      })}
    </div>
  );
}

export function ReferenceCard({
  study,
  terms,
}: {
  study: ScreeningStudyDTO;
  terms: HighlightTermsDTO;
}) {
  const [open, setOpen] = useState(true);

  const metaParts = [
    study.journal,
    study.year != null ? String(study.year) : null,
  ].filter(Boolean);

  return (
    <article className={styles.refCard}>
      <div className={styles.refId}>{study.refId}</div>
      <h2 className={styles.refTitle}>{study.title}</h2>
      {study.authors ? (
        <div className={styles.refAuthors}>{study.authors}</div>
      ) : null}
      <div className={styles.refMeta}>
        {metaParts.join(' · ')}
        {study.doi ? (
          <>
            {metaParts.length > 0 ? ' · ' : ''}
            <a
              className={styles.refDoi}
              href={`https://doi.org/${study.doi}`}
              target="_blank"
              rel="noreferrer"
            >
              DOI {study.doi}
              <ExternalLink size={11} aria-hidden />
            </a>
          </>
        ) : null}
      </div>

      {study.abstract ? (
        <>
          <button
            type="button"
            className={styles.abstractToggle}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? (
              <ChevronDown size={13} aria-hidden />
            ) : (
              <ChevronRight size={13} aria-hidden />
            )}
            Abstract
          </button>
          {open ? <Abstract text={study.abstract} terms={terms} /> : null}
        </>
      ) : (
        <p className={styles.noAbstract}>
          No abstract on record for this reference.
        </p>
      )}
    </article>
  );
}
