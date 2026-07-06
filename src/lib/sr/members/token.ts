import { createHash, randomBytes } from 'node:crypto';

// ─────────────────────────────────────────────────────────────────────────────
// Invitation token minting (FOUNDATION-auth-tenancy.md §7, non-negotiable #5).
//
// The security shape: a cryptographically-random, single-use, email-bound token.
// The DATABASE only ever stores the token's SHA-256 HASH (`review_invitations.
// tokenHash`), never the token itself — so a leaked DB dump cannot be replayed
// into review access. The raw token is returned to the caller exactly once (to
// surface in the invite link) and then discarded.
//
// Lookup is by the deterministic hash of the presented token against a UNIQUE
// indexed column. Because the token carries 256 bits of entropy, the hash space
// is not enumerable — an attacker cannot guess a token, and cannot probe for
// which hashes exist. This is the "constant-time lookup / no enumeration"
// property: possession of a real token is required to compute a matching hash.
// ─────────────────────────────────────────────────────────────────────────────

// 32 random bytes → 256 bits of entropy. base64url keeps the token URL-safe for
// the invite link without padding characters.
export const INVITE_TOKEN_BYTES = 32;
export const INVITE_ENTROPY_BITS = INVITE_TOKEN_BYTES * 8;

export interface MintedInviteToken {
  /** The raw single-use token — surfaced ONCE in the invite link, never stored. */
  token: string;
  /** SHA-256 hex of the token — the only value persisted (`tokenHash`). */
  tokenHash: string;
  /** Entropy recorded alongside the hash for audit (`entropyBits`). */
  entropyBits: number;
}

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateInviteToken(): MintedInviteToken {
  const token = randomBytes(INVITE_TOKEN_BYTES).toString('base64url');
  return {
    token,
    tokenHash: hashInviteToken(token),
    entropyBits: INVITE_ENTROPY_BITS,
  };
}
