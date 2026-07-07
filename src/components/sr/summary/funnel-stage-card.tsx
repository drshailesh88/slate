'use client';

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import styles from './review-summary.module.css';

// A single funnel stage row on the Review Summary. Collapsible when it carries a
// body (the safe team-progress readout); a plain row otherwise. Built stages show
// their next-action links; not-yet-built stages show a quiet "Soon" marker —
// consistent with the shell stage rail.

interface FunnelStageCardProps {
  name: string;
  /** Funnel position badge (1–9). */
  n?: number;
  /** Safe meta line — imported total or completion counts only. */
  meta?: string | null;
  /** Whether the stage has a route today. Unbuilt → "Soon", no links. */
  built: boolean;
  /** Next-action links, rendered only when the stage is built. */
  links?: React.ReactNode;
  defaultOpen?: boolean;
  children?: React.ReactNode;
}

export function FunnelStageCard({
  name,
  n,
  meta,
  built,
  links,
  defaultOpen = false,
  children,
}: FunnelStageCardProps) {
  const collapsible = Boolean(children);
  const [open, setOpen] = useState(defaultOpen);

  const sectionClass = [
    styles.fstage,
    open && collapsible ? styles.open : '',
    built ? '' : styles.locked,
  ]
    .filter(Boolean)
    .join(' ');

  const header = (
    <>
      <span className={styles.badge} aria-hidden>
        {n ?? '·'}
      </span>
      {collapsible ? (
        <span className={styles.chev} aria-hidden>
          <ChevronRight size={14} />
        </span>
      ) : null}
      <span className={styles.fname}>{name}</span>
      {meta ? <span className={styles.fmeta}>{meta}</span> : null}
      {built ? (
        links ? (
          <span className={styles.flinks}>{links}</span>
        ) : null
      ) : (
        <span className={styles.soon}>Soon</span>
      )}
    </>
  );

  return (
    <section className={sectionClass}>
      {collapsible ? (
        <button
          type="button"
          className={styles.top}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {header}
        </button>
      ) : (
        <div className={`${styles.top} ${styles.plain}`}>{header}</div>
      )}
      {collapsible && open ? (
        <div className={styles.fbody}>{children}</div>
      ) : null}
    </section>
  );
}
