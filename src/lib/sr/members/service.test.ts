import { beforeEach, describe, expect, it, vi } from 'vitest';
import { users } from '@/lib/db/schema';
import {
  aiValidations,
  auditLog,
  reviewInvitations,
  reviewMembers,
  reviews,
} from '@/lib/db/schema/sr';
import type { MemberContext } from '@/lib/sr/authz/require-member';
import { ArbitratorIndependenceError } from '@/lib/sr/authz/errors';
import { INVITE_RATE_LIMIT } from './invitation-policy';

// ─────────────────────────────────────────────────────────────────────────────
// T7 members/invitation service tests. The DB is faked at the getDb() boundary
// (like require-member.test.ts). We assert the CONTRACT — owner-only gating,
// hashed/single-use/expiring/email-bound tokens, the ATOMIC single-accept gate
// (no double-accept), arbitrator independence, the AI validation gate, and that
// every mutation writes an audit row — not the SQL text.
// ─────────────────────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

interface DbConfig {
  selectLimit: Map<unknown, Row[]>;
  selectAwait: Map<unknown, Row[]>;
  returning: Map<unknown, Row[][]>; // per-table queue: one result[] per .returning()
  captured: { kind: 'values' | 'set'; table: unknown; data: Row }[];
}

let cfg: DbConfig;

function makeDb() {
  let op: 'select' | 'insert' | 'update' | null = null;
  let table: unknown = null;
  const chain: Record<string, unknown> = {
    select: () => chain,
    insert: (t: unknown) => {
      op = 'insert';
      table = t;
      return chain;
    },
    update: (t: unknown) => {
      op = 'update';
      table = t;
      return chain;
    },
    from: (t: unknown) => {
      op = 'select';
      table = t;
      return chain;
    },
    innerJoin: () => chain,
    leftJoin: () => chain,
    values: (data: Row) => {
      cfg.captured.push({ kind: 'values', table, data });
      return chain;
    },
    set: (data: Row) => {
      cfg.captured.push({ kind: 'set', table, data });
      return chain;
    },
    where: () => chain,
    orderBy: () => chain,
    onConflictDoUpdate: () => chain,
    onConflictDoNothing: () => chain,
    limit: () => Promise.resolve(cfg.selectLimit.get(table) ?? []),
    returning: () => {
      const queue = cfg.returning.get(table);
      return Promise.resolve(queue ? (queue.shift() ?? []) : []);
    },
    then: (
      resolve: (v: unknown) => unknown,
      reject?: (e: unknown) => unknown,
    ) => {
      const value = op === 'select' ? (cfg.selectAwait.get(table) ?? []) : [];
      return Promise.resolve(value).then(resolve, reject);
    },
  };
  return chain;
}

vi.mock('@/lib/db/client', () => ({ getDb: () => makeDb() }));
vi.mock('@/lib/sr/authz/arbitrator', () => ({
  assertArbitratorIndependentForReview: vi.fn().mockResolvedValue(undefined),
}));

import { assertArbitratorIndependentForReview } from '@/lib/sr/authz/arbitrator';
import {
  acceptInvitation,
  activateAiReviewer,
  addExistingMember,
  changeMemberRole,
  createEmailInvitation,
  getReviewTeam,
  revokeInvitation,
  revokeMember,
  validateAiReviewer,
} from './service';
import {
  AiValidationRequiredError,
  AlreadyMemberError,
  InvalidEmailError,
  InvitationInvalidError,
  InviteRateLimitError,
  LastOwnerError,
  MemberNotFoundError,
  NoAccountError,
  OwnerActionRequiredError,
} from './errors';

const REVIEW_ID = '11111111-1111-1111-1111-111111111111';
const OWNER_UID = 'owner-uid';
const TARGET_UID = 'target-uid';

function ctx(role: string, userId = OWNER_UID): MemberContext {
  return {
    userId,
    member: {
      id: 'm1',
      reviewId: REVIEW_ID,
      userId,
      role,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    sessionUser: {
      workosUserId: 'wk',
      email: 'a@b.test',
      name: 'A',
      avatarUrl: null,
      isMock: false,
    },
  } as unknown as MemberContext;
}

const owner = ctx('owner');
const reviewer = ctx('reviewer');

function capturedValues(table: unknown): Row[] {
  return cfg.captured
    .filter((c) => c.kind === 'values' && c.table === table)
    .map((c) => c.data);
}
function capturedSets(table: unknown): Row[] {
  return cfg.captured
    .filter((c) => c.kind === 'set' && c.table === table)
    .map((c) => c.data);
}
function auditActions(): string[] {
  return capturedValues(auditLog).map((v) => v.action as string);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(assertArbitratorIndependentForReview).mockResolvedValue(undefined);
  cfg = {
    selectLimit: new Map(),
    selectAwait: new Map(),
    returning: new Map(),
    captured: [],
  };
});

