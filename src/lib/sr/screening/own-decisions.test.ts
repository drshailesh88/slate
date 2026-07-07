import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({ getDb: vi.fn() }));

import { getDb } from '@/lib/db/client';
import { BlindedAccessError } from '@/lib/sr/authz/blinded-read';
import { getOwnScreeningDecisions, hasFinishedScreening } from './own-decisions';

// ─────────────────────────────────────────────────────────────────────────────
// SCREEN-SPECIFIC SIDE-CHANNEL SUITE (T12) — the T6 adversarial pattern aimed at
// the screening screen's read seam. Every co-reviewer AND AI row is physically
// present in what the DB hands back; we prove none of it reaches the screen.
//
//   • independent → the reviewer sees only their own calls, never the partner's
//     or the AI's — the chokepoint already filters, and the seam re-filters.
//   • reconcile   → EVEN THOUGH the chokepoint now returns every row (so the
//     Conflicts screen can reconcile), the SCREENING screen seam STILL returns
//     own-only. Reconciliation is a different screen; this one never unmasks.
//   • the AI verdict (isAi row) never surfaces on this screen in any phase.
//
// If any of these leaked, a reviewer would be anchored by a co-reviewer's or the
// AI's call — the exact correlated-error failure blinding exists to prevent.
// ─────────────────────────────────────────────────────────────────────────────

const REVIEW_ID = 'review-1';
const SELF = 'user-self';
const OTHER = 'user-other';
const AI = 'user-ai';

const SECRET_PARTNER_REASON = 'SECRET_PARTNER_EXCLUDE_REASON';
const SECRET_AI_REASON = 'SECRET_AI_VERDICT_REASON';
const SECRETS = [SECRET_PARTNER_REASON, SECRET_AI_REASON, OTHER, AI];

// The definer function returns EVERY row for the review; blinding is the
// chokepoint's + seam's job. Prime the raw set with self, partner, and AI rows.
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
    decision: 'exclude',
    exclude_reason_code: 'wrong_population',
    exclude_reason_detail: SECRET_PARTNER_REASON,
    is_ai: false,
    locked_at: null,
  },
  {
    id: 's3',
    review_id: REVIEW_ID,
    study_id: 'st1',
    reviewer_id: AI,
    stage: 'title_abstract',
    decision: 'exclude',
    exclude_reason_code: 'wrong_intervention',
    exclude_reason_detail: SECRET_AI_REASON,
    is_ai: true,
    locked_at: null,
  },
];

function primeDb(...responses: Array<{ rows: unknown[] }>) {
  const execute = vi.fn();
  for (const r of responses) execute.mockResolvedValueOnce(r);
  (getDb as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ execute });
  return execute;
}

function ctx(role: string, requesterId = SELF) {
  return { reviewId: REVIEW_ID, requesterId, role } as never;
}

function expectNoLeak(value: unknown) {
  const serialized = JSON.stringify(value);
  for (const secret of SECRETS) {
    expect(serialized).not.toContain(secret);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getOwnScreeningDecisions — independent', () => {
  for (const role of ['reviewer', 'collaborator']) {
    it(`role=${role}: returns only the caller own decision, never partner or AI`, async () => {
      primeDb({ rows: [{ phase: 'independent' }] }, { rows: screeningRaw });
      const own = await getOwnScreeningDecisions(ctx(role), 'title_abstract');

      expect(own).toHaveLength(1);
      expect(own[0]).toMatchObject({ studyId: 'st1', decision: 'include' });
      expectNoLeak(own);
    });
  }

  it('a viewer is denied at the chokepoint (own-only surface has nothing for them)', async () => {
    primeDb({ rows: [{ phase: 'independent' }] });
    await expect(
      getOwnScreeningDecisions(ctx('viewer'), 'title_abstract'),
    ).rejects.toBeInstanceOf(BlindedAccessError);
  });
});

describe('getOwnScreeningDecisions — reconcile (screen stays own-only)', () => {
  it('owner at reconcile still gets own-only from THIS screen (no partner, no AI)', async () => {
    // The chokepoint would hand the owner all rows at reconcile; the screen seam
    // must still show own-only — reconciliation belongs to the Conflicts screen.
    primeDb({ rows: [{ phase: 'reconcile' }] }, { rows: screeningRaw });
    const own = await getOwnScreeningDecisions(ctx('owner'), 'title_abstract');

    expect(own.every((d) => d.studyId === 'st1')).toBe(true);
    expect(own).toHaveLength(1);
    expectNoLeak(own);
  });
});

describe('getOwnScreeningDecisions — stage scoping', () => {
  it('does not return a decision authored at a different stage', async () => {
    const fullTextOwn = [
      { ...screeningRaw[0], id: 's4', stage: 'full_text', study_id: 'st9' },
    ];
    primeDb({ rows: [{ phase: 'independent' }] }, { rows: fullTextOwn });
    const own = await getOwnScreeningDecisions(ctx('reviewer'), 'title_abstract');
    expect(own).toHaveLength(0);
  });
});

describe('hasFinishedScreening', () => {
  it('is false with no decisions', () => {
    expect(hasFinishedScreening([])).toBe(false);
  });
  it('is false while any own decision is unlocked', () => {
    expect(
      hasFinishedScreening([
        { studyId: 'a', decision: 'include', excludeReasonCode: null, excludeReasonDetail: null, locked: true },
        { studyId: 'b', decision: 'maybe', excludeReasonCode: null, excludeReasonDetail: null, locked: false },
      ]),
    ).toBe(false);
  });
  it('is true once every own decision is locked', () => {
    expect(
      hasFinishedScreening([
        { studyId: 'a', decision: 'include', excludeReasonCode: null, excludeReasonDetail: null, locked: true },
      ]),
    ).toBe(true);
  });
});
