import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/auth/session', () => ({
  getSessionUser: vi.fn(async () => ({
    workosUserId: 'user_abc',
    email: 'a@b.c',
    name: 'Dr. Test',
    avatarUrl: null,
    isMock: true,
  })),
}));

import { getCurrentUserId } from '@/lib/auth';

describe('getCurrentUserId', () => {
  it('returns the WorkOS user id from the session', async () => {
    await expect(getCurrentUserId()).resolves.toBe('user_abc');
  });
});
