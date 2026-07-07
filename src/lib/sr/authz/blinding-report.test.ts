/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
// Adversarial coverage for the T18 report channel (extends the T6 suite): the
// report's included/excluded counts and RoB roll-ups are AGGREGATES over every
// reviewer's blinded rows, so they must never leave the chokepoint during
// `independent`. Each test PRIMES the DB so a co-reviewer's decisive rows are
// physically present, then proves the report aggregate withholds them — with a
// reconcile-phase positive control so no assertion passes vacuously.
// Mirrors blinding-conflicts.test.ts.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({ getDb: vi.fn() }));

import { getDb } from '@/lib/db/client';
import {
  BlindedAccessError,
  getReportRobOutcomes,
  getReportScreeningOutcomes,
  type BlindedContext,
  type ReviewRole,
} from './blinded-read';

const REVIEW_ID = 'review-1';
const SELF = 'user-self';
const OTHER = 'user-other';

// Two agreeing includes on st1 and two agreeing excludes on st2 — exactly the
// rows that produce a non-zero included/excluded count if they escape.
const decisiveScreeningRaw = [
  screeningRow('s1', 'st1', SELF, 'include', null),
  screeningRow('s2', 'st1', OTHER, 'include', null),
  screeningRow('s3', 'st2', SELF, 'exclude', 'wrong_population'),
  screeningRow('s4', 'st2', OTHER, 'exclude', 'wrong_population'),
];

function screeningRow(id, studyId, reviewerId, decision, reason) {
  return {
    id,
    review_id: REVIEW_ID,
    study_id: studyId,
    reviewer_id: reviewerId,
    stage: 'title_abstract',
    decision,
    exclude_reason_code: reason,
    exclude_reason_detail: null,
    is_ai: false,
    locked_at: '2026-01-01T00:00:00Z',
  };
}

const robRaw = [
  robRow('r1', 'st1', SELF, 'randomisation', 'low'),
  robRow('r2', 'st1', OTHER, 'randomisation', 'high'),
];

function robRow(id, studyId, reviewerId, domain, judgement) {
  return {
    id,
    review_id: REVIEW_ID,
    study_id: studyId,
    reviewer_id: reviewerId,
    domain,
    judgement,
    support_quote: 'quote',
    is_ai: false,
    locked_at: '2026-01-01T00:00:00Z',
  };
}

const poolRows = [
  { id: 'st1', rob_instrument: 'rob2' },
  { id: 'st2', rob_instrument: 'rob2' },
];

const ROLES: ReviewRole[] = [
  'owner',
  'collaborator',
  'reviewer',
  'arbitrator',
  'viewer',
];

function primeDb(...responses) {
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

describe('getReportScreeningOutcomes — the reconcile gate', () => {
  it('withholds the outcome counts during independent for EVERY role', async () => {
    for (const role of ROLES) {
      // Only the phase read may happen before the throw — the decisive rows,
      // resolutions, pool and mode are never fetched.
      const execute = primeDb(
        { rows: [{ phase: 'independent' }] },
        { rows: decisiveScreeningRaw },
      );
      await expect(
        getReportScreeningOutcomes(ctx(role), 'title_abstract'),
      ).rejects.toBeInstanceOf(BlindedAccessError);
      expect(execute).toHaveBeenCalledTimes(1);
    }
  });

  it('still withholds for a viewer at reconcile', async () => {
    primeDb({ rows: [{ phase: 'reconcile' }] });
    await expect(
      getReportScreeningOutcomes(ctx('viewer'), 'title_abstract'),
    ).rejects.toBeInstanceOf(BlindedAccessError);
  });

  it('reveals grounded counts at reconcile (positive control)', async () => {
    primeDb(
      { rows: [{ phase: 'reconcile' }] },
      { rows: decisiveScreeningRaw }, // fetchScreeningRows
      { rows: [] }, // fetchScreeningResolutions
      { rows: poolRows }, // fetchStudyPool
      { rows: [{ review_mode: 'two_reviewer' }] }, // fetchReviewMode
    );
    const result = await getReportScreeningOutcomes(
      ctx('owner'),
      'title_abstract',
    );
    expect(result.includedStudyIds).toEqual(['st1']);
    expect(result.excludedStudyIds).toEqual(['st2']);
    expect(result.excludeReasonCounts).toEqual([
      { code: 'wrong_population', count: 1 },
    ]);
  });
});

describe('getReportRobOutcomes — the reconcile gate', () => {
  it('withholds the RoB roll-up during independent for EVERY role', async () => {
    for (const role of ROLES) {
      const execute = primeDb(
        { rows: [{ phase: 'independent' }] },
        { rows: robRaw },
      );
      await expect(getReportRobOutcomes(ctx(role))).rejects.toBeInstanceOf(
        BlindedAccessError,
      );
      expect(execute).toHaveBeenCalledTimes(1);
    }
  });

  it('still withholds for a viewer at reconcile', async () => {
    primeDb({ rows: [{ phase: 'reconcile' }] });
    await expect(getReportRobOutcomes(ctx('viewer'))).rejects.toBeInstanceOf(
      BlindedAccessError,
    );
  });

  it('reveals the honest roll-up at reconcile (positive control)', async () => {
    primeDb(
      { rows: [{ phase: 'reconcile' }] },
      { rows: robRaw }, // fetchRobRows
      { rows: poolRows }, // fetchStudyPool
    );
    const result = await getReportRobOutcomes(ctx('owner'));
    // The two reviewers disagree on st1 → mixed, never a fabricated consensus;
    // st2 has no appraisal → unassessed.
    expect(result.perStudy).toEqual([
      { studyId: 'st1', overall: 'mixed' },
      { studyId: 'st2', overall: 'unassessed' },
    ]);
    expect(result.distribution.mixed).toBe(1);
    expect(result.distribution.unassessed).toBe(1);
  });
});
