import { getDb } from '@/lib/db/client';
import {
  auditLog,
  reviewInvitations,
  reviewMembers,
  reviews,
} from '@/lib/db/schema/sr';
import {
  isInvitableRole,
  isReviewMode,
  isReviewType,
  type ReviewMode,
  type ReviewRole,
  type ReviewType,
} from './review-modes';
import {
  generateInviteToken,
  INVITE_ENTROPY_BITS,
  INVITE_TTL_MS,
  type InviteToken,
} from './invitations';

// ─────────────────────────────────────────────────────────────────────────────
// Create-review persistence core. Deliberately UI- and auth-free so it is
// exhaustively unit-testable at the getDb() boundary; the server action
// (../../app/(app)/systematic-review/new/actions.ts) owns session, org scope,
// and the redirect.
//
// Blind Mode is LOCKED ON: every review is created with all three firewall
// phases at `independent`. There is no input that can start a review in
// `reconcile` — the science requires blinded independent work. This module
// hard-codes the phases and ignores any phase-shaped field on its input.
// ─────────────────────────────────────────────────────────────────────────────

const TITLE_MAX = 200;

export class CreateReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CreateReviewError';
  }
}

export interface InviteInput {
  email: string;
  role: string;
}

export interface CreateReviewInput {
  title: string;
  reviewType: string;
  reviewMode: string;
  invites?: InviteInput[];
}

export interface CleanInvite {
  email: string;
  role: ReviewRole;
}

export interface CleanCreateReviewInput {
  title: string;
  reviewType: ReviewType;
  reviewMode: ReviewMode;
  invites: CleanInvite[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Validate + normalize untrusted wizard input. Throws CreateReviewError with an
// actionable message on the first problem (the action surfaces it to the user).
export function validateCreateReviewInput(
  input: CreateReviewInput,
): CleanCreateReviewInput {
  const title = (input.title ?? '').trim();
  if (title.length === 0) {
    throw new CreateReviewError('Enter a title for your review.');
  }
  if (title.length > TITLE_MAX) {
    throw new CreateReviewError(
      `Keep the review title to ${TITLE_MAX} characters or fewer.`,
    );
  }

  if (!isReviewType(input.reviewType)) {
    throw new CreateReviewError('Choose a review type.');
  }

  if (!isReviewMode(input.reviewMode)) {
    throw new CreateReviewError('Choose how the review is staffed.');
  }

  const invites: CleanInvite[] = [];
  const seen = new Set<string>();
  for (const raw of input.invites ?? []) {
    const email = (raw.email ?? '').trim().toLowerCase();
    if (email.length === 0) continue; // a blank row is an unfilled optional row
    if (!EMAIL_RE.test(email)) {
      throw new CreateReviewError(
        `"${raw.email}" is not a valid email address.`,
      );
    }
    if (!isInvitableRole(raw.role)) {
      throw new CreateReviewError(`Choose a role for ${email}.`);
    }
    if (seen.has(email)) {
      throw new CreateReviewError(`${email} is invited more than once.`);
    }
    seen.add(email);
    invites.push({ email, role: raw.role });
  }

  return {
    title,
    reviewType: input.reviewType,
    reviewMode: input.reviewMode,
    invites,
  };
}

type Db = ReturnType<typeof getDb>;

export interface CreateReviewDeps {
  db?: Db;
  actorUserId: string;
  orgId: string;
  now?: Date;
  makeToken?: () => InviteToken;
}

export interface CreateReviewResult {
  reviewId: string;
}

// Persist a new review, the creator's owner membership, an audit entry, and any
// pending invitations. neon-http has no interactive transactions, so writes are
// ordered so the load-bearing rows (review, owner) land first.
export async function createReview(
  input: CreateReviewInput,
  deps: CreateReviewDeps,
): Promise<CreateReviewResult> {
  const clean = validateCreateReviewInput(input);
  const db = deps.db ?? getDb();
  const now = deps.now ?? new Date();
  const makeToken = deps.makeToken ?? generateInviteToken;

  const [review] = await db
    .insert(reviews)
    .values({
      orgId: deps.orgId,
      title: clean.title,
      reviewType: clean.reviewType,
      reviewMode: clean.reviewMode,
      // Blind Mode locked ON — every surface starts blinded/independent.
      screeningPhase: 'independent',
      extractionPhase: 'independent',
      robPhase: 'independent',
      createdBy: deps.actorUserId,
    })
    .returning({ id: reviews.id });

  const reviewId = review.id;

  await db.insert(reviewMembers).values({
    reviewId,
    userId: deps.actorUserId,
    role: 'owner',
    status: 'active',
  });

  await db.insert(auditLog).values({
    reviewId,
    actorId: deps.actorUserId,
    action: 'review.created',
    target: `review:${reviewId}`,
    before: null,
    after: {
      title: clean.title,
      reviewType: clean.reviewType,
      reviewMode: clean.reviewMode,
      invited: clean.invites.length,
    },
  });

  for (const invite of clean.invites) {
    const { tokenHash } = makeToken();
    await db.insert(reviewInvitations).values({
      reviewId,
      email: invite.email,
      role: invite.role,
      tokenHash,
      entropyBits: INVITE_ENTROPY_BITS,
      expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
      invitedBy: deps.actorUserId,
      status: 'pending',
    });

    await db.insert(auditLog).values({
      reviewId,
      actorId: deps.actorUserId,
      action: 'invitation.created',
      target: `invitation:${invite.email}`,
      before: null,
      after: { email: invite.email, role: invite.role, status: 'pending' },
    });
  }

  return { reviewId };
}
