import { describe, expect, it } from 'vitest';
import { reviewRoleEnum } from '@/lib/db/schema/sr-enums';
import {
  ASSIGNABLE_ROLES,
  ROLE_CAPABILITY,
  ROLE_LABELS,
  ROLE_ORDER,
  compareByRoleThenName,
  isAssignableRole,
  isOwnerRole,
} from './roles';

describe('role metadata', () => {
  it('covers exactly the schema roles (no drift)', () => {
    expect([...ROLE_ORDER].sort()).toEqual(
      [...reviewRoleEnum.enumValues].sort(),
    );
    for (const role of reviewRoleEnum.enumValues) {
      expect(ROLE_LABELS[role]).toBeTruthy();
      expect(ROLE_CAPABILITY[role]).toBeTruthy();
    }
  });

  it('lists owner first for display', () => {
    expect(ROLE_ORDER[0]).toBe('owner');
  });

  it('recognizes only real roles as assignable', () => {
    expect(isAssignableRole('reviewer')).toBe(true);
    expect(isAssignableRole('arbitrator')).toBe(true);
    expect(isAssignableRole('superadmin')).toBe(false);
    expect(ASSIGNABLE_ROLES).toContain('owner');
  });

  it('identifies the owner role', () => {
    expect(isOwnerRole('owner')).toBe(true);
    expect(isOwnerRole('viewer')).toBe(false);
  });
});

describe('compareByRoleThenName', () => {
  it('orders by role priority then name', () => {
    const sorted = [
      { role: 'viewer' as const, name: 'Zed' },
      { role: 'owner' as const, name: 'Bob' },
      { role: 'reviewer' as const, name: 'Ann' },
      { role: 'reviewer' as const, name: 'Cara' },
    ].sort(compareByRoleThenName);

    expect(sorted.map((m) => m.name)).toEqual(['Bob', 'Ann', 'Cara', 'Zed']);
  });
});
