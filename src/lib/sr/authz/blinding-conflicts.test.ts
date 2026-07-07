/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
// Adversarial coverage for the T13 conflict channel (extends the T6 suite): the
// opposing screening calls that power the Conflicts screen are an AGGREGATE over
// every reviewer's rows, so they must never leave the chokepoint during
// `independent`. Each test PRIMES the DB so both an include and an exclude are
// physically present, then proves getScreeningConflicts withholds them — with a
// reconcile-phase positive control so no assertion passes vacuously.
// Imports `vitest` (harness owned by T5). Mirrors blinded-read.test.ts.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({ getDb: vi.fn() }));

import { getDb } from '@/lib/db/client';
import {
  BlindedAccessError,
  getScreeningConflicts,
  type BlindedContext,
  type ReviewRole,
} from './blinded-read';

const REVIEW_ID = 'review-1';
const SELF = 'user-self';
const OTHER = 'user-other';

// A genuine opposing pair on one study — the exact thing that must not surface
// before reconcile.
const opposingRaw = [
  {
    id: 's1',
    review_id: REVIEW_ID,
    study_id: 'st1',
    reviewer_id: SELF,
    stage: 'title_abstract',
    decision: 'include',
    exclude_reason_code: null,
    exclude_reason_detail: null,
    is_ai: false,
    locked_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 's2',
    review_id: REVIEW_ID,
    study_id: 'st1',
    reviewer_id: OTHER,
    stage: 'title_abstract',
    decision: 'exclude',
    exclude_reason_code: null,
    exclude_reason_detail: null,
    is_ai: false,
    locked_at: '2026-01-01T00:00:00Z',
  },
];

const ROLES: ReviewRole[] = [
  'owner',
  'collaborator',
  'reviewer',
  'arbitrator',
  'viewer',
];

function primeDb(...responses: Array<{ rows: unknown[] }>) {
  const execute = vi.fn();
  for (const r of responses) execute.mockResolvedValueOnce(r);
  (getDb as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ execute });
  return execute;
}

function ctx(role: ReviewRole): BlindedContext {
  return { reviewId: REVIEW_ID, requesterId: SELF, role };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getScreeningConflicts — the reconcile gate', () => {
  it('withholds conflicts during independent for EVERY role', async () => {
    for (const role of ROLES) {
      // Even with the opposing rows primed, only the phase read should happen
      // before it throws — the rows are never fetched.
      const execute = primeDb(
        { rows: [{ phase: 'independent' }] },
        { rows: opposingRaw },
      );
      await expect(
        getScreeningConflicts(ctx(role), 'title_abstract'),
      ).rejects.toBeInstanceOf(BlindedAccessError);
      expect(execute).toHaveBeenCalledTimes(1);
    }
  });

  it('still withholds conflicts for a viewer at reconcile', async () => {
    primeDb({ rows: [{ phase: 'reconcile' }] }, { rows: opposingRaw });
    await expect(
      getScreeningConflicts(ctx('viewer'), 'title_abstract'),
    ).rejects.toBeInstanceOf(BlindedAccessError);
  });

  it('reveals the conflict + κ at reconcile for a full-visibility role (positive control)', async () => {
    primeDb({ rows: [{ phase: 'reconcile' }] }, { rows: opposingRaw });
    const result = await getScreeningConflicts(ctx('owner'), 'title_abstract');
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].studyId).toBe('st1');
    expect(result.conflicts[0].decisions.map((d) => d.decision).sort()).toEqual(
      ['exclude', 'include'],
    );
    // κ is a real readout over the revealed pair (a genuine disagreement).
    expect(result.kappa.value).not.toBeNull();
  });

  it('scopes conflicts to the requested stage', async () => {
    primeDb({ rows: [{ phase: 'reconcile' }] }, { rows: opposingRaw });
    const result = await getScreeningConflicts(ctx('owner'), 'full_text');
    // The primed opposition is on title_abstract, so full_text sees none.
    expect(result.conflicts).toHaveLength(0);
  });
});
