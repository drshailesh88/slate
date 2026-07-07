import { beforeEach, describe, expect, it, vi } from 'vitest';
import { users } from '@/lib/db/schema';
import { reviewMembers, reviews, studies } from '@/lib/db/schema/sr';

// ─────────────────────────────────────────────────────────────────────────────
// AI ORCHESTRATOR SAFEGUARD SUITE (mocked LLM). Every non-negotiable safeguard
// (FOUNDATION-auth-tenancy.md §8–9) is a test here:
//   • the AI cannot cast a decision without a passing recall validation (GATE);
//   • it never auto-excludes — it only casts blinded verdicts via the writer;
//   • the phase-1 switch: silent_hold runs during independent; defer_to_phase2
//     is a no-op until reconcile (flip lives in ONE place);
//   • coverage-preserving: the AI is a synthetic user, never a review_members row;
//   • no relevance score (and no verdict distribution) is ever returned.
//
// getDb() is faked for the VISIBLE reads/writes (reviews, studies, users); the
// blinded write (castAiScreeningDecisions) and the gate (hasPassingValidation)
// are mocked so we assert the ORCHESTRATION contract, not their internals.
// ─────────────────────────────────────────────────────────────────────────────

let reviewRow: Record<string, unknown> | null;
let studyRows: Record<string, unknown>[];
let insertedTables: unknown[];

function makeDb() {
  let table: unknown = null;
  let op: 'select' | 'insert' | null = null;
  function resolveSelect(): Record<string, unknown>[] {
    if (table === reviews) return reviewRow ? [reviewRow] : [];
    if (table === studies) return studyRows;
    return [];
  }
  const chain: Record<string, unknown> = {
    select: () => {
      op = 'select';
      return chain;
    },
    from: (t: unknown) => {
      table = t;
      return chain;
    },
    insert: (t: unknown) => {
      op = 'insert';
      table = t;
      insertedTables.push(t);
      return chain;
    },
    values: () => chain,
    onConflictDoUpdate: () => chain,
    onConflictDoNothing: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(resolveSelect()),
    returning: () => Promise.resolve([{ id: 'ai-user-1' }]),
    then: (
      resolve: (v: unknown) => unknown,
      reject?: (e: unknown) => unknown,
    ) => {
      const value = op === 'select' ? resolveSelect() : [];
      return Promise.resolve(value).then(resolve, reject);
    },
  };
  return chain;
}

vi.mock('@/lib/db/client', () => ({ getDb: () => makeDb() }));

const castAiScreeningDecisions = vi.fn().mockResolvedValue({ cast: 0 });
vi.mock('@/lib/sr/authz/ai-screening-write', () => ({
  castAiScreeningDecisions: (args: unknown) => castAiScreeningDecisions(args),
  retractAiScreeningDecisions: vi.fn(),
}));

const hasPassingValidation = vi.fn();
vi.mock('./validation', () => ({
  hasPassingValidation: (id: string) => hasPassingValidation(id),
}));

import { createDeterministicScreeningModel } from './mock-model';
import { AiNotValidatedError } from './errors';
import { runAiScreening } from './screen-reviewer';

const REVIEW = 'review-1';

function setReview(
  overrides: Partial<{
    reviewMode: string;
    screeningPhase: string;
    screeningStage: string;
  }> = {},
) {
  reviewRow = {
    reviewMode: 'two_reviewer',
    screeningPhase: 'independent',
    screeningStage: 'title_abstract',
    ...overrides,
  };
}

function baseArgs(model = createDeterministicScreeningModel()) {
  return {
    reviewId: REVIEW,
    model,
    researchQuestion: 'Does SGLT2i help HFpEF?',
    criteria: ['adults with HFpEF', 'randomized trial'],
  };
}

beforeEach(() => {
  reviewRow = null;
  studyRows = [
    {
      id: 'st1',
      title: 'A',
      abstract: null,
      authors: null,
      journal: null,
      year: null,
    },
    {
      id: 'st2',
      title: 'B',
      abstract: null,
      authors: null,
      journal: null,
      year: null,
    },
  ];
  insertedTables = [];
  castAiScreeningDecisions.mockClear().mockResolvedValue({ cast: 0 });
  hasPassingValidation.mockReset();
});

