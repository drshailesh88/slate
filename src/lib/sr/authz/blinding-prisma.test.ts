/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
// Adversarial coverage for the T17 PRISMA channel (extends the T6 suite): the
// PRISMA flow is an AGGREGATE over every reviewer's screening rows — stage
// counts and per-reason exclusions would leak a co-reviewer's calls — so it
// must never leave the chokepoint during `independent`. Each test PRIMES the DB
// so a co-reviewer's rows are physically present, then proves getPrismaFlow
// withholds everything — with a reconcile-phase positive control (including the
// every-record-accounted-for reconciliation) so no assertion passes vacuously.
// Imports `vitest` (harness owned by T5). Mirrors blinding-conflicts.test.ts.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({ getDb: vi.fn() }));

import { getDb } from '@/lib/db/client';
import {
  BlindedAccessError,
  getPrismaFlow,
  type BlindedContext,
  type ReviewRole,
} from './blinded-read';

const REVIEW_ID = 'review-1';
const SELF = 'user-self';
const OTHER = 'user-other';

function decisionRaw(overrides) {
  return {
    id: 'row',
    review_id: REVIEW_ID,
    study_id: 'st1',
    reviewer_id: SELF,
    stage: 'title_abstract',
    decision: 'include',
    exclude_reason_code: null,
    exclude_reason_detail: null,
    is_ai: false,
    locked_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// A co-reviewer's calls physically present in the DB — including a full-text
// exclusion with a reason (the Item 16b breakdown that must not leak early).
const primedDecisions = [
  decisionRaw({ id: 's1', study_id: 'st1', reviewer_id: SELF }),
  decisionRaw({
    id: 's2',
    study_id: 'st1',
    reviewer_id: OTHER,
    decision: 'exclude',
  }),
  decisionRaw({ id: 's3', study_id: 'st2', reviewer_id: SELF }),
  decisionRaw({ id: 's4', study_id: 'st2', reviewer_id: OTHER }),
  decisionRaw({
    id: 's5',
    study_id: 'st2',
    reviewer_id: SELF,
    stage: 'full_text',
    decision: 'exclude',
    exclude_reason_code: 'wrong_population',
  }),
  decisionRaw({
    id: 's6',
    study_id: 'st2',
    reviewer_id: OTHER,
    stage: 'full_text',
    decision: 'exclude',
    exclude_reason_code: 'wrong_population',
  }),
];

const primedStudies = [
  { id: 'st1', source: 'PubMed', dupe_status: 'unique' },
  { id: 'st2', source: 'PubMed', dupe_status: 'unique' },
  { id: 'st3', source: 'Embase', dupe_status: 'auto_merged' },
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

function reviewRow(phase, mode = 'two_reviewer') {
  return { rows: [{ phase, mode }] };
}

function ctx(role: ReviewRole): BlindedContext {
  return { reviewId: REVIEW_ID, requesterId: SELF, role };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getPrismaFlow — the reconcile gate', () => {
  it('withholds the whole flow during independent for EVERY role', async () => {
    for (const role of ROLES) {
      // Even with a co-reviewer's rows primed, only the phase/mode read may
      // happen before it throws — no decision, study, or resolution row is
      // ever fetched.
      const execute = primeDb(
        reviewRow('independent'),
        { rows: primedDecisions },
        { rows: primedStudies },
        { rows: [] },
      );
      await expect(getPrismaFlow(ctx(role))).rejects.toBeInstanceOf(
        BlindedAccessError,
      );
      expect(execute).toHaveBeenCalledTimes(1);
    }
  });

  it('still withholds the flow for a viewer at reconcile', async () => {
    primeDb(
      reviewRow('reconcile'),
      { rows: primedDecisions },
      { rows: primedStudies },
      { rows: [] },
    );
    await expect(getPrismaFlow(ctx('viewer'))).rejects.toBeInstanceOf(
      BlindedAccessError,
    );
  });

  it('reveals the reconciling flow at reconcile for a full-visibility role (positive control)', async () => {
    primeDb(
      reviewRow('reconcile'),
      { rows: primedDecisions },
      { rows: primedStudies },
      { rows: [] },
    );
    const flow = await getPrismaFlow(ctx('owner'));

    // Real numbers over the primed data — nothing vacuous.
    expect(flow.identification.identified).toBe(3);
    expect(flow.identification.duplicatesRemoved).toBe(1);
    expect(flow.screening.screened).toBe(2);
    // st1 is an unresolved include/exclude opposition → in progress.
    expect(flow.screening.inProgress).toBe(1);
    expect(flow.screening.advanced).toBe(1);
    // st2 was excluded at full text with a recorded reason (Item 16b).
    expect(flow.eligibility.excluded).toBe(1);
    expect(flow.eligibility.exclusionReasons).toEqual([
      { code: 'wrong_population', count: 1, studyIds: ['st2'] },
    ]);

    // Every record accounted for: in = out + excluded at every stage.
    expect(flow.identification.identified).toBe(
      flow.identification.duplicatesRemoved + flow.screening.screened,
    );
    expect(flow.screening.screened).toBe(
      flow.screening.excluded +
        flow.screening.inProgress +
        flow.screening.advanced,
    );
    expect(flow.eligibility.assessed).toBe(
      flow.eligibility.excluded +
        flow.eligibility.inProgress +
        flow.included.studies,
    );
  });

  it('applies a recorded conflict resolution at reconcile', async () => {
    primeDb(
      reviewRow('reconcile'),
      { rows: primedDecisions },
      { rows: primedStudies },
      {
        rows: [
          {
            study_id: 'st1',
            stage: 'title_abstract',
            method: 'align_on_one',
            decision: 'exclude',
          },
        ],
      },
    );
    const flow = await getPrismaFlow(ctx('owner'));
    expect(flow.screening.inProgress).toBe(0);
    expect(flow.screening.excluded).toBe(1);
  });

  it('honours the review mode: one human + the AI decides in ai_co_reviewer', async () => {
    primeDb(
      reviewRow('reconcile', 'ai_co_reviewer'),
      {
        rows: [
          decisionRaw({ id: 'a1', study_id: 'st1', reviewer_id: SELF }),
          decisionRaw({
            id: 'a2',
            study_id: 'st1',
            reviewer_id: 'ai-user',
            is_ai: true,
          }),
        ],
      },
      { rows: [{ id: 'st1', source: 'PubMed', dupe_status: 'unique' }] },
      { rows: [] },
    );
    const flow = await getPrismaFlow(ctx('owner'));
    expect(flow.screening.advanced).toBe(1);
  });
});
