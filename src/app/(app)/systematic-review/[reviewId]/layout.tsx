import { notFound } from 'next/navigation';
import { count, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { reviews, studies } from '@/lib/db/schema/sr';
import {
  isSrAuthzError,
  requireMember,
  type MemberContext,
} from '@/lib/sr/authz/require-member';
import { getSafeProgress } from '@/lib/sr/authz/blinded-read';
import { isSrEnabled } from '@/lib/sr/flag';
import { SrShell } from '@/components/sr/sr-shell';

// ─────────────────────────────────────────────────────────────────────────────
// The SR review-context layout — the frame every M2 screen renders inside.
//
//   1. Flag gate: the whole route group 404s when SR is off (unreachable).
//   2. Authz (T3): requireMember resolves (session → users.id → active
//      review_members). A non-member and a nonexistent review are
//      indistinguishable — both deny → 404 (no existence leak / IDOR kill).
//   3. Load the review + counts through SAFE paths only: the visible `reviews`
//      and `studies` tables, and getSafeProgress (the chokepoint, T2) for
//      blinding-safe completion counts. NEVER reads the blinded base tables.
//   4. Provide the review context to children and render the stage rail.
// ─────────────────────────────────────────────────────────────────────────────

interface SrReviewLayoutProps {
  children: React.ReactNode;
  params: Promise<{ reviewId: string }>;
}

export default async function SrReviewLayout({
  children,
  params,
}: SrReviewLayoutProps) {
  if (!isSrEnabled()) {
    notFound();
  }

  const { reviewId } = await params;

  let ctx: MemberContext;
  try {
    ctx = await requireMember(reviewId);
  } catch (error) {
    // Deny-by-default: any authz failure (non-member / nonexistent / pending)
    // becomes a 404 with no existence leak. Infra errors still surface.
    if (isSrAuthzError(error)) {
      notFound();
    }
    throw error;
  }

  const db = getDb();

  const [review] = await db
    .select({
      title: reviews.title,
      reviewType: reviews.reviewType,
    })
    .from(reviews)
    .where(eq(reviews.id, reviewId))
    .limit(1);

  // requireMember already proved membership (which FKs the review), so this is
  // defensive — a race that deleted the review resolves to 404, not a crash.
  if (!review) {
    notFound();
  }

  const [studyCountRow] = await db
    .select({ value: count() })
    .from(studies)
    .where(eq(studies.reviewId, reviewId));

  const safeProgress = await getSafeProgress(reviewId);

  return (
    <SrShell
      reviewContext={{
        reviewId,
        title: review.title,
        reviewType: review.reviewType,
        role: ctx.member.role,
        studyCount: studyCountRow?.value ?? 0,
        safeProgress,
      }}
    >
      {children}
    </SrShell>
  );
}
