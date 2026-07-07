import { and, count, desc, eq, gt, isNull, ne } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import {
  aiValidations,
  auditLog,
  reviewInvitations,
  reviewMembers,
  reviews,
} from '@/lib/db/schema/sr';
import type { MemberContext } from '@/lib/sr/authz/require-member';
import { assertArbitratorIndependentForReview } from '@/lib/sr/authz/arbitrator';
import type { ReviewRole } from '@/lib/sr/authz/policy';
import type { SessionUser } from '@/lib/auth/session';
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
import {
  ACCEPT_REJECT_MESSAGE,
  computeInviteExpiry,
  evaluateInviteForAccept,
  inviteRateWindowStart,
  isInviteRateLimited,
  isValidEmail,
  normalizeEmail,
} from './invitation-policy';
import { generateInviteToken, hashInviteToken } from './token';

// ─────────────────────────────────────────────────────────────────────────────
// Members/Team service (T7). The server-authoritative membership + invitation
// operations behind the Members screen. Every mutation is:
//   • owner-gated server-side (assertOwner) — never trusts a client flag,
//   • audit-trailed (audit_log write) — who/what/when/before/after,
//   • enforced against the science rules (arbitrator independence, AI gate).
//
// TRANSACTIONS / neon-http: the runtime driver has NO interactive transactions
// (CLAUDE.md "single idempotent statement" invariant), so invite ACCEPT cannot
// use SELECT … FOR UPDATE. Single-accept is instead enforced by an atomic
// conditional UPDATE (compare-and-swap): the row transitions pending→accepted in
// ONE statement whose WHERE clause requires status='pending'. Two concurrent
// accepts race on that one row; exactly one sees a row in RETURNING, the loser
// sees zero and is refused. This is an equal-or-stronger no-double-accept
// guarantee than row locking. Follow-on writes are idempotent + forward-only.
// This module reads only VISIBLE tables — never the three blinded base tables.
// ─────────────────────────────────────────────────────────────────────────────

type Db = ReturnType<typeof getDb>;

function assertOwner(actor: MemberContext): void {
  if (actor.member.role !== 'owner') {
    throw new OwnerActionRequiredError();
  }
}

