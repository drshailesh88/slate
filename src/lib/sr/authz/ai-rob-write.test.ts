import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({ getDb: vi.fn() }));

import { getDb } from '@/lib/db/client';
import { suggestAiRobJudgements } from './ai-rob-write';

// ─────────────────────────────────────────────────────────────────────────────
// The AI RoB SUGGESTION writer — the never-autonomous invariant is STRUCTURAL and
// proven behaviourally here:
//   • every row it writes is `is_ai = true` (a labeled suggestion, never a final
//     human judgement);
//   • it only ever INSERTs into the blinded table (upsert) — the fake db exposes
//     NO `delete`/`update`, so any autonomous mutation path would throw;
//   • it writes NOTHING but rob_assessments (it never imports `studies`, so there
//     is no path to mark a study or set a consensus);
//   • no RETURNING (the runtime role cannot SELECT).
// ─────────────────────────────────────────────────────────────────────────────

interface Insert {
  values: Record<string, unknown> | null;
  conflict: Record<string, unknown> | null;
}

function makeAiDb() {
  const inserts: Insert[] = [];
  let returningCalled = false;
  let deleteCalled = false;

  const db = {
    insert() {
      const record: Insert = { values: null, conflict: null };
      inserts.push(record);
      const chain: Record<string, unknown> = {};
      Object.assign(chain, {
        values(v: Record<string, unknown>) {
          record.values = v;
          return chain;
        },
        onConflictDoUpdate(cfg: Record<string, unknown>) {
          record.conflict = cfg;
          return chain;
        },
        returning() {
          returningCalled = true;
          return Promise.resolve([]);
        },
        then(resolve: (v: unknown) => void) {
          return resolve(undefined);
        },
      });
      return chain;
    },
    delete() {
      deleteCalled = true;
      throw new Error(
        'AI RoB writer must never DELETE (runtime lacks the grant)',
      );
    },
  };

  return {
    db,
    inserts,
    get returningCalled() {
      return returningCalled;
    },
    get deleteCalled() {
      return deleteCalled;
    },
  };
}

function useDb(fake: { db: unknown }) {
  (getDb as unknown as ReturnType<typeof vi.fn>).mockReturnValue(fake.db);
}

const AI_ID = 'system:ai-reviewer';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('suggestAiRobJudgements', () => {
  it('writes only is_ai=true rows, locked, via upsert, with no RETURNING', async () => {
    const fake = makeAiDb();
    useDb(fake);

    const result = await suggestAiRobJudgements({
      reviewId: 'rev-1',
      aiReviewerId: AI_ID,
      rows: [
        {
          studyId: 'st1',
          domain: 'randomisation',
          judgement: 'some',
          supportQuote: 'sequence unclear',
        },
        {
          studyId: 'st1',
          domain: 'missing',
          judgement: 'low',
          supportQuote: 'complete follow-up',
        },
      ],
      now: new Date('2026-02-02'),
    });

    expect(result.suggested).toBe(2);
    expect(fake.inserts).toHaveLength(2);
    for (const insert of fake.inserts) {
      // Every AI row is labeled and belongs to the AI reviewer.
      expect(insert.values).toMatchObject({ isAi: true, reviewerId: AI_ID });
      // Locked immediately → ready to reveal at reconcile.
      expect(insert.values?.lockedAt).toBeInstanceOf(Date);
      // Reversible re-suggestion is an upsert, never delete+insert.
      expect(insert.conflict).toBeTruthy();
    }
    expect(fake.returningCalled).toBe(false);
    expect(fake.deleteCalled).toBe(false);
  });

  it('never writes a final human judgement (no is_ai=false row)', async () => {
    const fake = makeAiDb();
    useDb(fake);

    await suggestAiRobJudgements({
      reviewId: 'rev-1',
      aiReviewerId: AI_ID,
      rows: [
        {
          studyId: 'st1',
          domain: 'randomisation',
          judgement: 'high',
          supportQuote: 'no concealment',
        },
      ],
    });

    expect(fake.inserts.every((i) => i.values?.isAi === true)).toBe(true);
    expect(fake.inserts.some((i) => i.values?.isAi === false)).toBe(false);
  });

  it('is a no-op for an empty suggestion set', async () => {
    const fake = makeAiDb();
    useDb(fake);
    const result = await suggestAiRobJudgements({
      reviewId: 'rev-1',
      aiReviewerId: AI_ID,
      rows: [],
    });
    expect(result.suggested).toBe(0);
    expect(fake.inserts).toHaveLength(0);
  });
});
