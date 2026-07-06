import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { reviewMembers, reviews, studies } from '@/lib/db/schema/sr';
import { resolveInternalUserId } from '@/lib/sr/authz/require-member';
import type { ReviewRole } from '@/lib/sr/authz/policy';

// ─────────────────────────────────────────────────────────────────────────────
// Review listing for the SR home. Membership-scoped: a caller sees exactly the
// reviews they are an ACTIVE member of (per-review access is membership-based
// and org-independent — see the authz contract). Not a blinded surface: title,
// type, the caller's role, and the imported study count are all safe to show.
// ─────────────────────────────────────────────────────────────────────────────

export interface ReviewListItem {
  id: string;
  title: string;
  reviewType: string;
  role: ReviewRole;
  studyCount: number;
}

export async function listReviewsForUser(
  workosUserId: string,
): Promise<ReviewListItem[]> {
  const db = getDb();

  const userId = await resolveInternalUserId(workosUserId);
  if (!userId) return [];

  const rows = await db
    .select({
      id: reviews.id,
      title: reviews.title,
      reviewType: reviews.reviewType,
      role: reviewMembers.role,
    })
    .from(reviewMembers)
    .innerJoin(reviews, eq(reviewMembers.reviewId, reviews.id))
    .where(
      and(eq(reviewMembers.userId, userId), eq(reviewMembers.status, 'active')),
    )
    .orderBy(desc(reviews.createdAt));

  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const counts = await db
    .select({ reviewId: studies.reviewId, value: count() })
    .from(studies)
    .where(inArray(studies.reviewId, ids))
    .groupBy(studies.reviewId);

  const countByReview = new Map(counts.map((c) => [c.reviewId, c.value]));

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    reviewType: row.reviewType,
    role: row.role,
    studyCount: countByReview.get(row.id) ?? 0,
  }));
}
