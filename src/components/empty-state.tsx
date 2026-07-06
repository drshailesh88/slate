import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import styles from './empty-state.module.css';

// Empty-State-Is-Onboarding law (CRAFT-ADDENDUM §A): never blank — one CTA
// row that teaches the next move.
export function EmptyState({
  icon: Icon,
  title,
  body,
  ctaHref,
  ctaLabel,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  ctaHref: string;
  ctaLabel: string;
}) {
  return (
    <div className={styles.emptyState}>
      <span className={styles.iconCircle}>
        <Icon size={18} strokeWidth={1.75} />
      </span>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.body}>{body}</p>
      <Link href={ctaHref} className={styles.cta}>
        {ctaLabel}
      </Link>
    </div>
  );
}
