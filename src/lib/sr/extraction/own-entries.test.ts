// ─────────────────────────────────────────────────────────────────────────────
// EXTRACTION SCREEN SIDE-CHANNEL TEST (T15 · part of the T6 gate for this ★
// screen). It attacks the extraction screen's Phase-1 read seam
// (getOwnExtractionEntries) THROUGH the real blinding chokepoint: it primes the
// DB so a co-reviewer's value AND the AI's value are physically present in the
// rows the definer function returns, then proves neither can reach the screen
// during `independent`. The firewall: no partner/AI data before both lock.
// ─────────────────────────────────────────────────────────────────────────────
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({ getDb: vi.fn() }));

import { getDb } from '@/lib/db/client';
import type { ReviewRole } from '@/lib/sr/authz/blinded-read';
import { getOwnExtractionEntries, hasFinishedExtraction } from './own-entries';

const REVIEW_ID = 'review-1';
const SELF = 'user-self';
const OTHER = 'user-other';
const AI = 'user-ai';

const SECRET_PARTNER_VALUE = 'SECRET_PARTNER_VALUE_42';
const SECRET_AI_VALUE = 'SECRET_AI_VALUE_99';

// The definer function returns EVERY row for the review — self, partner, and AI.
// Blinding is the chokepoint's job; that is exactly what we attack.
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
  {
    id: 'e3',
    review_id: REVIEW_ID,
    study_id: 'st1',
    field_id: 'sample_size',
    reviewer_id: AI,
    value: SECRET_AI_VALUE,
    state: 'reported',
    derived: false,
    derived_formula: null,
    provenance: { reportId: 'rep1', page: '4', sourceQuote: 'AI passage' },
    is_ai: true,
    locked_at: null,
  },
];

const AUTHORING_ROLES: ReviewRole[] = [
  'owner',
  'collaborator',
  'reviewer',
  'arbitrator',
];

function primeDb(...responses: Array<{ rows: unknown[] }>) {
  const execute = vi.fn();
  for (const r of responses) execute.mockResolvedValueOnce(r);
  (getDb as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ execute });
  return execute;
}

function ctx(role: ReviewRole, requesterId = SELF) {
  return { reviewId: REVIEW_ID, requesterId, role };
}

function expectNoLeak(value: unknown) {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toContain(SECRET_PARTNER_VALUE);
  expect(serialized).not.toContain(SECRET_AI_VALUE);
  expect(serialized).not.toContain(OTHER);
  expect(serialized).not.toContain(AI);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('the firewall — no partner or AI value reaches the screen during independent', () => {
  for (const role of AUTHORING_ROLES) {
    it(`role=${role} sees ONLY own non-AI entries`, async () => {
      primeDb({ rows: [{ phase: 'independent' }] }, { rows: extractionRaw });
      const entries = await getOwnExtractionEntries(ctx(role));
      expect(entries).toHaveLength(1);
      expect(entries[0].value).toBe('120');
      expectNoLeak(entries);
    });
  }

  it('the AI value never reaches the screen during independent (non-neg #5)', async () => {
    primeDb({ rows: [{ phase: 'independent' }] }, { rows: extractionRaw });
    const entries = await getOwnExtractionEntries(ctx('reviewer'));
    // Even the caller's own set contains no AI-authored row.
    expect(entries.every((e) => e.value !== SECRET_AI_VALUE)).toBe(true);
  });
});

describe('positive control — the seam stays own-only even at reconcile', () => {
  // The chokepoint returns ALL rows at reconcile, but THIS Phase-1 seam still
  // filters to own + non-AI. Reconciliation is a different render path.
  it('own-only filter holds even when the chokepoint hands back every row', async () => {
    primeDb({ rows: [{ phase: 'reconcile' }] }, { rows: extractionRaw });
    const entries = await getOwnExtractionEntries(ctx('owner'));
    expect(entries).toHaveLength(1);
    expect(entries[0].value).toBe('120');
    expectNoLeak(entries);
  });
});

describe('hasFinishedExtraction — the lock signal', () => {
  it('is false until every own entry is locked', () => {
    expect(
      hasFinishedExtraction([
        {
          studyId: 's',
          fieldId: 'f',
          value: '1',
          state: 'reported',
          derived: false,
          derivedFormula: null,
          provenance: null,
          locked: true,
        },
        {
          studyId: 's',
          fieldId: 'g',
          value: '2',
          state: 'reported',
          derived: false,
          derivedFormula: null,
          provenance: null,
          locked: false,
        },
      ]),
    ).toBe(false);
  });
  it('is true once all locked (and there is at least one)', () => {
    expect(
      hasFinishedExtraction([
        {
          studyId: 's',
          fieldId: 'f',
          value: '1',
          state: 'reported',
          derived: false,
          derivedFormula: null,
          provenance: null,
          locked: true,
        },
      ]),
    ).toBe(true);
  });
  it('is false with no entries', () => {
    expect(hasFinishedExtraction([])).toBe(false);
  });
});
