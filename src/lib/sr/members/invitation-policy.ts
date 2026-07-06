// ─────────────────────────────────────────────────────────────────────────────
// Invitation policy — the PURE decisions behind the hardened invite flow
// (FOUNDATION-auth-tenancy.md §7). No DB, no I/O, so single-use / expiring /
// email-bound / rate-limited can each be proven exhaustively in unit tests. The
// DB-touching service composes these; it never re-decides policy itself.
// ─────────────────────────────────────────────────────────────────────────────

// Short expiry: an unaccepted invite dies in a week. Long enough to reach a
// collaborator, short enough that a stale link is not a standing liability.
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Rate limit: at most N invites per review inside a rolling window. Bounds both
// spam and enumeration/brute-force attempts against the accept endpoint.
export const INVITE_RATE_LIMIT = 20;
export const INVITE_RATE_WINDOW_MS = 60 * 60 * 1000;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Deliberately conservative: a single @, no whitespace, a dot in the domain.
// Real deliverability is WorkOS's job; this only rejects obvious garbage at the
// input boundary before we mint a token for it.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(normalizeEmail(email));
}

export function computeInviteExpiry(now: Date): Date {
  return new Date(now.getTime() + INVITE_TTL_MS);
}

export function inviteRateWindowStart(now: Date): Date {
  return new Date(now.getTime() - INVITE_RATE_WINDOW_MS);
}

export function isInviteRateLimited(recentCount: number): boolean {
  return recentCount >= INVITE_RATE_LIMIT;
}

// The reasons an accept is refused. `not_found` is the only one that is safe to
// distinguish loudly (a garbage token); the others require possession of a real
// token, so telling the holder "expired" / "already used" leaks nothing.
export type AcceptRejectReason =
  | 'not_found'
  | 'not_pending'
  | 'expired'
  | 'email_mismatch'
  | 'account_unprovisioned';

export interface InviteForAccept {
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  expiresAt: Date;
  email: string;
}

export interface AcceptContext {
  now: Date;
  acceptingEmail: string;
}

export type AcceptEvaluation =
  | { ok: true }
  | {
      ok: false;
      reason: Exclude<
        AcceptRejectReason,
        'not_found' | 'account_unprovisioned'
      >;
    };

// The three token guarantees enforced together, in one pure function:
//   single-use → status must be exactly 'pending'
//   expiring   → now must be before expiresAt
//   email-bound→ the accepting user's email must equal the invited email
//                (case-insensitively, after normalization)
export function evaluateInviteForAccept(
  invite: InviteForAccept,
  ctx: AcceptContext,
): AcceptEvaluation {
  if (invite.status !== 'pending') {
    return { ok: false, reason: 'not_pending' };
  }
  if (ctx.now.getTime() >= invite.expiresAt.getTime()) {
    return { ok: false, reason: 'expired' };
  }
  if (normalizeEmail(invite.email) !== normalizeEmail(ctx.acceptingEmail)) {
    return { ok: false, reason: 'email_mismatch' };
  }
  return { ok: true };
}

// Human-facing copy for each refusal — actionable, never a stack trace.
export const ACCEPT_REJECT_MESSAGE: Record<AcceptRejectReason, string> = {
  not_found: 'This invitation link is not valid.',
  not_pending: 'This invitation has already been used or was revoked.',
  expired:
    'This invitation has expired. Ask the review owner to send a new one.',
  email_mismatch:
    'This invitation was sent to a different email address. Sign in with the invited address.',
  account_unprovisioned:
    'Your account is not set up yet. Sign in once, then open the invitation link again.',
};
