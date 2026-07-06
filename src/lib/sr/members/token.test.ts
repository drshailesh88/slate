import { describe, expect, it } from 'vitest';
import {
  INVITE_ENTROPY_BITS,
  generateInviteToken,
  hashInviteToken,
} from './token';

// The token contract (FOUNDATION §7 / non-negotiable #5): what's persisted is a
// HASH, never the token; tokens carry high entropy; the hash is deterministic
// (so lookup is by hash) yet the token is unique per mint.

describe('generateInviteToken', () => {
  it('records 256 bits of entropy', () => {
    expect(generateInviteToken().entropyBits).toBe(256);
    expect(INVITE_ENTROPY_BITS).toBe(256);
  });

  it('never returns the token as its own stored hash (only the hash is persisted)', () => {
    const { token, tokenHash } = generateInviteToken();
    expect(tokenHash).not.toBe(token);
    // sha256 hex is 64 chars; the raw base64url token is not.
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('mints a distinct high-entropy token each call (no collisions)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i += 1) {
      seen.add(generateInviteToken().token);
    }
    expect(seen.size).toBe(500);
  });

  it('stores a hash that verifies the presented token deterministically', () => {
    const { token, tokenHash } = generateInviteToken();
    expect(hashInviteToken(token)).toBe(tokenHash);
    expect(hashInviteToken(token)).toBe(hashInviteToken(token));
  });

  it('a wrong token never hashes to a stored hash', () => {
    const { token, tokenHash } = generateInviteToken();
    expect(hashInviteToken(token + 'x')).not.toBe(tokenHash);
  });
});