async function writeAudit(
  db: Db,
  entry: {
    reviewId: string;
    actorId: string;
    action: string;
    target: string;
    before?: unknown;
    after?: unknown;
  },
): Promise<void> {
  await db.insert(auditLog).values({
    reviewId: entry.reviewId,
    actorId: entry.actorId,
    action: entry.action,
    target: entry.target,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
}

// ── Read: the whole team for the Members screen ──────────────────────────────

export type MemberStatus = 'active' | 'pending' | 'inactive';

export interface TeamMember {
  userId: string;
  name: string;
  email: string;
  role: ReviewRole;
  status: MemberStatus;
  isSelf: boolean;
  createdAt: Date;
}

export interface PendingInvitation {
  id: string;
  email: string;
  role: ReviewRole;
  expiresAt: Date;
  createdAt: Date;
  invitedByName: string | null;
}

export interface AiMemberRow {
  reviewMode: string;
  status: 'validated' | 'unvalidated';
  latestValidation: {
    model: string;
    recallOnIncludes: number;
    sampleSize: number;
    passed: boolean;
    createdAt: Date;
  } | null;
}

export interface ReviewTeam {
  members: TeamMember[];
  invitations: PendingInvitation[];
  ai: AiMemberRow;
}

// Any active member may view the team (the caller has already passed
// requireMember). Reads visible tables only.
export async function getReviewTeam(
  reviewId: string,
  selfUserId: string,
): Promise<ReviewTeam> {
  const db = getDb();

  const memberRows = await db
    .select({
      userId: reviewMembers.userId,
      role: reviewMembers.role,
      status: reviewMembers.status,
      createdAt: reviewMembers.createdAt,
      name: users.name,
      email: users.email,
    })
    .from(reviewMembers)
    .innerJoin(users, eq(reviewMembers.userId, users.id))
    .where(eq(reviewMembers.reviewId, reviewId))
    .orderBy(reviewMembers.createdAt);

  const members: TeamMember[] = memberRows
    .filter((row) => row.status !== 'inactive')
    .map((row) => ({
      userId: row.userId,
      name: row.name ?? row.email,
      email: row.email,
      role: row.role,
      status: row.status as MemberStatus,
      isSelf: row.userId === selfUserId,
      createdAt: row.createdAt,
    }));

  const invitationRows = await db
    .select({
      id: reviewInvitations.id,
      email: reviewInvitations.email,
      role: reviewInvitations.role,
      expiresAt: reviewInvitations.expiresAt,
      createdAt: reviewInvitations.createdAt,
      status: reviewInvitations.status,
      invitedByName: users.name,
    })
    .from(reviewInvitations)
    .leftJoin(users, eq(reviewInvitations.invitedBy, users.id))
    .where(eq(reviewInvitations.reviewId, reviewId))
    .orderBy(reviewInvitations.createdAt);

  const invitations: PendingInvitation[] = invitationRows
    .filter((row) => row.status === 'pending')
    .map((row) => ({
      id: row.id,
      email: row.email,
      role: row.role,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      invitedByName: row.invitedByName,
    }));

  const [review] = await db
    .select({ reviewMode: reviews.reviewMode })
    .from(reviews)
    .where(eq(reviews.id, reviewId))
    .limit(1);

  const [validation] = await db
    .select({
      model: aiValidations.model,
      recallOnIncludes: aiValidations.recallOnIncludes,
      sampleSize: aiValidations.sampleSize,
      passed: aiValidations.passed,
      createdAt: aiValidations.createdAt,
    })
    .from(aiValidations)
    .where(
      and(eq(aiValidations.reviewId, reviewId), eq(aiValidations.passed, true)),
    )
    .orderBy(desc(aiValidations.createdAt))
    .limit(1);

  const ai: AiMemberRow = {
    reviewMode: review?.reviewMode ?? 'two_reviewer',
    status: validation ? 'validated' : 'unvalidated',
    latestValidation: validation ?? null,
  };

  return { members, invitations, ai };
}

// Count the review's ACTIVE owners — used to refuse orphaning the review.
async function activeOwnerCount(db: Db, reviewId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(reviewMembers)
    .where(
      and(
        eq(reviewMembers.reviewId, reviewId),
        eq(reviewMembers.role, 'owner'),
        eq(reviewMembers.status, 'active'),
      ),
    );
  return row?.value ?? 0;
}

// ── Invite by email (mints a hashed, single-use, expiring, email-bound token) ─

export interface EmailInvitationResult {
  invitationId: string;
  email: string;
  role: ReviewRole;
  expiresAt: Date;
  /** The raw token — surfaced to the owner ONCE for the invite link. */
  token: string;
}

export async function createEmailInvitation(args: {
  actor: MemberContext;
  reviewId: string;
  email: string;
  role: ReviewRole;
}): Promise<EmailInvitationResult> {
  assertOwner(args.actor);

  if (!isValidEmail(args.email)) {
    throw new InvalidEmailError();
  }
  const email = normalizeEmail(args.email);
  const db = getDb();
  const now = new Date();

  const [recent] = await db
    .select({ value: count() })
    .from(reviewInvitations)
    .where(
      and(
        eq(reviewInvitations.reviewId, args.reviewId),
        gt(reviewInvitations.createdAt, inviteRateWindowStart(now)),
      ),
    );
  if (isInviteRateLimited(recent?.value ?? 0)) {
    throw new InviteRateLimitError();
  }

  // Supersede any prior pending invite for the same (review, email) so only one
  // live token exists per invitee at a time.
  await db
    .update(reviewInvitations)
    .set({ status: 'revoked' })
    .where(
      and(
        eq(reviewInvitations.reviewId, args.reviewId),
        eq(reviewInvitations.email, email),
        eq(reviewInvitations.status, 'pending'),
      ),
    );

  const { token, tokenHash, entropyBits } = generateInviteToken();
  const expiresAt = computeInviteExpiry(now);

  const [invitation] = await db
    .insert(reviewInvitations)
    .values({
      reviewId: args.reviewId,
      email,
      role: args.role,
      tokenHash,
      entropyBits,
      expiresAt,
      invitedBy: args.actor.userId,
      status: 'pending',
    })
    .returning({ id: reviewInvitations.id });

  await writeAudit(db, {
    reviewId: args.reviewId,
    actorId: args.actor.userId,
    action: 'invitation.create',
    target: `invitation:${invitation.id}`,
    after: { email, role: args.role, entropyBits },
  });

  return {
    invitationId: invitation.id,
    email,
    role: args.role,
    expiresAt,
    token,
  };
}

// ── Accept (the atomic, single-use, audited gate — see module header) ────────

export interface AcceptResult {
  reviewId: string;
  role: ReviewRole;
}

export async function acceptInvitation(args: {
  token: string;
  acceptingUser: SessionUser;
}): Promise<AcceptResult> {
  const db = getDb();
  const tokenHash = hashInviteToken(args.token);

  const [invite] = await db
    .select({
      id: reviewInvitations.id,
      reviewId: reviewInvitations.reviewId,
      email: reviewInvitations.email,
      role: reviewInvitations.role,
      status: reviewInvitations.status,
      expiresAt: reviewInvitations.expiresAt,
    })
    .from(reviewInvitations)
    .where(eq(reviewInvitations.tokenHash, tokenHash))
    .limit(1);

  if (!invite) {
    throw new InvitationInvalidError(
      'not_found',
      ACCEPT_REJECT_MESSAGE.not_found,
    );
  }

  const [accepter] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.workosUserId, args.acceptingUser.workosUserId))
    .limit(1);
  if (!accepter) {
    throw new InvitationInvalidError(
      'account_unprovisioned',
      ACCEPT_REJECT_MESSAGE.account_unprovisioned,
    );
  }

  const now = new Date();
  const evaluation = evaluateInviteForAccept(
    { status: invite.status, expiresAt: invite.expiresAt, email: invite.email },
    { now, acceptingEmail: args.acceptingUser.email },
  );
  if (!evaluation.ok) {
    throw new InvitationInvalidError(
      evaluation.reason,
      ACCEPT_REJECT_MESSAGE[evaluation.reason],
    );
  }

  // The single-accept gate: one atomic statement. Only the caller that flips the
  // row from pending gets it back; a concurrent second accept matches 0 rows.
  const claimed = await db
    .update(reviewInvitations)
    .set({ status: 'accepted' })
    .where(
      and(
        eq(reviewInvitations.id, invite.id),
        eq(reviewInvitations.status, 'pending'),
        gt(reviewInvitations.expiresAt, now),
      ),
    )
    .returning({ id: reviewInvitations.id });

  if (claimed.length === 0) {
    throw new InvitationInvalidError(
      'not_pending',
      ACCEPT_REJECT_MESSAGE.not_pending,
    );
  }

  // Forward-only, idempotent follow-ons.
  await db
    .update(reviewInvitations)
    .set({ status: 'revoked' })
    .where(
      and(
        eq(reviewInvitations.reviewId, invite.reviewId),
        eq(reviewInvitations.email, invite.email),
        eq(reviewInvitations.status, 'pending'),
        ne(reviewInvitations.id, invite.id),
      ),
    );

  await db
    .insert(reviewMembers)
    .values({
      reviewId: invite.reviewId,
      userId: accepter.id,
      role: invite.role,
      status: 'active',
    })
    .onConflictDoUpdate({
      target: [reviewMembers.reviewId, reviewMembers.userId],
      set: { role: invite.role, status: 'active', updatedAt: now },
    });

  await writeAudit(db, {
    reviewId: invite.reviewId,
    actorId: accepter.id,
    action: 'invitation.accept',
    target: `invitation:${invite.id}`,
    after: { role: invite.role },
  });

  return { reviewId: invite.reviewId, role: invite.role };
}

