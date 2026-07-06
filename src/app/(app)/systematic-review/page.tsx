import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, ClipboardList, Plus } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { getSessionUser } from '@/lib/auth/session';
import { isSrEnabled } from '@/lib/sr/flag';
import { listReviewsForUser } from '@/lib/sr/reviews';
import styles from './sr-home.module.css';

// The Systematic-Review home: the reviews this member can open, or a first-run
// empty state. Flag-gated — 404s (unreachable) when SR is off. "New review"
// routes to the create wizard (a separate task; may 404 until it lands).
export default async function SystematicReviewHomePage() {
  if (!isSrEnabled()) {
    notFound();
  }

  const user = await getSessionUser();
  const reviews = await listReviewsForUser(user.workosUserId);

  if (reviews.length === 0) {
    return (
      <div className={styles.home}>
        <EmptyState
          icon={ClipboardList}
          title="Start your first systematic review"
          body="A PRISMA-compliant pipeline — import, screen, extract, and appraise, with independent blinded work and full audit. Create a review to begin."
          ctaHref="/systematic-review/new"
          ctaLabel="New review"
        />
      </div>
    );
  }

  return (
    <div className={styles.home}>
      <div className={styles.inner}>
        <div className={styles.header}>
          <div>
            <div className={styles.eyebrow}>Systematic review</div>
            <h1 className={styles.title}>Your reviews</h1>
          </div>
          <Link href="/systematic-review/new" className={styles.newButton}>
            <Plus size={15} strokeWidth={2} />
            New review
          </Link>
        </div>

        <ul className={styles.list}>
          {reviews.map((review) => (
            <li key={review.id}>
              <Link
                href={`/systematic-review/${review.id}`}
                className={styles.card}
              >
                <span className={styles.cardMain}>
                  <span className={styles.cardTitle}>{review.title}</span>
                  <span className={styles.cardMeta}>
                    {review.reviewType} · {review.studyCount}{' '}
                    {review.studyCount === 1 ? 'study' : 'studies'} ·{' '}
                    {review.role}
                  </span>
                </span>
                <ArrowRight
                  size={16}
                  strokeWidth={1.75}
                  className={styles.cardArrow}
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
