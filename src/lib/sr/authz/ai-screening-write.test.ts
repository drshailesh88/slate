import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screeningDecisions } from '@/lib/db/schema';
import { studies } from '@/lib/db/schema/sr';

// ─────────────────────────────────────────────────────────────────────────────
// AI screening writer tests. We fake the DB at the getDb() boundary and record
// every write operation + its target table. The CONTRACT under test:
//   • the AI's verdicts are inserted as `is_ai = true` rows;
//   • a re-cast first DELETES the AI's own prior rows (idempotent + reversible);
//   • the writer NEVER touches any table except `screening_decisions` — it has no
//     path to exclude/remove a study (never-autonomous, FOUNDATION §8).
// ─────────────────────────────────────────────────────────────────────────────

type Op = { kind: 'insert' | 'delete'; table: unknown; values?: unknown };

let ops: Op[];

function makeDb() {
  let current: Op | null = null;
  const chain: Record<string, unknown> = {
    insert: (t: unknown) => {
      current = { kind: 'insert', table: t };
      ops.push(current);
      return chain;
    },
    delete: (t: unknown) => {
      current = { kind: 'delete', table: t };
      ops.push(current);
      return chain;
    },
    values: (data: unknown) => {
      if (current) current.values = data;
      return Promise.resolve(undefined);
    },
    where: () => Promise.resolve(undefined),
  };
  return chain;
}

vi.mock('@/lib/db/client', () => ({ getDb: () => makeDb() }));

import {
  castAiScreeningDecisions,
  retractAiScreeningDecisions,
} from './ai-screening-write';

const REVIEW = 'review-1';
const AI = 'ai-user-1';
const NOW = new Date('2026-07-07T00:00:00Z');

beforeEach(() => {
  ops = [];
});

describe('castAiScreeningDecisions', () => {
  it('inserts each verdict as an is_ai=true row with the AI reviewer id', async () => {
    const result = await castAiScreeningDecisions({
      reviewId: REVIEW,
      stage: 'title_abstract',
      aiReviewerId: AI,
      now: NOW,
      rows: [
        { studyId: 'st1', decision: 'include' },
        {
          studyId: 'st2',
          decision: 'exclude',
          excludeReasonDetail: 'off-topic',
        },
      ],
    });

    expect(result.cast).toBe(2);
    const insert = ops.find((o) => o.kind === 'insert');
    expect(insert?.table).toBe(screeningDecisions);
    const values = insert?.values as Array<Record<string, unknown>>;
    expect(values).toHaveLength(2);
    for (const v of values) {
      expect(v.isAi).toBe(true);
      expect(v.reviewerId).toBe(AI);
      expect(v.reviewId).toBe(REVIEW);
      expect(v.stage).toBe('title_abstract');
      expect(v.lockedAt).toBe(NOW);
    }
    expect(values[1].decision).toBe('exclude');
    expect(values[1].excludeReasonDetail).toBe('off-topic');
  });

  it('DELETES the AI prior rows before inserting (idempotent, reversible re-cast)', async () => {
    await castAiScreeningDecisions({
      reviewId: REVIEW,
      stage: 'title_abstract',
      aiReviewerId: AI,
      rows: [{ studyId: 'st1', decision: 'maybe' }],
    });

    const deleteIdx = ops.findIndex((o) => o.kind === 'delete');
    const insertIdx = ops.findIndex((o) => o.kind === 'insert');
    expect(deleteIdx).toBeGreaterThanOrEqual(0);
    expect(insertIdx).toBeGreaterThan(deleteIdx); // delete precedes insert
  });

  it('NEVER touches any table other than screening_decisions (never-autonomous)', async () => {
    await castAiScreeningDecisions({
      reviewId: REVIEW,
      stage: 'title_abstract',
      aiReviewerId: AI,
      rows: [{ studyId: 'st1', decision: 'exclude' }],
    });

    // Not a single op targets `studies` (or anything but screening_decisions):
    // the AI cannot remove/exclude a record.
    for (const op of ops) {
      expect(op.table).toBe(screeningDecisions);
      expect(op.table).not.toBe(studies);
    }
  });

  it('is a no-op for an empty verdict set', async () => {
    const result = await castAiScreeningDecisions({
      reviewId: REVIEW,
      stage: 'title_abstract',
      aiReviewerId: AI,
      rows: [],
    });
    expect(result.cast).toBe(0);
    expect(ops).toHaveLength(0);
  });
});

describe('retractAiScreeningDecisions', () => {
  it('deletes the AI own rows only (reversible auto-flag)', async () => {
    await retractAiScreeningDecisions({
      reviewId: REVIEW,
      stage: 'title_abstract',
      aiReviewerId: AI,
    });
    expect(ops).toHaveLength(1);
    expect(ops[0].kind).toBe('delete');
    expect(ops[0].table).toBe(screeningDecisions);
  });
});