// ── Add an existing account directly (no email token) ────────────────────────

export async function addExistingMember(args: {
  actor: MemberContext;
  reviewId: string;
  email: string;
  role: ReviewRole;
}): Promise<{ userId: string; role: ReviewRole }> {
  assertOwner(args.actor);

  if (!isValidEmail(args.email)) {
    throw new InvalidEmailError();
  }
  const email = normalizeEmail(args.email);
  const db = getDb();

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)))
    .limit(1);
  if (!user) {
    throw new NoAccountError();
  }

  const [existing] = await db
    .select({ status: reviewMembers.status })
    .from(reviewMembers)
    .where(
      and(
        eq(reviewMembers.reviewId, args.reviewId),
        eq(reviewMembers.userId, user.id),
      ),
    )
    .limit(1);
  if (existing?.status === 'active') {
    throw new AlreadyMemberError();
  }

  if (args.role === 'arbitrator') {
    await assertArbitratorIndependentForReview({
      reviewId: args.reviewId,
      userId: user.id,
    });
  }

  await db
    .insert(reviewMembers)
    .values({
      reviewId: args.reviewId,
      userId: user.id,
      role: args.role,
      status: 'active',
    })
    .onConflictDoUpdate({
      target: [reviewMembers.reviewId, reviewMembers.userId],
      set: { role: args.role, status: 'active', updatedAt: new Date() },
    });

  await writeAudit(db, {
    reviewId: args.reviewId,
    actorId: args.actor.userId,
    action: 'member.add',
    target: `user:${user.id}`,
    after: { role: args.role, status: 'active' },
  });

  return { userId: user.id, role: args.role };
}

