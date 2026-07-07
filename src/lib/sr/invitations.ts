import { createHash, randomBytes } from 'node:crypto';

// ─────────────────────────────────────────────────────────────────────────────
// Single-use invitation token primitives. Only the SHA-256 hash of a token is
// ever stored (review_invitations.tokenHash) — the raw token is returned to the
// caller for delivery and never persisted. Invitations created at review setup
// land as `pending`; delivery + acceptance are a later (Members/Team) task.
// ─────────────────────────────────────────────────────────────────────────────

export const INVITE_ENTROPY_BITS = 256;
export const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

export interface InviteToken {
  token: string;
  tokenHash: string;
}

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateInviteToken(): InviteToken {
  const token = randomBytes(INVITE_ENTROPY_BITS / 8).toString('base64url');
  return { token, tokenHash: hashInviteToken(token) };
}
