// Adversarial coverage for the T19 export channel (extends the T6 suite —
// channel 3). An export artifact leaves the app, so the three ForExport readers
// are gated like aggregates: refused during `independent` for EVERY role — even
// the caller's OWN blinded rows are not exportable pre-unblind — and always for
// `viewer`. Each test PRIMES the DB so a co-reviewer's value is physically
// present, then proves the export reader withholds it, with a reconcile-phase
// positive control so no assertion passes vacuously. Mirrors
// blinding-conflicts.test.ts.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({ getDb: vi.fn() }));

import { getDb } from '@/lib/db/client';
import {
  BlindedAccessError,
  getExtractionEntriesForExport,
  getRobAssessmentsForExport,
  getScreeningDecisionsForExport,
  type BlindedContext,
  type ReviewRole,
} from './blinded-read';

const REVIEW_ID = 'review-1';
const SELF = 'user-self';
const OTHER = 'user-other';

const SECRET_PARTNER_DECISION = 'exclude';
const SECRET_PARTNER_VALUE = 'SECRET_PARTNER_VALUE_42';
const SECRET_PARTNER_QUOTE = 'SECRET_SUPPORT_QUOTE_7';

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
    locked_at: null,
  },
  {
    id: 's2',
    review_id: REVIEW_ID,
    study_id: 'st1',
    reviewer_id: OTHER,
    stage: 'title_abstract',
    decision: SECRET_PARTNER_DECISION,
    exclude_reason_code: 'wrong_population',
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
    provenance: { reportId: 'rep1', page: '4' },
    is_ai: false,
    locked_at: null,
  },
  {
    id: 'e2',
    review_id: REVIEW_ID,
    study_id: 'st1',
    field_id: 'sample_size',
    reviewer_id: OTHER,
    value: SECRET_PARTNER_VALUE,
    state: 'reported',
    derived: false,
    derived_formula: null,
    provenance: { reportId: 'rep1', page: '4' },
    is_ai: false,
    locked_at: null,
  },
];

const robRaw = [
  {
    id: 'r1',
    review_id: REVIEW_ID,
    study_id: 'st1',
    reviewer_id: OTHER,
    domain: 'randomisation',
    judgement: 'high',
    support_quote: SECRET_PARTNER_QUOTE,
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

const READERS = [
  {
    name: 'screening',
    read: getScreeningDecisionsForExport,
    raw: screeningRaw,
  },
  {
    name: 'extraction',
    read: getExtractionEntriesForExport,
    raw: extractionRaw,
  },
  { name: 'rob', read: getRobAssessmentsForExport, raw: robRaw },
] as const;

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

describe('the export readers — refused during independent for EVERY role', () => {
  for (const { name, read, raw } of READERS) {
    it(`${name}: no role can export blinded rows during independent (not even own)`, async () => {
      for (const role of ROLES) {
        // Only the phase read may happen before the throw — the primed rows
        // (carrying the co-reviewer's value) are never fetched.
        const execute = primeDb(
          { rows: [{ phase: 'independent' }] },
          { rows: raw },
        );
        await expect(read(ctx(role))).rejects.toBeInstanceOf(
          BlindedAccessError,
        );
        expect(execute).toHaveBeenCalledTimes(1);
      }
    });

    it(`${name}: a viewer is refused even at reconcile`, async () => {
      primeDb({ rows: [{ phase: 'reconcile' }] }, { rows: raw });
      await expect(read(ctx('viewer'))).rejects.toBeInstanceOf(
        BlindedAccessError,
      );
    });
  }
});

describe('positive control — the full dataset resolves at reconcile', () => {
  it('screening export carries every reviewer decision at reconcile', async () => {
    primeDb({ rows: [{ phase: 'reconcile' }] }, { rows: screeningRaw });
    const rows = await getScreeningDecisionsForExport(ctx('owner'));
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.reviewerId).sort()).toEqual([OTHER, SELF].sort());
  });

  it('extraction export preserves value, state, derived and provenance', async () => {
    primeDb({ rows: [{ phase: 'reconcile' }] }, { rows: extractionRaw });
    const rows = await getExtractionEntriesForExport(ctx('owner'));
    expect(rows).toHaveLength(2);
    const partner = rows.find((r) => r.reviewerId === OTHER);
    expect(partner?.value).toBe(SECRET_PARTNER_VALUE);
    expect(partner?.state).toBe('reported');
    expect(partner?.provenance).toEqual({ reportId: 'rep1', page: '4' });
  });

  it('rob export carries the support quote at reconcile', async () => {
    primeDb({ rows: [{ phase: 'reconcile' }] }, { rows: robRaw });
    const rows = await getRobAssessmentsForExport(ctx('owner'));
    expect(rows).toHaveLength(1);
    expect(rows[0].supportQuote).toBe(SECRET_PARTNER_QUOTE);
  });
});
