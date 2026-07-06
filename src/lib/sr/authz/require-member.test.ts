import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reviewMembers, reviews, studies } from '@/lib/db/schema/sr';
import { users } from '@/lib/db/schema';

// ─────────────────────────────────────────────────────────────────────────────
// T3 authorization spine tests. Written to run under T5's Vitest harness.
//
// The DB is faked at the getDb() boundary: the select chain resolves per-table
// (identity-mapped), and execute() returns preset rows for the arbitrator
// participation probe. We assert the CONTRACT — deny → 404, studyId always
// review-scoped, arbitrator independence — not the SQL text.
// ─────────────────────────────────────────────────────────────────────────────

type Rows = Record<string, unknown>[];

let rowsByTable: Map<unknown, Rows>;
let executeRows: Rows;

function fakeDb() {
  let current: unknown = null;
  const chain = {
    select: () => chain,
    from: (table: unknown) => {
      current = table;
      return chain;
    },
    where: () => chain,
    limit: () => Promise.resolve(rowsByTable.get(current) ?? []),
    execute: () => Promise.resolve({ rows: executeRows }),
  };
  return chain;
}

vi.mock('@/lib/db/client', () => ({
  getDb: () => fakeDb(),
}));

vi.mock('@/lib/auth/session', () => ({
  getSessionUser: vi.fn(),
}));

vi.mock('@/lib/auth/config', () => ({
  isDevAuthBypassActive: vi.fn(() => false),
}));

vi.mock('@workos-inc/authkit-nextjs', () => ({
  withAuth: vi.fn(),
}));

import { getSessionUser } from '@/lib/auth/session';
import { isDevAuthBypassActive } from '@/lib/auth/config';
import { withAuth } from '@workos-inc/authkit-nextjs';
import {
  ArbitratorIndependenceError,
  OrgScopeError,
  ReviewAccessError,
  assertArbitratorIndependent,
  requireMember,
  requireOrgScope,
  requireStudyInReview,
  resolveMembership,
} from './require-member';

const REVIEW_ID = '11111111-1111-1111-1111-111111111111';
const STUDY_ID = '22222222-2222-2222-2222-222222222222';
const USER_UUID = '33333333-3333-3333-3333-333333333333';
const ORG_ID = 'org_owning';

const sessionUser = {
  workosUserId: 'user_workos_1',
  email: 'reviewer@lab.test',
  name: 'Reviewer One',
  avatarUrl: null,
  isMock: false,
};

const activeMember = {
  id: 'm1',
  reviewId: REVIEW_ID,
  userId: USER_UUID,
  role: 'reviewer',
  status: 'active',
};

beforeEach(() => {
  rowsByTable = new Map();
  executeRows = [];
  vi.mocked(getSessionUser).mockResolvedValue(sessionUser);
  vi.mocked(isDevAuthBypassActive).mockReturnValue(false);
});

describe('resolveMembership', () => {
  it('returns the active member row when one exists', async () => {
    rowsByTable.set(reviewMembers, [activeMember]);

    const member = await resolveMembership({
      reviewId: REVIEW_ID,
      userId: USER_UUID,
    });

    expect(member).toEqual(activeMember);
  });

  it('returns null when there is no active membership', async () => {
    rowsByTable.set(reviewMembers, []);

    const member = await resolveMembership({
      reviewId: REVIEW_ID,
      userId: USER_UUID,
    });

    expect(member).toBeNull();
  });
});