describe('THE GATE — AI cannot cast without a passing recall validation', () => {
  it('throws AiNotValidatedError and casts NOTHING when unvalidated', async () => {
    setReview();
    hasPassingValidation.mockResolvedValue(false);

    await expect(
      runAiScreening({ ...baseArgs(), phase1Mode: 'silent_hold' }),
    ).rejects.toBeInstanceOf(AiNotValidatedError);

    expect(castAiScreeningDecisions).not.toHaveBeenCalled();
  });

  it('casts once a passing validation exists', async () => {
    setReview();
    hasPassingValidation.mockResolvedValue(true);

    const result = await runAiScreening({
      ...baseArgs(),
      phase1Mode: 'silent_hold',
    });

    expect(result.ran).toBe(true);
    expect(castAiScreeningDecisions).toHaveBeenCalledTimes(1);
    if (result.ran) expect(result.screened).toBe(2);
  });
});

describe('NEVER AUTONOMOUS — the AI only casts blinded verdicts (is_ai)', () => {
  it('routes every verdict through the writer with is_ai stage, never a study mutation', async () => {
    setReview();
    hasPassingValidation.mockResolvedValue(true);
    const model = createDeterministicScreeningModel({
      verdicts: {
        st1: { decision: 'exclude', reasoning: 'wrong population' },
        st2: { decision: 'include', reasoning: 'eligible' },
      },
    });

    await runAiScreening({ ...baseArgs(model), phase1Mode: 'silent_hold' });

    const call = castAiScreeningDecisions.mock.calls[0][0];
    expect(call.stage).toBe('title_abstract');
    expect(call.rows).toHaveLength(2);
    const excludeRow = call.rows.find(
      (r: { studyId: string }) => r.studyId === 'st1',
    );
    expect(excludeRow.decision).toBe('exclude');
    expect(excludeRow.excludeReasonCode).toBe('ai_ineligible');
    expect(excludeRow.excludeReasonDetail).toBe('wrong population');
    // The include carries no exclude reason.
    const includeRow = call.rows.find(
      (r: { studyId: string }) => r.studyId === 'st2',
    );
    expect(includeRow.excludeReasonCode).toBeNull();

    // The orchestrator never wrote to the studies table (no exclusion/removal).
    expect(insertedTables).not.toContain(studies);
  });
});

describe('PHASE-1 SWITCH — one place, silent_hold default', () => {
  it('silent_hold: the AI runs during independent (verdict held/blinded)', async () => {
    setReview({ screeningPhase: 'independent' });
    hasPassingValidation.mockResolvedValue(true);
    const result = await runAiScreening({
      ...baseArgs(),
      phase1Mode: 'silent_hold',
    });
    expect(result.ran).toBe(true);
    expect(castAiScreeningDecisions).toHaveBeenCalled();
  });

  it('defer_to_phase2: the AI is a NO-OP during independent (no gate call, no cast)', async () => {
    setReview({ screeningPhase: 'independent' });
    const result = await runAiScreening({
      ...baseArgs(),
      phase1Mode: 'defer_to_phase2',
    });
    expect(result.ran).toBe(false);
    if (!result.ran) expect(result.reason).toBe('phase_deferred');
    expect(castAiScreeningDecisions).not.toHaveBeenCalled();
    expect(hasPassingValidation).not.toHaveBeenCalled();
  });

  it('defer_to_phase2: the AI DOES run at reconcile (both modes run at reconcile)', async () => {
    setReview({ screeningPhase: 'reconcile' });
    hasPassingValidation.mockResolvedValue(true);
    const result = await runAiScreening({
      ...baseArgs(),
      phase1Mode: 'defer_to_phase2',
    });
    expect(result.ran).toBe(true);
    expect(castAiScreeningDecisions).toHaveBeenCalled();
  });
});

describe('COVERAGE-PRESERVING — AI is a synthetic user, never a review member', () => {
  it('ensures a users row but NEVER a review_members row', async () => {
    setReview();
    hasPassingValidation.mockResolvedValue(true);
    await runAiScreening({ ...baseArgs(), phase1Mode: 'silent_hold' });
    expect(insertedTables).toContain(users);
    expect(insertedTables).not.toContain(reviewMembers);
  });
});

describe('SCORE-HIDDEN — the run result carries no score or distribution', () => {
  it('returns completion count only — no score, no per-decision distribution', async () => {
    setReview();
    hasPassingValidation.mockResolvedValue(true);
    const result = await runAiScreening({
      ...baseArgs(),
      phase1Mode: 'silent_hold',
    });
    const keys = Object.keys(result);
    expect(keys).not.toContain('score');
    expect(keys).not.toContain('verdicts');
    expect(keys).not.toContain('decisions');
    expect(keys).not.toContain('distribution');
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('score');
  });
});
