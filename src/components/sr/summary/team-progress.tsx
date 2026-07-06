'use client';

import type { SurfaceProgressView } from '@/lib/sr/summary/funnel';
import styles from './review-summary.module.css';

// Safe team-progress readout. It shows COMPLETION COUNTS ONLY — "N of M reviewers
// finished" per surface — sourced from the chokepoint's getSafeProgress. It
// deliberately does NOT render the precursor's decision distribution
// (done/conflicts/one-vote/no-votes) or per-reviewer contribution rows: during
// the independent phase those would leak a co-reviewer's decisions and silently
// invalidate the review. The only data it is ever handed is integer tallies.
// See sr-build-plan-p4/report.md §2.2 + FOUNDATION-auth-tenancy.md §6.

interface TeamProgressProps {
  surfaces: SurfaceProgressView[];
}

export function TeamProgress({ surfaces }: TeamProgressProps) {
  return (
    <div className={styles.progress}>
      <div className={styles.plabel}>Team progress · completion only</div>
      {surfaces.map((surface) => (
        <div className={styles.surfaceRow} key={surface.id}>
          <span className={styles.surfaceName}>{surface.label}</span>
          <span
            className={styles.pbar}
            role="progressbar"
            aria-label={`${surface.label} completion`}
            aria-valuemin={0}
            aria-valuemax={surface.totalReviewers}
            aria-valuenow={surface.finishedReviewers}
          >
            <i style={{ width: `${Math.round(surface.fraction * 100)}%` }} />
          </span>
          <span className={styles.surfaceCount}>{surface.caption}</span>
        </div>
      ))}
    </div>
  );
}