// ── Change role / revoke ─────────────────────────────────────────────────────

export async function changeMemberRole(args: {
  actor: MemberContext;
  reviewId: string;
  targetUserId: string;
  role: ReviewRole;
}): Promise<void> {
  assertOwner(args.actor);
  const db = getDb();

  const [target] = await db
    .select({ role: reviewMembers.role, status: reviewMembers.status })
    .from(reviewMembers)
    .where(
      and(
        eq(reviewMembers.reviewId, args.reviewId),
        eq(reviewMembers.userId, args.targetUserId),
        eq(reviewMembers.status, 'active'),
      ),
    )
    .limit(1);
  if (!target) {
    throw new MemberNotFoundError();
  }
  if (target.role === args.role) {
    return;
  }

  if (args.role === 'arbitrator') {
    await assertArbitratorIndependentForReview({
      reviewId: args.reviewId,
      userId: args.targetUserId,
    });
  }

  if (target.role === 'owner' && args.role !== 'owner') {
    if ((await activeOwnerCount(db, args.reviewId)) <= 1) {
      throw new LastOwnerError();
    }
  }

  await db
    .update(reviewMembers)
    .set({ role: args.role, updatedAt: new Date() })
    .where(
      and(
        eq(reviewMembers.reviewId, args.reviewId),
        eq(reviewMembers.userId, args.targetUserId),
      ),
    );

  await writeAudit(db, {
    reviewId: args.reviewId,
    actorId: args.actor.userId,
    action: 'member.role_change',
    target: `user:${args.targetUserId}`,
    before: { role: target.role },
    after: { role: args.role },
  });
}

