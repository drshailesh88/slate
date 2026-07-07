import { beforeEach, describe, expect, it, vi } from 'vitest';
import { aiValidations } from '@/lib/db/schema/sr';

// ─────────────────────────────────────────────────────────────────────────────
// Recall-validation GATE tests (mocked LLM). We fake the DB at getDb() and
// capture the `ai_validations` row that gets written. The CONTRACT:
//   • recall on includes drives pass/fail against the target (default 95%);
//   • the outcome is recorded (model, version, recall, sample size, passed);
//   • a perfect-recall model passes; a model that misses an include fails;
//   • an empty sample / a sample with no includes is refused (can't validate).
// ─────────────────────────────────────────────────────────────────────────────

type Captured = { table: unknown; values: Record<string, unknown> };
let inserted: Captured[];
let selectRows: Record<string, unknown>[];

function makeDb() {
  let insertTable: unknown = null;
  const chain: Record<string, unknown> = {
    insert: (t: unknown) => {
      insertTable = t;
      return chain;
    },
    values: (data: Record<string, unknown>) => {
      inserted.push({ table: insertTable, values: data });
      return chain;
    },
    returning: () => Promise.resolve([{ id: 'validation-1' }]),
    select: () => chain,
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => Promise.resolve(selectRows),
  };
  return chain;
}

vi.mock('@/lib/db/client', () => ({ getDb: () => makeDb() }));

import { createDeterministicScreeningModel } from './mock-model';
import {
  AiValidationEmptySampleError,
  AiValidationNoIncludesError,
} from './errors';
import {
  hasPassingValidation,
  runRecallValidation,
  type LabeledSampleRecord,
} from './validation';
import type { AiDecision } from './types';

const REVIEW = 'review-1';

function sampleRecord(
  studyId: string,
  humanLabel: AiDecision,
): LabeledSampleRecord {
  return {
    humanLabel,
    input: {
      studyId,
      title: `Study ${studyId}`,
      abstract: null,
      researchQuestion: 'Does X work for Y?',
      criteria: [],
    },
  };
}

beforeEach(() => {
  inserted = [];
  selectRows = [];
});

describe('runRecallValidation', () => {
  it('passes and records ai_validations when the model recalls every include', async () => {
    // Force perfect recall: both includes get an `include` verdict.
    const model = createDeterministicScreeningModel({
      model: 'mock-x',
      version: 'v9',
      verdicts: {
        s1: { decision: 'include', reasoning: 'r' },
        s2: { decision: 'include', reasoning: 'r' },
        s3: { decision: 'exclude', reasoning: 'r' },
      },
    });

    const result = await runRecallValidation({
      reviewId: REVIEW,
      model,
      sample: [
        sampleRecord('s1', 'include'),
        sampleRecord('s2', 'include'),
        sampleRecord('s3', 'exclude'),
      ],
    });

    expect(result.passed).toBe(true);
    expect(result.recall).toBe(1);
    expect(result.sampleSize).toBe(3);
    expect(result.includeCount).toBe(2);

    const row = inserted.find((i) => i.table === aiValidations);
    expect(row).toBeDefined();
    expect(row?.values.passed).toBe(true);
    expect(row?.values.model).toBe('mock-x');
    expect(row?.values.version).toBe('v9');
    expect(row?.values.recallOnIncludes).toBe(1);
    expect(row?.values.sampleSize).toBe(3);
    expect(typeof row?.values.prompt).toBe('string');
  });

  it('FAILS (and records passed=false) when the model misses a true include', async () => {
    // A `maybe` counts as caught; an `exclude` on a true include is the miss.
    const model = createDeterministicScreeningModel({
      verdicts: {
        s1: { decision: 'include', reasoning: 'r' },
        s2: { decision: 'exclude', reasoning: 'r' }, // misses a real include
      },
    });

    const result = await runRecallValidation({
      reviewId: REVIEW,
      model,
      target: 0.95,
      sample: [sampleRecord('s1', 'include'), sampleRecord('s2', 'include')],
    });

    expect(result.recall).toBe(0.5);
    expect(result.passed).toBe(false);
    const row = inserted.find((i) => i.table === aiValidations);
    expect(row?.values.passed).toBe(false);
  });

  it('a `maybe` on an include does NOT count as a miss (kept in the pool)', async () => {
    const model = createDeterministicScreeningModel({
      verdicts: {
        s1: { decision: 'include', reasoning: 'r' },
        s2: { decision: 'maybe', reasoning: 'r' },
      },
    });
    const result = await runRecallValidation({
      reviewId: REVIEW,
      model,
      sample: [sampleRecord('s1', 'include'), sampleRecord('s2', 'include')],
    });
    expect(result.recall).toBe(1);
    expect(result.passed).toBe(true);
  });

  it('refuses an empty sample', async () => {
    const model = createDeterministicScreeningModel();
    await expect(
      runRecallValidation({ reviewId: REVIEW, model, sample: [] }),
    ).rejects.toBeInstanceOf(AiValidationEmptySampleError);
    expect(inserted).toHaveLength(0);
  });

  it('refuses a sample with no human includes (recall undefined)', async () => {
    const model = createDeterministicScreeningModel();
    await expect(
      runRecallValidation({
        reviewId: REVIEW,
        model,
        sample: [sampleRecord('s1', 'exclude'), sampleRecord('s2', 'maybe')],
      }),
    ).rejects.toBeInstanceOf(AiValidationNoIncludesError);
    expect(inserted).toHaveLength(0);
  });
});

describe('hasPassingValidation', () => {
  it('is true when a passing row exists', async () => {
    selectRows = [{ id: 'v1' }];
    expect(await hasPassingValidation(REVIEW)).toBe(true);
  });

  it('is false when none exists', async () => {
    selectRows = [];
    expect(await hasPassingValidation(REVIEW)).toBe(false);
  });
});
