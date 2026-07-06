/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
// This spec imports `vitest`, which is not installed yet: the Vitest+Playwright
// harness is owned by SR task T5 and lands separately. The root tsconfig globs
// `**/*.ts`, so without @ts-nocheck `tsc --noEmit` would fail on the unresolved
// import. Vitest's runtime ignores the directive, so the spec executes normally
// once T5's harness merges. Do NOT add a test runner here.
import { describe, expect, it } from 'vitest';
import {
  applyRowVisibility,
  BlindedAccessError,
  computeSurfaceProgress,
  resolveAggregateVisibility,
  resolveRowVisibility,
  type Phase,
  type ReviewRole,
} from './policy';

const ROLES: ReviewRole[] = [
  'owner',
  'collaborator',
  'reviewer',
  'arbitrator',
  'viewer',
];
const PHASES: Phase[] = ['independent', 'reconcile'];

// The intended matrix, stated independently of the implementation so a
// regression in the policy is caught rather than mirrored.
function expectedRowVisibility(role: ReviewRole, phase: Phase) {
  if (role === 'viewer') return 'none';
  return phase === 'independent' ? 'own' : 'all';
}

describe('resolveRowVisibility — the role × phase matrix (deny-by-default)', () => {
  for (const role of ROLES) {
    for (const phase of PHASES) {
      const expected = expectedRowVisibility(role, phase);
      it(`role=${role} phase=${phase} → ${expected}`, () => {
        expect(resolveRowVisibility(role, phase)).toBe(expected);
      });
    }
  }

  it('NEVER returns "all" during independent for any role', () => {
    for (const role of ROLES) {
      expect(resolveRowVisibility(role, 'independent')).not.toBe('all');
    }
  });

  it('owner and arbitrator get no peek at others during independent (own only)', () => {
    expect(resolveRowVisibility('owner', 'independent')).toBe('own');
    expect(resolveRowVisibility('arbitrator', 'independent')).toBe('own');
  });

  it('viewer never sees raw rows in either phase', () => {
    expect(resolveRowVisibility('viewer', 'independent')).toBe('none');
    expect(resolveRowVisibility('viewer', 'reconcile')).toBe('none');
  });

  it('denies an unknown role in both phases (deny-by-default)', () => {
    const rogue = 'superuser' as unknown as ReviewRole;
    expect(resolveRowVisibility(rogue, 'independent')).toBe('none');
    expect(resolveRowVisibility(rogue, 'reconcile')).toBe('none');
  });

  it('denies an unknown phase (deny-by-default)', () => {
    const rogue = 'exported' as unknown as Phase;
    for (const role of ROLES) {
      expect(resolveRowVisibility(role, rogue)).toBe('none');
    }
  });
});

describe('resolveAggregateVisibility — aggregates are blinded data', () => {
  it('refuses every aggregate during independent (no role may count others)', () => {
    for (const role of ROLES) {
      expect(resolveAggregateVisibility(role, 'independent')).toBe('none');
    }
  });

  it('permits aggregates at reconcile only for full-visibility roles', () => {
    for (const role of ROLES) {
      const expected =
        expectedRowVisibility(role, 'reconcile') === 'all' ? 'all' : 'none';
      expect(resolveAggregateVisibility(role, 'reconcile')).toBe(expected);
    }
  });

  it('viewer never gets an aggregate', () => {
    expect(resolveAggregateVisibility('viewer', 'independent')).toBe('none');
    expect(resolveAggregateVisibility('viewer', 'reconcile')).toBe('none');
  });
});

describe('applyRowVisibility — the filter can never widen a result', () => {
  const rows = [
    { reviewerId: 'me', decision: 'include' },
    { reviewerId: 'you', decision: 'exclude' },
    { reviewerId: 'me', decision: 'maybe' },
  ];

  it('own → only the requester rows', () => {
    const out = applyRowVisibility(rows, 'own', 'me');
    expect(out).toHaveLength(2);
    expect(out.every((r) => r.reviewerId === 'me')).toBe(true);
  });

  it('all → every row', () => {
    expect(applyRowVisibility(rows, 'all', 'me')).toHaveLength(3);
  });

  it('none → nothing', () => {
    expect(applyRowVisibility(rows, 'none', 'me')).toHaveLength(0);
  });

  it('own returns empty when the requester authored nothing (owner peek)', () => {
    expect(applyRowVisibility(rows, 'own', 'owner-with-no-rows')).toHaveLength(
      0,
    );
  });

  it('does not mutate the input for "all"', () => {
    const out = applyRowVisibility(rows, 'all', 'me');
    expect(out).not.toBe(rows);
    expect(rows).toHaveLength(3);
  });
});

describe('BlindedAccessError', () => {
  it('carries the surface, role, phase and kind', () => {
    const err = new BlindedAccessError('screening', 'viewer', 'independent');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('BlindedAccessError');
    expect(err.surface).toBe('screening');
    expect(err.role).toBe('viewer');
    expect(err.phase).toBe('independent');
    expect(err.kind).toBe('rows');
  });

  it('defaults kind to rows and accepts aggregate', () => {
    const agg = new BlindedAccessError(
      'rob',
      'reviewer',
      'independent',
      'aggregate',
    );
    expect(agg.kind).toBe('aggregate');
  });
});

describe('computeSurfaceProgress — completion counts only', () => {
  it('counts a reviewer finished only when all their rows are locked', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const rows = [
      { reviewerId: 'a', lockedAt: now }, // a: finished
      { reviewerId: 'b', lockedAt: now },
      { reviewerId: 'b', lockedAt: null }, // b: not finished (one open)
    ];
    const progress = computeSurfaceProgress(rows, ['a', 'b', 'c']);
    expect(progress).toEqual({ finishedReviewers: 1, totalReviewers: 3 });
  });

  it('a member who has not started counts toward the total, not finished', () => {
    const progress = computeSurfaceProgress([], ['a', 'b', 'c']);
    expect(progress).toEqual({ finishedReviewers: 0, totalReviewers: 3 });
  });

  it('ignores rows from members outside the expected set', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const rows = [{ reviewerId: 'stranger', lockedAt: now }];
    const progress = computeSurfaceProgress(rows, ['a', 'b']);
    expect(progress).toEqual({ finishedReviewers: 0, totalReviewers: 2 });
  });

  it('returns ONLY the two integer count fields — no distribution leaks', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const rows = [{ reviewerId: 'a', lockedAt: now }];
    const progress = computeSurfaceProgress(rows, ['a', 'b']);
    expect(Object.keys(progress).sort()).toEqual([
      'finishedReviewers',
      'totalReviewers',
    ]);
  });
});
