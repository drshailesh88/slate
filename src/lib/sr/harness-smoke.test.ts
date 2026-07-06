import { describe, expect, it } from 'vitest';

import { isDevAuthBypassActive } from '@/lib/auth/config';

import { totalScreened } from './harness-smoke';

describe('test harness bootstrap', () => {
  it('runs a pure SR helper (Vitest is wired)', () => {
    expect(totalScreened([1, 2, 3])).toBe(6);
    expect(totalScreened([])).toBe(0);
  });

  it('resolves the @/ path alias against real branch code', () => {
    expect(typeof isDevAuthBypassActive).toBe('function');
  });

  it('activates the dev auth bypass when WorkOS creds are absent (the E2E login path)', () => {
    const prev = {
      env: process.env.NODE_ENV,
      key: process.env.WORKOS_API_KEY,
      client: process.env.WORKOS_CLIENT_ID,
      cookie: process.env.WORKOS_COOKIE_PASSWORD,
    };
    try {
      vi.stubEnv('NODE_ENV', 'development');
      delete process.env.WORKOS_API_KEY;
      delete process.env.WORKOS_CLIENT_ID;
      delete process.env.WORKOS_COOKIE_PASSWORD;
      expect(isDevAuthBypassActive()).toBe(true);
    } finally {
      vi.unstubAllEnvs();
      process.env.WORKOS_API_KEY = prev.key;
      process.env.WORKOS_CLIENT_ID = prev.client;
      process.env.WORKOS_COOKIE_PASSWORD = prev.cookie;
      if (prev.key === undefined) delete process.env.WORKOS_API_KEY;
      if (prev.client === undefined) delete process.env.WORKOS_CLIENT_ID;
      if (prev.cookie === undefined) delete process.env.WORKOS_COOKIE_PASSWORD;
    }
  });
});
