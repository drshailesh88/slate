/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
// Imports `vitest`, not installed yet (harness owned by SR task T5). The root
// tsconfig globs `**/*.ts`; @ts-nocheck keeps `tsc --noEmit` green while the spec
// still runs under Vitest once T5's harness merges. See policy.test.ts. Do NOT
// add a test runner here.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({ getDb: vi.fn() }));

import { getDb } from '@/lib/db/client';
import {
  BlindedAccessError,
  getExtractionEntries,
  getRobAssessments,
  getSafeProgress,
  getScreeningDecisions,
  getScreeningTally,
  type BlindedContext,
  type Phase,
  type ReviewRole,
} from './blinded-read';

const REVIEW_ID = 'review-1';
const SELF = 'user-self';
const OTHER = 'user-other';
const LOCKED = '2026-01-01T00:00:00Z';

// One row authored by the requester, one by a co-reviewer — the whole point of
// blinding is that the second must never surface during independent.
const screeningRaw = [
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
    locked_at: LOCKED,
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
    locked_at: null,
  },
];

const extractionRaw = [
  {
    id: 'e1',
    review_id: REVIEW_ID,
    study_id: 'st1',
    field_id: 'sample_size',
    reviewer_id: SELF,
    value: '120',
    state: 'reported',
    derived: false,
    derived_formula: null,
    provenance: { reportId: 'rep1', page: 4 },
    is_ai: false,
    locked_at: LOCKED,
  },
  {
    id: 'e2',
    review_id: REVIEW_ID,
    study_id: 'st1',
    field_id: 'sample_size',
    reviewer_id: OTHER,
    value: '118',
    state: 'reported',
    derived: false,
    derived_formula: null,
    provenance: { reportId: 'rep1', page: 4 },
    is_ai: false,
    locked_at: null,
  },
];

const robRaw = [
  {
    id: 'b1',
    review_id: REVIEW_ID,
    study_id: 'st1',
    reviewer_id: SELF,
    domain: 'randomization',
    judgement: 'low',
    support_quote: 'Computer-generated sequence.',
    is_ai: false,
    locked_at: LOCKED,
  },
  {
    id: 'b2',
    review_id: REVIEW_ID,
    study_id: 'st1',
    reviewer_id: OTHER,
    domain: 'randomization',
    judgement: 'high',
    support_quote: null,
    is_ai: false,
    locked_at: null,
  },
];

const ROLES: ReviewRole[] = [
  'owner',
  'collaborator',
  'reviewer',
  'arbitrator',
  'viewer',
];
const PHASES: Phase[] = ['independent', 'reconcile'];

function expectedVisibility(role: ReviewRole, phase: Phase) {
  if (role === 'viewer') return 'none';
  return phase === 'independent' ? 'own' : 'all';
}

// Mock getDb().execute to answer, in call order, the queued responses.
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

// Each blinded table gets the full role × phase sweep through its reader.
const TABLES = [
  {
    surface: 'screening',
    getter: getScreeningDecisions,
    raw: screeningRaw,
  },
  {
    surface: 'extraction',
    getter: getExtractionEntries,
    raw: extractionRaw,
  },
  {
    surface: 'rob',
    getter: getRobAssessments,
    raw: robRaw,
  },
] as const;

