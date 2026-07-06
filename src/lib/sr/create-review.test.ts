import { describe, expect, it } from 'vitest';
import {
  auditLog,
  reviewInvitations,
  reviewMembers,
  reviews,
} from '@/lib/db/schema/sr';
import { INVITE_ENTROPY_BITS, INVITE_TTL_MS } from './invitations';
import {
  CreateReviewError,
  createReview,
  validateCreateReviewInput,
  type CreateReviewInput,
} from './create-review';

// ─────────────────────────────────────────────────────────────────────────────
// Create-review core. The DB is faked at the getDb() boundary: every
// insert(table).values(v) is recorded so we assert the CONTRACT — a review, its
// owner membership, an audit entry, and (optionally) pending invitations — plus
// the science invariant that Blind Mode cannot be disabled at creation.
// ─────────────────────────────────────────────────────────────────────────────

const NEW_REVIEW_ID = '44444444-4444-4444-4444-444444444444';
const ACTOR_ID = '55555555-5555-5555-5555-555555555555';
const ORG_ID = 'org_owning';
const NOW = new Date('2026-07-06T12:00:00.000Z');

interface Recorded {
  table: unknown;
  values: Record<string, unknown> | Record<string, unknown>[];
}

function makeFakeDb() {
  const inserts: Recorded[] = [];
  const db = {
    insert(table: unknown) {
      const rec: Recorded = { table, values: {} };
      inserts.push(rec);
      const result = {
        values(v: Recorded['values']) {
          rec.values = v;
          return result;
        },
        returning: () => Promise.resolve([{ id: NEW_REVIEW_ID }]),
        onConflictDoNothing: () => result,
        onConflictDoUpdate: () => result,
        then: (resolve: (v: unknown) => void) => resolve(undefined),
      };
      return result;
    },
  };
  const forTable = (table: unknown) =>
    inserts.filter((r) => r.table === table).map((r) => r.values);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { db: db as any, forTable };
}

const baseInput: CreateReviewInput = {
  title: '  SGLT2 inhibitors for HFpEF  ',
  reviewType: 'Intervention review',
  reviewMode: 'two_reviewer',
};

