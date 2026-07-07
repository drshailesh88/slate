import { describe, expect, it } from 'vitest';
import type { ReviewRole } from '@/lib/sr/authz/policy';
import { canResolveConflict } from './roles';

describe('canResolveConflict', () => {
  it('allows the working roles that see all rows at reconcile', () => {
    for (const role of [
      'owner',
      'collaborator',
      'reviewer',
      'arbitrator',
    ] as ReviewRole[]) {
      expect(canResolveConflict(role)).toBe(true);
    }
  });

  it('never lets a viewer resolve a conflict', () => {
    expect(canResolveConflict('viewer')).toBe(false);
  });
});