describe('requireMember — deny → 404', () => {
  it('denies with 404 when the caller is not a member (IDOR / foreign reviewId)', async () => {
    rowsByTable.set(users, [{ id: USER_UUID }]);
    rowsByTable.set(reviewMembers, []); // no active membership on this review

    const nonMember = await requireMember(REVIEW_ID).catch((e) => e);

    expect(nonMember).toBeInstanceOf(ReviewAccessError);
    expect(nonMember.status).toBe(404);
  });

  it('denies with 404 identically when the user row is not provisioned', async () => {
    rowsByTable.set(users, []); // unprovisioned → no internal id
    rowsByTable.set(reviewMembers, [activeMember]); // would match, but never reached

    const unprovisioned = await requireMember(REVIEW_ID).catch((e) => e);

    expect(unprovisioned).toBeInstanceOf(ReviewAccessError);
    expect(unprovisioned.status).toBe(404);
  });

  it('non-member and nonexistent-review are indistinguishable', async () => {
    // Non-member: user provisioned, no membership.
    rowsByTable.set(users, [{ id: USER_UUID }]);
    rowsByTable.set(reviewMembers, []);
    const nonMember = await requireMember(REVIEW_ID).catch((e) => e);

    // Nonexistent review: same observable outcome (membership query is empty).
    const nonexistent = await requireMember(
      '99999999-9999-9999-9999-999999999999',
    ).catch((e) => e);

    expect(nonMember).toBeInstanceOf(ReviewAccessError);
    expect(nonexistent).toBeInstanceOf(ReviewAccessError);
    expect(nonMember.status).toBe(nonexistent.status);
    expect(nonMember.message).toBe(nonexistent.message);
  });

  it('resolves to the live member context for an active member', async () => {
    rowsByTable.set(users, [{ id: USER_UUID }]);
    rowsByTable.set(reviewMembers, [activeMember]);

    const ctx = await requireMember(REVIEW_ID);

    expect(ctx.userId).toBe(USER_UUID);
    expect(ctx.member.role).toBe('reviewer');
    expect(ctx.sessionUser.workosUserId).toBe('user_workos_1');
  });
});

describe('requireStudyInReview — studyId always review-scoped', () => {
  it('denies with 404 for a study in another review (IDOR)', async () => {
    rowsByTable.set(studies, []); // join studies.reviewId = reviewId misses

    const foreign = await requireStudyInReview({
      reviewId: REVIEW_ID,
      studyId: STUDY_ID,
    }).catch((e) => e);

    expect(foreign).toBeInstanceOf(ReviewAccessError);
    expect(foreign.status).toBe(404);
  });

  it('returns the study when it belongs to the review', async () => {
    const study = { id: STUDY_ID, reviewId: REVIEW_ID, title: 'A trial' };
    rowsByTable.set(studies, [study]);

    const resolved = await requireStudyInReview({
      reviewId: REVIEW_ID,
      studyId: STUDY_ID,
    });

    expect(resolved).toEqual(study);
  });
});

describe('assertArbitratorIndependent — server-enforced', () => {
  it('refuses (422) when the user screened/extracted/appraised the study', async () => {
    executeRows = [{ found: 1 }]; // participation probe hits

    const refused = await assertArbitratorIndependent({
      reviewId: REVIEW_ID,
      studyId: STUDY_ID,
      userId: USER_UUID,
    }).catch((e) => e);

    expect(refused).toBeInstanceOf(ArbitratorIndependenceError);
    expect(refused.status).toBe(422);
  });

  it('allows when the user has no participation on the study', async () => {
    executeRows = []; // no rows across all three blinded tables

    await expect(
      assertArbitratorIndependent({
        reviewId: REVIEW_ID,
        studyId: STUDY_ID,
        userId: USER_UUID,
      }),
    ).resolves.toBeUndefined();
  });
});

describe('requireOrgScope — org-admin actions', () => {
  it('denies with 403 when the active org does not own the review', async () => {
    rowsByTable.set(reviews, [{ orgId: ORG_ID }]);
    vi.mocked(withAuth).mockResolvedValue({
      organizationId: 'org_other',
      role: 'admin',
    } as never);

    const mismatch = await requireOrgScope(REVIEW_ID).catch((e) => e);

    expect(mismatch).toBeInstanceOf(OrgScopeError);
    expect(mismatch.status).toBe(403);
  });

  it('denies with 404 when the review does not exist (no existence leak)', async () => {
    rowsByTable.set(reviews, []);
    vi.mocked(withAuth).mockResolvedValue({
      organizationId: ORG_ID,
      role: 'admin',
    } as never);

    const missing = await requireOrgScope(REVIEW_ID).catch((e) => e);

    expect(missing).toBeInstanceOf(ReviewAccessError);
    expect(missing.status).toBe(404);
  });

  it('passes when the active org owns the review', async () => {
    rowsByTable.set(reviews, [{ orgId: ORG_ID }]);
    vi.mocked(withAuth).mockResolvedValue({
      organizationId: ORG_ID,
      role: 'admin',
    } as never);

    await expect(requireOrgScope(REVIEW_ID)).resolves.toBeUndefined();
  });

  it('skips the org check under dev bypass (no WorkOS org context)', async () => {
    vi.mocked(isDevAuthBypassActive).mockReturnValue(true);

    await expect(requireOrgScope(REVIEW_ID)).resolves.toBeUndefined();
    expect(withAuth).not.toHaveBeenCalled();
  });
});