describe('createReview persistence', () => {
  it('persists a review + the creator as active owner + an audit entry', async () => {
    const { db, forTable } = makeFakeDb();

    const result = await createReview(baseInput, {
      db,
      actorUserId: ACTOR_ID,
      orgId: ORG_ID,
      now: NOW,
    });

    expect(result.reviewId).toBe(NEW_REVIEW_ID);

    const [review] = forTable(reviews) as Record<string, unknown>[];
    expect(review).toMatchObject({
      orgId: ORG_ID,
      title: 'SGLT2 inhibitors for HFpEF', // trimmed
      reviewType: 'Intervention review',
      reviewMode: 'two_reviewer',
      createdBy: ACTOR_ID,
    });

    const [member] = forTable(reviewMembers) as Record<string, unknown>[];
    expect(member).toMatchObject({
      reviewId: NEW_REVIEW_ID,
      userId: ACTOR_ID,
      role: 'owner',
      status: 'active',
    });

    const audits = forTable(auditLog) as Record<string, unknown>[];
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      reviewId: NEW_REVIEW_ID,
      actorId: ACTOR_ID,
      action: 'review.created',
    });
  });

  it('locks Blind Mode ON — all three firewall phases start independent', async () => {
    for (const reviewMode of ['two_reviewer', 'ai_co_reviewer'] as const) {
      const { db, forTable } = makeFakeDb();
      await createReview(
        { ...baseInput, reviewMode },
        { db, actorUserId: ACTOR_ID, orgId: ORG_ID, now: NOW },
      );
      const [review] = forTable(reviews) as Record<string, unknown>[];
      expect(review.screeningPhase).toBe('independent');
      expect(review.extractionPhase).toBe('independent');
      expect(review.robPhase).toBe('independent');
    }
  });

  it('cannot be tricked into starting a review unblinded', async () => {
    const { db, forTable } = makeFakeDb();
    // A caller that smuggles a reconcile phase through the input is ignored:
    // the core hard-codes independent.
    const smuggled = {
      ...baseInput,
      screeningPhase: 'reconcile',
      extractionPhase: 'reconcile',
      robPhase: 'reconcile',
    } as unknown as CreateReviewInput;

    await createReview(smuggled, {
      db,
      actorUserId: ACTOR_ID,
      orgId: ORG_ID,
      now: NOW,
    });

    const [review] = forTable(reviews) as Record<string, unknown>[];
    expect(review.screeningPhase).toBe('independent');
    expect(review.extractionPhase).toBe('independent');
    expect(review.robPhase).toBe('independent');
  });

  it('persists pending invitations with a hashed token + expiry', async () => {
    const { db, forTable } = makeFakeDb();
    let n = 0;
    await createReview(
      {
        ...baseInput,
        invites: [
          { email: 'Reviewer@Lab.TEST', role: 'reviewer' },
          { email: 'judge@lab.test', role: 'arbitrator' },
        ],
      },
      {
        db,
        actorUserId: ACTOR_ID,
        orgId: ORG_ID,
        now: NOW,
        makeToken: () => ({ token: `raw-${n}`, tokenHash: `hash-${n++}` }),
      },
    );

    const invites = forTable(reviewInvitations) as Record<string, unknown>[];
    expect(invites).toHaveLength(2);
    expect(invites[0]).toMatchObject({
      reviewId: NEW_REVIEW_ID,
      email: 'reviewer@lab.test', // normalized
      role: 'reviewer',
      tokenHash: 'hash-0',
      entropyBits: INVITE_ENTROPY_BITS,
      invitedBy: ACTOR_ID,
      status: 'pending',
    });
    expect((invites[0].expiresAt as Date).getTime()).toBe(
      NOW.getTime() + INVITE_TTL_MS,
    );

    // Each invitation is audit-logged alongside the review.created entry.
    const audits = forTable(auditLog) as Record<string, unknown>[];
    expect(
      audits.filter((a) => a.action === 'invitation.created'),
    ).toHaveLength(2);
  });

  it('skips blank invite rows without persisting them', async () => {
    const { db, forTable } = makeFakeDb();
    await createReview(
      { ...baseInput, invites: [{ email: '   ', role: 'reviewer' }] },
      { db, actorUserId: ACTOR_ID, orgId: ORG_ID, now: NOW },
    );
    expect(forTable(reviewInvitations)).toHaveLength(0);
  });
});

describe('validateCreateReviewInput', () => {
  it('rejects an empty title', () => {
    expect(() =>
      validateCreateReviewInput({ ...baseInput, title: '   ' }),
    ).toThrow(CreateReviewError);
  });

  it('rejects an over-long title', () => {
    expect(() =>
      validateCreateReviewInput({ ...baseInput, title: 'x'.repeat(201) }),
    ).toThrow(/200 characters/);
  });

  it('rejects an unknown review type', () => {
    expect(() =>
      validateCreateReviewInput({ ...baseInput, reviewType: 'made up' }),
    ).toThrow(/review type/i);
  });

  it('rejects an unknown review mode', () => {
    expect(() =>
      validateCreateReviewInput({ ...baseInput, reviewMode: 'solo' }),
    ).toThrow(/staffed/i);
  });

  it('rejects a malformed invite email', () => {
    expect(() =>
      validateCreateReviewInput({
        ...baseInput,
        invites: [{ email: 'not-an-email', role: 'reviewer' }],
      }),
    ).toThrow(/valid email/i);
  });

  it('rejects inviting someone as owner', () => {
    expect(() =>
      validateCreateReviewInput({
        ...baseInput,
        invites: [{ email: 'a@b.co', role: 'owner' }],
      }),
    ).toThrow(/role/i);
  });

  it('rejects a duplicate invite email (case-insensitive)', () => {
    expect(() =>
      validateCreateReviewInput({
        ...baseInput,
        invites: [
          { email: 'dup@lab.test', role: 'reviewer' },
          { email: 'DUP@lab.test', role: 'viewer' },
        ],
      }),
    ).toThrow(/more than once/i);
  });
});
