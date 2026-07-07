import { describe, it, expect } from 'vitest';
import { getUserScopes } from '@/lib/actions/scopes';
import { getDomainPreferences } from '@/lib/actions/domain-preferences';

describe('slice-1 action stubs', () => {
  it('getUserScopes returns an empty list', async () => {
    await expect(getUserScopes()).resolves.toEqual([]);
  });
  it('getDomainPreferences returns an empty list', async () => {
    await expect(getDomainPreferences()).resolves.toEqual([]);
  });
});
