import { and, eq } from 'drizzle-orm';
import { withAuth } from '@workos-inc/authkit-nextjs';
import { getDb } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import {
  reviewMembers,
  reviews,
  studies,
  type ReviewMember,
  type Study,
} from '@/lib/db/schema/sr';
import { getSessionUser, type SessionUser } from '@/lib/auth/session';
import { isDevAuthBypassActive } from '@/lib/auth/config';
import { OrgScopeError, ReviewAccessError } from './errors';

// ─────────────────────────────────────────────────────────────────────────────
// Server-side authorization spine for the Systematic-Review module.
//
// The one rule: per-review roles are NEVER trusted from the JWT. Every access
// decision is a LIVE `review_members` lookup (FOUNDATION-auth-tenancy.md §4/§5,
// report.md §2.4). Deny-by-default: a non-member and a nonexistent review are
// indistinguishable — both raise ReviewAccessError (404).
//
// The WorkOS `role` claim (coarse org-admin) is used ONLY for org-scope checks,
// never for per-review authorization.
// ─────────────────────────────────────────────────────────────────────────────

export type MemberContext = {
  // Internal users.id (uuid) — the FK target of review_members.userId.
  userId: string;
  member: ReviewMember;
  sessionUser: SessionUser;
};

export type ActiveOrgContext = {
  organizationId: string | null;
  // Coarse WorkOS org role (admin | member). Never used for per-review authz.
  role: string | null;
};

// Map a WorkOS user id to Slate's internal users.id (uuid). Returns null when
// the user row has not been provisioned yet — the caller then denies (404),
// never provisions here (JIT/webhook provisioning is T4's concern).
export async function resolveInternalUserId(
  workosUserId: string,
): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.workosUserId, workosUserId))
    .limit(1);

  return row?.id ?? null;
}

// The membership resolver: (userId, reviewId) → the ACTIVE review_members row,
// or null. `pending` / `inactive` members are not active members and resolve to
// null (deny). This is the single source of per-review authorization truth.
export async function resolveMembership({
  reviewId,
  userId,
}: {
  reviewId: string;
  userId: string;
}): Promise<ReviewMember | null> {
  const db = getDb();
  const [member] = await db
    .select()
    .from(reviewMembers)
    .where(
      and(
        eq(reviewMembers.reviewId, reviewId),
        eq(reviewMembers.userId, userId),
        eq(reviewMembers.status, 'active'),
      ),
    )
    .limit(1);

  return member ?? null;
}

// Handler entrypoint. Resolves the caller's session → internal id → active
// membership. Throws ReviewAccessError (404) on ANY miss — unauthenticated
// resolution, unprovisioned user, or no active membership all look identical to
// a nonexistent review. Callers gate on the returned role; they must NOT read a
// role from the JWT.
export async function requireMember(reviewId: string): Promise<MemberContext> {
  const sessionUser = await getSessionUser();
  const userId = await resolveInternalUserId(sessionUser.workosUserId);
  if (!userId) {
    throw new ReviewAccessError();
  }

  const member = await resolveMembership({ reviewId, userId });
  if (!member) {
    throw new ReviewAccessError();
  }

  return { userId, member, sessionUser };
}

// Every studyId is ALWAYS joined through studies.reviewId = reviewId — never
// fetched by studyId alone (IDOR kill). A study in another review is
// indistinguishable from a nonexistent one: both raise ReviewAccessError (404).
// Resolve membership on `reviewId` first; this only proves the study belongs to
// the review the caller is already authorized for.
export async function requireStudyInReview({
  reviewId,
  studyId,
}: {
  reviewId: string;
  studyId: string;
}): Promise<Study> {
  const db = getDb();
  const [study] = await db
    .select()
    .from(studies)
    .where(and(eq(studies.id, studyId), eq(studies.reviewId, reviewId)))
    .limit(1);

  if (!study) {
    throw new ReviewAccessError();
  }

  return study;
}

// The active WorkOS organization + coarse org role for the current session.
// In dev bypass (no WorkOS creds) there is no organization context.
export async function getActiveOrgContext(): Promise<ActiveOrgContext> {
  if (isDevAuthBypassActive()) {
    return { organizationId: null, role: null };
  }

  const { organizationId, role } = await withAuth({ ensureSignedIn: true });
  return { organizationId: organizationId ?? null, role: role ?? null };
}

// Org-admin actions require the caller's ACTIVE WorkOS org to own the review
// (reviews.orgId). Membership actions are org-independent and must NOT call
// this. A missing review raises ReviewAccessError (404, no existence leak); a
// live org mismatch raises OrgScopeError (403). Dev bypass has no org context,
// so the check is skipped (mirrors getSessionUser's dev posture).
export async function requireOrgScope(reviewId: string): Promise<void> {
  if (isDevAuthBypassActive()) {
    return;
  }

  const db = getDb();
  const [review] = await db
    .select({ orgId: reviews.orgId })
    .from(reviews)
    .where(eq(reviews.id, reviewId))
    .limit(1);

  if (!review) {
    throw new ReviewAccessError();
  }

  const { organizationId } = await getActiveOrgContext();
  if (!organizationId || organizationId !== review.orgId) {
    throw new OrgScopeError();
  }
}

export {
  ReviewAccessError,
  OrgScopeError,
  ArbitratorIndependenceError,
  SrAuthzError,
  isSrAuthzError,
  type SrAuthzErrorCode,
} from './errors';
export {
  assertArbitratorIndependent,
  assertArbitratorIndependentForReview,
  hasReviewParticipation,
  hasStudyParticipation,
} from './arbitrator';
