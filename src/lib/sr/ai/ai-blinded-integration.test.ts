import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// AI-VERDICT BLINDING — end-to-end through the REAL chokepoint.
//
// The AI is blinded EXACTLY like a human: its verdict is written as an ordinary
// (is_ai=true) row and read back only through the blinding chokepoint. Because
// the chokepoint filters to `reviewerId === requesterId` during independent, and
// the AI's synthetic reviewer id never equals a human's, the AI's verdict is
// hidden from every human during independent and appears only at reconcile — the
// same rule that hides a co-reviewer (FOUNDATION §8: "AI verdict blinded during
// independent, revealed at reconcile, as one more reviewer").
//
// We attack THROUGH the chokepoint's public API (getScreeningDecisions), the way
// every real caller is forced to, with the DB faked at getDb().
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('@/lib/db/client', () => ({ getDb: vi.fn() }));

import { getDb } from '@/lib/db/client';
import {
  getScreeningDecisions,
  type BlindedContext,
} from '@/lib/sr/authz/blinded-read';

const REVIEW = 'review-1';
const HUMAN = 'human-reviewer';
const AI_USER = 'system-ai-reviewer';
const AI_SECRET_REASON = 'AI_SAYS_EXCLUDE_WRONG_POPULATION';

// The definer function returns EVERY row for the review; blinding is entirely the
// chokepoint's job. One human row (self) + one AI row (the verdict under test).
const rawRows = [
  {
    id: 'd-human',
    review_id: REVIEW,
    study_id: 'st1',
    reviewer_id: HUMAN,
    stage: 'title_abstract',
    decision: 'include',
    exclude_reason_code: null,
    exclude_reason_detail: null,
    is_ai: false,
    locked_at: '2026-07-07T00:00:00Z',
  },
  {
    id: 'd-ai',
    review_id: REVIEW,
    study_id: 'st1',
    reviewer_id: AI_USER,
    stage: 'title_abstract',
    decision: 'exclude',
    exclude_reason_code: 'ai_ineligible',
    exclude_reason_detail: AI_SECRET_REASON,
    is_ai: true,
    locked_at: '2026-07-07T00:00:00Z',
  },
];

function primeDb(...responses: Array<{ rows: unknown[] }>) {
  const execute = vi.fn();
  for (const r of responses) execute.mockResolvedValueOnce(r);
  (getDb as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ execute });
  return execute;
}

function ctx(
  role: BlindedContext['role'],
  requesterId: string,
): BlindedContext {
  return { reviewId: REVIEW, requesterId, role };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AI verdict is blinded during independent', () => {
  it('a human reviewer does NOT see the AI verdict (nor its reasoning) while independent', async () => {
    primeDb({ rows: [{ phase: 'independent' }] }, { rows: rawRows });
    const rows = await getScreeningDecisions(ctx('reviewer', HUMAN));
    // The human sees only their own row; the AI row is filtered out.
    expect(rows.every((r) => r.reviewerId === HUMAN)).toBe(true);
    expect(rows.some((r) => r.isAi)).toBe(false);
    expect(JSON.stringify(rows)).not.toContain(AI_SECRET_REASON);
  });

  it('the owner gets no peek at the AI verdict during independent either', async () => {
    primeDb({ rows: [{ phase: 'independent' }] }, { rows: rawRows });
    const rows = await getScreeningDecisions(ctx('owner', 'some-owner'));
    // Owner is own-only during independent, so no AI row (owner authored none).
    expect(rows.some((r) => r.isAi)).toBe(false);
    expect(JSON.stringify(rows)).not.toContain(AI_SECRET_REASON);
  });
});

describe('AI verdict is revealed at reconcile — as one more reviewer', () => {
  it('at reconcile the AI row and its reasoning become visible', async () => {
    primeDb({ rows: [{ phase: 'reconcile' }] }, { rows: rawRows });
    const rows = await getScreeningDecisions(ctx('owner', 'some-owner'));
    const aiRow = rows.find((r) => r.isAi);
    expect(aiRow).toBeDefined();
    expect(aiRow?.reviewerId).toBe(AI_USER);
    expect(aiRow?.decision).toBe('exclude');
    expect(aiRow?.excludeReasonDetail).toBe(AI_SECRET_REASON);
  });
});
