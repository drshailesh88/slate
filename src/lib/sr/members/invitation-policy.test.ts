import { describe, expect, it } from 'vitest';
import {
  INVITE_RATE_LIMIT,
  INVITE_TTL_MS,
  computeInviteExpiry,
  evaluateInviteForAccept,
  isInviteRateLimited,
  isValidEmail,
  normalizeEmail,
} from './invitation-policy';

const NOW = new Date('2026-07-06T12:00:00.000Z');
const FUTURE = new Date(NOW.getTime() + 60_000);
const PAST = new Date(NOW.getTime() - 60_000);

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Reviewer@Lab.TEST ')).toBe('reviewer@lab.test');
  });
});

describe('isValidEmail', () => {
  it.each([
    ['reviewer@lab.test', true],
    ['a@b.co', true],
    ['no-at-sign', false],
    ['two@@at.test', false],
    ['no domain@', false],
    ['space @lab.test', false],
    ['nodot@localhost', false],
  ])('%s → %s', (email, expected) => {
    expect(isValidEmail(email)).toBe(expected);
  });
});

describe('computeInviteExpiry', () => {
  it('is a short, forward TTL', () => {
    expect(computeInviteExpiry(NOW).getTime()).toBe(
      NOW.getTime() + INVITE_TTL_MS,
    );
    expect(INVITE_TTL_MS).toBeLessThanOrEqual(30 * 24 * 60 * 60 * 1000);
  });
});

describe('isInviteRateLimited', () => {
  it('refuses at or above the limit', () => {
    expect(isInviteRateLimited(INVITE_RATE_LIMIT - 1)).toBe(false);
    expect(isInviteRateLimited(INVITE_RATE_LIMIT)).toBe(true);
    expect(isInviteRateLimited(INVITE_RATE_LIMIT + 5)).toBe(true);
  });
});

describe('evaluateInviteForAccept — single-use / expiring / email-bound', () => {
  const base = {
    status: 'pending' as const,
    expiresAt: FUTURE,
    email: 'invitee@lab.test',
  };

  it('accepts a pending, unexpired, email-matching invite', () => {
    expect(
      evaluateInviteForAccept(base, {
        now: NOW,
        acceptingEmail: 'invitee@lab.test',
      }),
    ).toEqual({ ok: true });
  });

  it('is email-bound case-insensitively', () => {
    expect(
      evaluateInviteForAccept(base, {
        now: NOW,
        acceptingEmail: '  INVITEE@LAB.TEST ',
      }),
    ).toEqual({ ok: true });
  });

  it('rejects a different accepting email (email-bound)', () => {
    expect(
      evaluateInviteForAccept(base, {
        now: NOW,
        acceptingEmail: 'someone-else@lab.test',
      }),
    ).toEqual({ ok: false, reason: 'email_mismatch' });
  });

  it('rejects an expired invite', () => {
    expect(
      evaluateInviteForAccept(
        { ...base, expiresAt: PAST },
        { now: NOW, acceptingEmail: 'invitee@lab.test' },
      ),
    ).toEqual({ ok: false, reason: 'expired' });
  });

  it('rejects exactly at expiry (boundary is not inclusive)', () => {
    expect(
      evaluateInviteForAccept(
        { ...base, expiresAt: NOW },
        { now: NOW, acceptingEmail: 'invitee@lab.test' },
      ),
    ).toEqual({ ok: false, reason: 'expired' });
  });

  it.each(['accepted', 'revoked', 'expired'] as const)(
    'rejects a non-pending (%s) invite — single-use',
    (status) => {
      expect(
        evaluateInviteForAccept(
          { ...base, status },
          { now: NOW, acceptingEmail: 'invitee@lab.test' },
        ),
      ).toEqual({ ok: false, reason: 'not_pending' });
    },
  );
});
