import { beforeEach, describe, expect, it, vi } from 'vitest';

// The seam reads through the REAL blinding chokepoint (blinded-read.ts), so this
// exercises the full stack: phase-gated chokepoint + the seam's own+non-AI
// filter. We mock only the DB (as the T6 adversarial suite does) and prove that,
// during `independent`, neither a co-reviewer's nor the AI reviewer's RoB
// judgement can reach the screen through this seam.
vi.mock('@/lib/db/client', () => ({ getDb: vi.fn() }));

import { getDb } from '@/lib/db/client';
import type { BlindedContext, ReviewRole } from '@/lib/sr/authz/blinded-read';
import { getOwnRobJudgements, hasFinishedRob } from './own-assessments';

const REVIEW_ID = 'review-1';
const SELF = 'user-self';
const OTHER = 'user-other';
const AI = 'system-ai';
const LOCKED = '2026-01-01T00:00:00Z';

const SECRET_PARTNER_QUOTE = 'SECRET_PARTNER_ROB_QUOTE';
const SECRET_AI_QUOTE = 'SECRET_AI_SUGGESTION_QUOTE';

const robRaw = [
  {
    id: 'b1',
    review_id: REVIEW_ID,
    study_id: 'st1',
    reviewer_id: SELF,
    domain: 'randomisation',
    judgement: 'low',
    support_quote: 'Central computer randomisation.',
    is_ai: false,
    locked_at: LOCKED,
  },
  {
    id: 'b2',
    review_id: REVIEW_ID,
    study_id: 'st1',
    reviewer_id: OTHER,
    domain: 'randomisation',
    judgement: 'high',
    support_quote: SECRET_PARTNER_QUOTE,
    is_ai: false,
    locked_at: null,
  },
  {
    id: 'b3',
    review_id: REVIEW_ID,
    study_id: 'st1',
    reviewer_id: AI,
    domain: 'randomisation',
    judgement: 'some',
    support_quote: SECRET_AI_QUOTE,
    is_ai: true,
    locked_at: LOCKED,
  },
];

function primeDb(...responses: Array<{ rows: unknown[] }>) {
  const execute = vi.fn();
  for (const r of responses) execute.mockResolvedValueOnce(r);
  (getDb as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ execute });
  return execute;
}

function ctx(role: ReviewRole = 'reviewer'): BlindedContext {
  return { reviewId: REVIEW_ID, requesterId: SELF, role };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getOwnRobJudgements — the independent RoB seam is own + non-AI only', () => {
  it('returns only the caller own judgement during independent', async () => {
    primeDb({ rows: [{ phase: 'independent' }] }, { rows: robRaw });
    const out = await getOwnRobJudgements(ctx('reviewer'));

    expect(out).toHaveLength(1);
    expect(out[0].judgement).toBe('low');
    expect(out[0].domainId).toBe('randomisation');
  });

  it('never surfaces the co-reviewer judgement or its secret quote', async () => {
    primeDb({ rows: [{ phase: 'independent' }] }, { rows: robRaw });
    const out = await getOwnRobJudgements(ctx('reviewer'));

    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain(SECRET_PARTNER_QUOTE);
    expect(serialized).not.toContain(OTHER);
    expect(serialized).not.toContain('high');
  });

  it('never surfaces the AI reviewer suggestion during independent (no anchoring)', async () => {
    primeDb({ rows: [{ phase: 'independent' }] }, { rows: robRaw });
    const out = await getOwnRobJudgements(ctx('reviewer'));

    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain(SECRET_AI_QUOTE);
    expect(out.some((j) => j.judgement === 'some')).toBe(false);
  });

  it('owner and arbitrator get no privileged peek — own-only during independent', async () => {
    for (const role of ['owner', 'arbitrator'] as const) {
      primeDb({ rows: [{ phase: 'independent' }] }, { rows: robRaw });
      const out = await getOwnRobJudgements(ctx(role));
      expect(JSON.stringify(out)).not.toContain(SECRET_PARTNER_QUOTE);
      expect(JSON.stringify(out)).not.toContain(SECRET_AI_QUOTE);
    }
  });

  it('even at reconcile the OWN seam stays own + non-AI (the reveal is a separate read)', async () => {
    // Chokepoint returns all rows at reconcile; the seam still filters to own.
    primeDb({ rows: [{ phase: 'reconcile' }] }, { rows: robRaw });
    const out = await getOwnRobJudgements(ctx('reviewer'));
    expect(out).toHaveLength(1);
    expect(out[0].judgement).toBe('low');
  });
});

describe('hasFinishedRob', () => {
  it('is false with no judgements', () => {
    expect(hasFinishedRob([])).toBe(false);
  });

  it('is false while any judgement is unlocked', () => {
    expect(
      hasFinishedRob([
        {
          studyId: 's',
          domainId: 'd1',
          judgement: 'low',
          supportQuote: 'q',
          locked: true,
        },
        {
          studyId: 's',
          domainId: 'd2',
          judgement: 'some',
          supportQuote: 'q',
          locked: false,
        },
      ]),
    ).toBe(false);
  });

  it('is true once every judgement is locked', () => {
    expect(
      hasFinishedRob([
        {
          studyId: 's',
          domainId: 'd1',
          judgement: 'low',
          supportQuote: 'q',
          locked: true,
        },
      ]),
    ).toBe(true);
  });
});