export async function revokeMember(args: {
  actor: MemberContext;
  reviewId: string;
  targetUserId: string;
}): Promise<void> {
  assertOwner(args.actor);
  const db = getDb();

  const [target] = await db
    .select({ role: reviewMembers.role })
    .from(reviewMembers)
    .where(
      and(
        eq(reviewMembers.reviewId, args.reviewId),
        eq(reviewMembers.userId, args.targetUserId),
        eq(reviewMembers.status, 'active'),
      ),
    )
    .limit(1);
  if (!target) {
    throw new MemberNotFoundError();
  }
  if (
    target.role === 'owner' &&
    (await activeOwnerCount(db, args.reviewId)) <= 1
  ) {
    throw new LastOwnerError();
  }

  await db
    .update(reviewMembers)
    .set({ status: 'inactive', updatedAt: new Date() })
    .where(
      and(
        eq(reviewMembers.reviewId, args.reviewId),
        eq(reviewMembers.userId, args.targetUserId),
      ),
    );

  await writeAudit(db, {
    reviewId: args.reviewId,
    actorId: args.actor.userId,
    action: 'member.revoke',
    target: `user:${args.targetUserId}`,
    before: { role: target.role, status: 'active' },
    after: { status: 'inactive' },
  });
}

export async function revokeInvitation(args: {
  actor: MemberContext;
  reviewId: string;
  invitationId: string;
}): Promise<void> {
  assertOwner(args.actor);
  const db = getDb();

  const revoked = await db
    .update(reviewInvitations)
    .set({ status: 'revoked' })
    .where(
      and(
        eq(reviewInvitations.id, args.invitationId),
        eq(reviewInvitations.reviewId, args.reviewId),
        eq(reviewInvitations.status, 'pending'),
      ),
    )
    .returning({ id: reviewInvitations.id });

  if (revoked.length === 0) {
    throw new InvitationInvalidError(
      'not_pending',
      'That invitation is no longer pending.',
    );
  }

  await writeAudit(db, {
    reviewId: args.reviewId,
    actorId: args.actor.userId,
    action: 'invitation.revoke',
    target: `invitation:${args.invitationId}`,
  });
}

// ── AI reviewer member row (Activate / Validate) ─────────────────────────────
// The recall-validation GATE is built in M3 (T14): the flow lives in
// `src/lib/sr/ai/validation.ts` (`runRecallValidation` → records `ai_validations`,
// enforced by `hasPassingValidation`). Activate REFUSES unless a passing
// validation already exists (so the AI can never screen unvalidated); Validate
// records the request and points at that flow. Running a real validation needs
// two FOUNDER-provisioned inputs — the LLM provider key and a human-labelled
// calibration sample (see AGENTS.md) — so this entry stays a wired request until
// both land. Both actions are owner-only and audited.

export async function activateAiReviewer(args: {
  actor: MemberContext;
  reviewId: string;
}): Promise<{ status: 'validated' }> {
  assertOwner(args.actor);
  const db = getDb();

  const [passed] = await db
    .select({ id: aiValidations.id })
    .from(aiValidations)
    .where(
      and(
        eq(aiValidations.reviewId, args.reviewId),
        eq(aiValidations.passed, true),
      ),
    )
    .limit(1);
  if (!passed) {
    throw new AiValidationRequiredError();
  }

  await writeAudit(db, {
    reviewId: args.reviewId,
    actorId: args.actor.userId,
    action: 'ai.activate',
    target: 'ai_reviewer',
  });

  return { status: 'validated' };
}

export async function validateAiReviewer(args: {
  actor: MemberContext;
  reviewId: string;
}): Promise<{ pending: true; message: string }> {
  assertOwner(args.actor);
  const db = getDb();

  await writeAudit(db, {
    reviewId: args.reviewId,
    actorId: args.actor.userId,
    action: 'ai.validate.requested',
    target: 'ai_reviewer',
  });

  return {
    pending: true,
    message:
      'The AI recall-validation gate is built (recall ≥ target on the includes → ai_validations). Running it needs the founder LLM key and a human-labelled calibration sample; until both land, the AI stays unvalidated and cannot screen.',
  };
}