for (const { surface, getter, raw } of TABLES) {
  describe(`${surface} reader — role × phase × table matrix`, () => {
    for (const role of ROLES) {
      for (const phase of PHASES) {
        const vis = expectedVisibility(role, phase);

        it(`role=${role} phase=${phase} → ${vis}`, async () => {
          if (vis === 'none') {
            // Denied: only the phase read happens, then it throws before touching rows.
            primeDb({ rows: [{ phase }] });
            await expect(getter(ctx(role))).rejects.toBeInstanceOf(
              BlindedAccessError,
            );
            return;
          }

          const execute = primeDb({ rows: [{ phase }] }, { rows: raw });
          const out = await getter(ctx(role));

          if (vis === 'own') {
            expect(out).toHaveLength(1);
            expect(out.every((r) => r.reviewerId === SELF)).toBe(true);
          } else {
            expect(out).toHaveLength(2);
          }
          // Exactly two reads: the authoritative phase lookup, then the blinded
          // rows (which the module only ever reads via the definer function).
          expect(execute).toHaveBeenCalledTimes(2);
        });
      }
    }

    it('during independent, a co-reviewer row is never returned to a reviewer', async () => {
      primeDb({ rows: [{ phase: 'independent' }] }, { rows: raw });
      const out = await getter(ctx('reviewer'));
      expect(out.some((r) => r.reviewerId === OTHER)).toBe(false);
    });
  });
}

describe('getScreeningTally — aggregates are blinded data', () => {
  it('refuses the tally during independent for every role', async () => {
    for (const role of ROLES) {
      primeDb({ rows: [{ phase: 'independent' }] });
      await expect(getScreeningTally(ctx(role))).rejects.toBeInstanceOf(
        BlindedAccessError,
      );
    }
  });

  it('computes the distribution at reconcile for a full-visibility role', async () => {
    primeDb({ rows: [{ phase: 'reconcile' }] }, { rows: screeningRaw });
    const tally = await getScreeningTally(ctx('owner'));
    expect(tally).toEqual({ include: 1, exclude: 1, maybe: 0, total: 2 });
  });

  it('still refuses the tally for a viewer at reconcile', async () => {
    primeDb({ rows: [{ phase: 'reconcile' }] });
    await expect(getScreeningTally(ctx('viewer'))).rejects.toBeInstanceOf(
      BlindedAccessError,
    );
  });
});

describe('getSafeProgress — completion counts only', () => {
  it('reports finished/total per surface and nothing else', async () => {
    // Call order: members, then screening, extraction, rob (Promise.all order).
    primeDb(
      {
        rows: [
          { user_id: SELF },
          { user_id: OTHER },
          { user_id: 'user-third' },
        ],
      },
      { rows: screeningRaw }, // SELF locked, OTHER open → 1 finished
      { rows: [] }, // extraction: nobody started
      { rows: [] }, // rob: nobody started
    );

    const progress = await getSafeProgress(REVIEW_ID);

    expect(progress.screening).toEqual({
      finishedReviewers: 1,
      totalReviewers: 3,
    });
    expect(progress.extraction).toEqual({
      finishedReviewers: 0,
      totalReviewers: 3,
    });
    expect(progress.rob).toEqual({ finishedReviewers: 0, totalReviewers: 3 });
  });

  it('leaks no decision distribution, conflict count, or partner status', async () => {
    primeDb(
      { rows: [{ user_id: SELF }, { user_id: OTHER }] },
      { rows: screeningRaw },
      { rows: extractionRaw },
      { rows: robRaw },
    );

    const progress = await getSafeProgress(REVIEW_ID);

    expect(Object.keys(progress).sort()).toEqual([
      'extraction',
      'rob',
      'screening',
    ]);
    for (const surface of ['screening', 'extraction', 'rob'] as const) {
      expect(Object.keys(progress[surface]).sort()).toEqual([
        'finishedReviewers',
        'totalReviewers',
      ]);
      expect(typeof progress[surface].finishedReviewers).toBe('number');
      expect(typeof progress[surface].totalReviewers).toBe('number');
    }
    // No serialized field anywhere mentions a decision value or partner id.
    const serialized = JSON.stringify(progress);
    expect(serialized).not.toContain('include');
    expect(serialized).not.toContain('exclude');
    expect(serialized).not.toContain(OTHER);
  });
});

describe('phase is read authoritatively from the review, not the caller', () => {
  it('throws a clear error when the review does not exist', async () => {
    primeDb({ rows: [] });
    await expect(getScreeningDecisions(ctx('owner'))).rejects.toThrow(
      /review .* not found/,
    );
  });
});