describe('createEmailInvitation — hashed / single-use / expiring / rate-limited', () => {
  beforeEach(() => {
    cfg.selectAwait.set(reviewInvitations, [{ value: 0 }]); // rate count
    cfg.returning.set(reviewInvitations, [[{ id: 'inv-1' }]]); // insert returning
  });

  it('stores only a hashed token (never the plaintext) and surfaces the token once', async () => {
    const result = await createEmailInvitation({
      actor: owner,
      reviewId: REVIEW_ID,
      email: '  Invitee@Lab.TEST ',
      role: 'reviewer',
    });

    expect(result.token).toBeTruthy();
    expect(result.email).toBe('invitee@lab.test'); // normalized

    const inserted = capturedValues(reviewInvitations)[0];
    expect(inserted.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(inserted).not.toHaveProperty('token'); // plaintext never persisted
    expect(inserted.status).toBe('pending');
    expect(inserted.email).toBe('invitee@lab.test');
    expect(inserted.role).toBe('reviewer');
    expect(inserted.expiresAt).toBeInstanceOf(Date);
    expect((inserted.expiresAt as Date).getTime()).toBeGreaterThan(Date.now());
  });

  it('supersedes prior pending invites for the same email', async () => {
    await createEmailInvitation({
      actor: owner,
      reviewId: REVIEW_ID,
      email: 'invitee@lab.test',
      role: 'reviewer',
    });
    // The supersede UPDATE sets status = revoked before the new insert.
    expect(
      capturedSets(reviewInvitations).some((s) => s.status === 'revoked'),
    ).toBe(true);
  });

  it('audits the invite creation', async () => {
    await createEmailInvitation({
      actor: owner,
      reviewId: REVIEW_ID,
      email: 'invitee@lab.test',
      role: 'reviewer',
    });
    expect(auditActions()).toContain('invitation.create');
  });

  it('refuses a non-owner (owner-only)', async () => {
    await expect(
      createEmailInvitation({
        actor: reviewer,
        reviewId: REVIEW_ID,
        email: 'invitee@lab.test',
        role: 'reviewer',
      }),
    ).rejects.toBeInstanceOf(OwnerActionRequiredError);
  });

  it('rejects a malformed email before minting anything', async () => {
    await expect(
      createEmailInvitation({
        actor: owner,
        reviewId: REVIEW_ID,
        email: 'not-an-email',
        role: 'reviewer',
      }),
    ).rejects.toBeInstanceOf(InvalidEmailError);
    expect(capturedValues(reviewInvitations)).toHaveLength(0);
  });

  it('is rate-limited', async () => {
    cfg.selectAwait.set(reviewInvitations, [{ value: INVITE_RATE_LIMIT }]);
    await expect(
      createEmailInvitation({
        actor: owner,
        reviewId: REVIEW_ID,
        email: 'invitee@lab.test',
        role: 'reviewer',
      }),
    ).rejects.toBeInstanceOf(InviteRateLimitError);
    expect(capturedValues(reviewInvitations)).toHaveLength(0); // nothing minted
  });
});

describe('acceptInvitation — transactional single-accept gate', () => {
  const future = new Date(Date.now() + 60_000);
  const past = new Date(Date.now() - 60_000);
  const invitee = {
    workosUserId: 'wk-invitee',
    email: 'invitee@lab.test',
    name: 'Invitee',
    avatarUrl: null,
    isMock: false as const,
  };

  function seedPendingInvite(over: Partial<Row> = {}) {
    cfg.selectLimit.set(reviewInvitations, [
      {
        id: 'inv-1',
        reviewId: REVIEW_ID,
        email: 'invitee@lab.test',
        role: 'reviewer',
        status: 'pending',
        expiresAt: future,
        ...over,
      },
    ]);
    cfg.selectLimit.set(users, [{ id: TARGET_UID }]);
  }

  it('accepts a valid invite, activates membership, and audits', async () => {
    seedPendingInvite();
    cfg.returning.set(reviewInvitations, [[{ id: 'inv-1' }]]); // CAS wins

    const result = await acceptInvitation({
      token: 'tok',
      acceptingUser: invitee,
    });

    expect(result).toEqual({ reviewId: REVIEW_ID, role: 'reviewer' });
    // CAS flips status to accepted
    expect(
      capturedSets(reviewInvitations).some((s) => s.status === 'accepted'),
    ).toBe(true);
    // membership upserted active
    const member = capturedValues(reviewMembers)[0];
    expect(member.status).toBe('active');
    expect(member.role).toBe('reviewer');
    expect(auditActions()).toContain('invitation.accept');
  });

  it('refuses a concurrent SECOND accept — no double-accept', async () => {
    seedPendingInvite();
    // Both requests read the row as pending (pre-commit); the CAS returns the row
    // to the first caller and NOTHING to the second.
    cfg.returning.set(reviewInvitations, [[{ id: 'inv-1' }], []]);

    const first = await acceptInvitation({
      token: 'tok',
      acceptingUser: invitee,
    });
    expect(first.role).toBe('reviewer');

    const second = await acceptInvitation({
      token: 'tok',
      acceptingUser: invitee,
    }).catch((e) => e);
    expect(second).toBeInstanceOf(InvitationInvalidError);
    expect(second.reason).toBe('not_pending');
    expect(second.status).toBe(410);
  });

  it('rejects an expired invite (never reaches the CAS)', async () => {
    seedPendingInvite({ expiresAt: past });
    const err = await acceptInvitation({
      token: 'tok',
      acceptingUser: invitee,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(InvitationInvalidError);
    expect(err.reason).toBe('expired');
  });

  it('rejects an email-mismatched accepter (email-bound)', async () => {
    seedPendingInvite();
    const err = await acceptInvitation({
      token: 'tok',
      acceptingUser: { ...invitee, email: 'someone-else@lab.test' },
    }).catch((e) => e);
    expect(err).toBeInstanceOf(InvitationInvalidError);
    expect(err.reason).toBe('email_mismatch');
  });

  it('rejects an unknown token generically (no enumeration)', async () => {
    cfg.selectLimit.set(reviewInvitations, []); // hash not found
    const err = await acceptInvitation({
      token: 'bogus',
      acceptingUser: invitee,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(InvitationInvalidError);
    expect(err.reason).toBe('not_found');
    expect(err.status).toBe(404);
  });

  it('rejects when the accepting account is not provisioned', async () => {
    cfg.selectLimit.set(reviewInvitations, [
      {
        id: 'inv-1',
        reviewId: REVIEW_ID,
        email: 'invitee@lab.test',
        role: 'reviewer',
        status: 'pending',
        expiresAt: future,
      },
    ]);
    cfg.selectLimit.set(users, []); // unprovisioned
    const err = await acceptInvitation({
      token: 'tok',
      acceptingUser: invitee,
    }).catch((e) => e);
    expect(err.reason).toBe('account_unprovisioned');
  });
});

describe('changeMemberRole — owner-only, arbitrator-independent, last-owner-safe', () => {
  it('refuses a non-owner', async () => {
    await expect(
      changeMemberRole({
        actor: reviewer,
        reviewId: REVIEW_ID,
        targetUserId: TARGET_UID,
        role: 'viewer',
      }),
    ).rejects.toBeInstanceOf(OwnerActionRequiredError);
  });

  it('refuses to demote the last owner', async () => {
    cfg.selectLimit.set(reviewMembers, [{ role: 'owner', status: 'active' }]);
    cfg.selectAwait.set(reviewMembers, [{ value: 1 }]); // one active owner
    await expect(
      changeMemberRole({
        actor: owner,
        reviewId: REVIEW_ID,
        targetUserId: TARGET_UID,
        role: 'viewer',
      }),
    ).rejects.toBeInstanceOf(LastOwnerError);
  });

  it('refuses arbitrator assignment when the user reviewed a study (422)', async () => {
    cfg.selectLimit.set(reviewMembers, [
      { role: 'reviewer', status: 'active' },
    ]);
    vi.mocked(assertArbitratorIndependentForReview).mockRejectedValue(
      new ArbitratorIndependenceError(),
    );
    const err = await changeMemberRole({
      actor: owner,
      reviewId: REVIEW_ID,
      targetUserId: TARGET_UID,
      role: 'arbitrator',
    }).catch((e) => e);
    expect(err).toBeInstanceOf(ArbitratorIndependenceError);
    expect(err.status).toBe(422);
  });

  it('assigns arbitrator when the user is independent, and audits', async () => {
    cfg.selectLimit.set(reviewMembers, [
      { role: 'reviewer', status: 'active' },
    ]);
    await changeMemberRole({
      actor: owner,
      reviewId: REVIEW_ID,
      targetUserId: TARGET_UID,
      role: 'arbitrator',
    });
    expect(assertArbitratorIndependentForReview).toHaveBeenCalledWith({
      reviewId: REVIEW_ID,
      userId: TARGET_UID,
    });
    expect(
      capturedSets(reviewMembers).some((s) => s.role === 'arbitrator'),
    ).toBe(true);
    expect(auditActions()).toContain('member.role_change');
  });

  it('404s for a member not on the review', async () => {
    cfg.selectLimit.set(reviewMembers, []);
    await expect(
      changeMemberRole({
        actor: owner,
        reviewId: REVIEW_ID,
        targetUserId: TARGET_UID,
        role: 'viewer',
      }),
    ).rejects.toBeInstanceOf(MemberNotFoundError);
  });
});

describe('revokeMember', () => {
  it('refuses a non-owner', async () => {
    await expect(
      revokeMember({
        actor: reviewer,
        reviewId: REVIEW_ID,
        targetUserId: TARGET_UID,
      }),
    ).rejects.toBeInstanceOf(OwnerActionRequiredError);
  });

  it('refuses to revoke the last owner', async () => {
    cfg.selectLimit.set(reviewMembers, [{ role: 'owner' }]);
    cfg.selectAwait.set(reviewMembers, [{ value: 1 }]);
    await expect(
      revokeMember({
        actor: owner,
        reviewId: REVIEW_ID,
        targetUserId: OWNER_UID,
      }),
    ).rejects.toBeInstanceOf(LastOwnerError);
  });

  it('inactivates a member and audits', async () => {
    cfg.selectLimit.set(reviewMembers, [{ role: 'reviewer' }]);
    await revokeMember({
      actor: owner,
      reviewId: REVIEW_ID,
      targetUserId: TARGET_UID,
    });
    expect(
      capturedSets(reviewMembers).some((s) => s.status === 'inactive'),
    ).toBe(true);
    expect(auditActions()).toContain('member.revoke');
  });
});

describe('addExistingMember — no token needed for a known account', () => {
  it('refuses a non-owner', async () => {
    await expect(
      addExistingMember({
        actor: reviewer,
        reviewId: REVIEW_ID,
        email: 'known@lab.test',
        role: 'collaborator',
      }),
    ).rejects.toBeInstanceOf(OwnerActionRequiredError);
  });

  it('errors when no account exists for the email', async () => {
    cfg.selectLimit.set(users, []);
    await expect(
      addExistingMember({
        actor: owner,
        reviewId: REVIEW_ID,
        email: 'stranger@lab.test',
        role: 'collaborator',
      }),
    ).rejects.toBeInstanceOf(NoAccountError);
  });

  it('errors when the user is already an active member', async () => {
    cfg.selectLimit.set(users, [{ id: TARGET_UID }]);
    cfg.selectLimit.set(reviewMembers, [{ status: 'active' }]);
    await expect(
      addExistingMember({
        actor: owner,
        reviewId: REVIEW_ID,
        email: 'known@lab.test',
        role: 'collaborator',
      }),
    ).rejects.toBeInstanceOf(AlreadyMemberError);
  });

  it('adds a known account as an active member and audits', async () => {
    cfg.selectLimit.set(users, [{ id: TARGET_UID }]);
    cfg.selectLimit.set(reviewMembers, []);
    const result = await addExistingMember({
      actor: owner,
      reviewId: REVIEW_ID,
      email: 'known@lab.test',
      role: 'collaborator',
    });
    expect(result).toEqual({ userId: TARGET_UID, role: 'collaborator' });
    expect(capturedValues(reviewMembers)[0].status).toBe('active');
    expect(auditActions()).toContain('member.add');
  });

  it('checks arbitrator independence when adding as arbitrator', async () => {
    cfg.selectLimit.set(users, [{ id: TARGET_UID }]);
    cfg.selectLimit.set(reviewMembers, []);
    await addExistingMember({
      actor: owner,
      reviewId: REVIEW_ID,
      email: 'known@lab.test',
      role: 'arbitrator',
    });
    expect(assertArbitratorIndependentForReview).toHaveBeenCalled();
  });
});

describe('revokeInvitation', () => {
  it('refuses a non-owner', async () => {
    await expect(
      revokeInvitation({
        actor: reviewer,
        reviewId: REVIEW_ID,
        invitationId: 'inv-1',
      }),
    ).rejects.toBeInstanceOf(OwnerActionRequiredError);
  });

  it('revokes a pending invitation and audits', async () => {
    cfg.returning.set(reviewInvitations, [[{ id: 'inv-1' }]]);
    await revokeInvitation({
      actor: owner,
      reviewId: REVIEW_ID,
      invitationId: 'inv-1',
    });
    expect(auditActions()).toContain('invitation.revoke');
  });

  it('404s when the invitation is not pending', async () => {
    cfg.returning.set(reviewInvitations, [[]]);
    await expect(
      revokeInvitation({
        actor: owner,
        reviewId: REVIEW_ID,
        invitationId: 'inv-1',
      }),
    ).rejects.toBeInstanceOf(InvitationInvalidError);
  });
});

describe('AI reviewer gate', () => {
  it('refuses to activate the AI without a passing validation', async () => {
    cfg.selectLimit.set(aiValidations, []);
    await expect(
      activateAiReviewer({ actor: owner, reviewId: REVIEW_ID }),
    ).rejects.toBeInstanceOf(AiValidationRequiredError);
  });

  it('activates the AI when a passing validation exists', async () => {
    cfg.selectLimit.set(aiValidations, [{ id: 'val-1' }]);
    const result = await activateAiReviewer({
      actor: owner,
      reviewId: REVIEW_ID,
    });
    expect(result.status).toBe('validated');
    expect(auditActions()).toContain('ai.activate');
  });

  it('refuses a non-owner activating the AI', async () => {
    await expect(
      activateAiReviewer({ actor: reviewer, reviewId: REVIEW_ID }),
    ).rejects.toBeInstanceOf(OwnerActionRequiredError);
  });

  it('validate is a wired stub that records the request', async () => {
    const result = await validateAiReviewer({
      actor: owner,
      reviewId: REVIEW_ID,
    });
    expect(result.pending).toBe(true);
    expect(auditActions()).toContain('ai.validate.requested');
  });

  it('refuses a non-owner requesting validation', async () => {
    await expect(
      validateAiReviewer({ actor: reviewer, reviewId: REVIEW_ID }),
    ).rejects.toBeInstanceOf(OwnerActionRequiredError);
  });
});

describe('getReviewTeam', () => {
  it('returns active + pending members (never inactive), pending invitations, and the AI row', async () => {
    cfg.selectAwait.set(reviewMembers, [
      {
        userId: OWNER_UID,
        role: 'owner',
        status: 'active',
        createdAt: new Date(),
        name: 'Dr. Owner',
        email: 'owner@lab.test',
      },
      {
        userId: TARGET_UID,
        role: 'reviewer',
        status: 'pending',
        createdAt: new Date(),
        name: 'Dr. Rev',
        email: 'rev@lab.test',
      },
      {
        userId: 'gone',
        role: 'reviewer',
        status: 'inactive',
        createdAt: new Date(),
        name: 'Gone',
        email: 'gone@lab.test',
      },
    ]);
    cfg.selectAwait.set(reviewInvitations, [
      {
        id: 'inv-1',
        email: 'p@lab.test',
        role: 'collaborator',
        expiresAt: new Date(),
        createdAt: new Date(),
        status: 'pending',
        invitedByName: 'Dr. Owner',
      },
      {
        id: 'inv-2',
        email: 'used@lab.test',
        role: 'viewer',
        expiresAt: new Date(),
        createdAt: new Date(),
        status: 'accepted',
        invitedByName: 'Dr. Owner',
      },
    ]);
    cfg.selectLimit.set(reviews, [{ reviewMode: 'ai_co_reviewer' }]);
    cfg.selectLimit.set(aiValidations, []);

    const team = await getReviewTeam(REVIEW_ID, OWNER_UID);

    expect(team.members.map((m) => m.userId)).toEqual([OWNER_UID, TARGET_UID]);
    expect(team.members.find((m) => m.userId === OWNER_UID)?.isSelf).toBe(true);
    expect(team.invitations.map((i) => i.id)).toEqual(['inv-1']); // pending only
    expect(team.ai.reviewMode).toBe('ai_co_reviewer');
    expect(team.ai.status).toBe('unvalidated');
  });
});
