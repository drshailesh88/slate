'use client';

import Link from 'next/link';
import { isStageBuilt, stageHref, type SrStageId } from '@/lib/sr/stage-rail';
import styles from './review-summary.module.css';

// Inline stage link / button that stays inert until the target stage has a route.
// "Built" is decided by the shell rail's single source of truth (`isStageBuilt`),
// so the summary and the rail can never disagree about what is reachable.

interface StageTarget {
  reviewId: string;
  stage: SrStageId;
  children: React.ReactNode;
}

export function StageLink({ reviewId, stage, children }: StageTarget) {
  if (!isStageBuilt(stage)) {
    return (
      <span
        className={`${styles.link} ${styles.linkMuted}`}
        aria-disabled="true"
      >
        {children}
      </span>
    );
  }
  return (
    <Link href={stageHref(reviewId, stage)} className={styles.link}>
      {children}
    </Link>
  );
}

export function StageButton({
  reviewId,
  stage,
  primary,
  children,
}: StageTarget & { primary?: boolean }) {
  const className = [styles.btn, primary ? styles.btnPrimary : '']
    .filter(Boolean)
    .join(' ');

  if (!isStageBuilt(stage)) {
    return (
      <button type="button" className={className} disabled>
        {children}
      </button>
    );
  }
  return (
    <Link href={stageHref(reviewId, stage)} className={className}>
      {children}
    </Link>
  );
}
