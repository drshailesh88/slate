'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Star } from 'lucide-react';
import {
  activeStageFromPath,
  buildStageRail,
  type StageRailItem,
} from '@/lib/sr/stage-rail';
import styles from './sr-stage-rail.module.css';

// The funnel spine: a "Review" group (Summary · Team · Protocol) plus the nine
// funnel stages. Built stages link; not-yet-built stages render disabled with a
// "Soon" marker. Frozen skin — tokens only, hairlines, Lucide, no shadows.

interface SrStageRailProps {
  reviewId: string;
  title: string;
  meta: string;
  studyCount: number;
}

function StageBadge({ item }: { item: StageRailItem }) {
  return (
    <span className={styles.num} aria-hidden>
      {item.n ?? <Star size={11} strokeWidth={2.5} />}
    </span>
  );
}

function StageRowBody({ item }: { item: StageRailItem }) {
  return (
    <>
      <StageBadge item={item} />
      <span className={styles.name}>{item.label}</span>
      {item.comingSoon ? (
        <span className={styles.soon}>Soon</span>
      ) : item.count ? (
        <span className={styles.count}>{item.count}</span>
      ) : null}
    </>
  );
}

function StageRow({ item }: { item: StageRailItem }) {
  const className = [
    styles.stage,
    item.active ? styles.stageActive : '',
    item.comingSoon ? styles.stageLocked : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (!item.href) {
    return (
      <span className={className} aria-disabled="true" title="Coming soon">
        <StageRowBody item={item} />
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      className={className}
      aria-current={item.active ? 'page' : undefined}
    >
      <StageRowBody item={item} />
    </Link>
  );
}

export function SrStageRail({
  reviewId,
  title,
  meta,
  studyCount,
}: SrStageRailProps) {
  const pathname = usePathname() ?? '';
  const groups = buildStageRail({
    reviewId,
    activeStage: activeStageFromPath(pathname, reviewId),
    studyCount,
  });

  return (
    <aside className={styles.rail} aria-label="Review stages">
      <div className={styles.head}>
        <div className={styles.projectTitle}>{title}</div>
        <div className={styles.projectMeta}>{meta}</div>
      </div>

      {groups.map((group) => (
        <div key={group.id} className={styles.group}>
          <div className="section-label">{group.label}</div>
          <nav
            className={group.id === 'funnel' ? styles.spine : undefined}
            aria-label={group.label}
          >
            {group.items.map((item) => (
              <StageRow key={item.id} item={item} />
            ))}
          </nav>
        </div>
      ))}
    </aside>
  );
}
