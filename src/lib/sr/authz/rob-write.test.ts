import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({ getDb: vi.fn() }));

import { getDb } from '@/lib/db/client';
import { castOwnRobJudgement, finishOwnRob } from './rob-write';

// ─────────────────────────────────────────────────────────────────────────────
// The RoB WRITE chokepoint. The runtime Postgres role has INSERT/UPDATE but NO
// SELECT and NO DELETE on the blinded table, so:
//   1. A write only ever names the caller's OWN reviewerId (server-set).
//   2. NO `.returning()` (RETURNING needs the SELECT the runtime lacks).
//   3. The revise path is an upsert (ON CONFLICT), never delete+insert.
// We fake the drizzle builder to record the chain and assert these.
// ─────────────────────────────────────────────────────────────────────────────

interface InsertRecord {
  values: Record<string, unknown> | null;
  conflict: Record<string, unknown> | null;
}
interface UpdateRecord {
  set: Record<string, unknown> | null;
  whereCalled: boolean;
}

function makeWriteDb() {
  const insert: InsertRecord = { values: null, conflict: null };
  const update: UpdateRecord = { set: null, whereCalled: false };
  let returningCalled = false;

  const db = {
    insert() {
      const chain: Record<string, unknown> = {};
      Object.assign(chain, {
        values(v: Record<string, unknown>) {
          insert.values = v;
          return chain;
        },
        onConflictDoUpdate(cfg: Record<string, unknown>) {
          insert.conflict = cfg;
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
    update() {
      const chain: Record<string, unknown> = {};
      Object.assign(chain, {
        set(v: Record<string, unknown>) {
          update.set = v;
          return chain;
        },
        where() {
          update.whereCalled = true;
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
  };

  return {
    db,
    insert,
    update,
    get returningCalled() {
      return returningCalled;
    },
  };
}

function useDb(fake: { db: unknown }) {
  (getDb as unknown as ReturnType<typeof vi.fn>).mockReturnValue(fake.db);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('castOwnRobJudgement', () => {
  it('upserts the caller own judgement (isAi false) with a support quote and no RETURNING', async () => {
    const fake = makeWriteDb();
    useDb(fake);

    await castOwnRobJudgement({
      reviewId: 'rev-1',
      studyId: 'st-1',
      reviewerId: 'user-self',
      domain: 'randomisation',
      judgement: 'low',
      supportQuote: 'Central computer randomisation.',
    });

    expect(fake.insert.values).toMatchObject({
      reviewId: 'rev-1',
      studyId: 'st-1',
      reviewerId: 'user-self',
      domain: 'randomisation',
      judgement: 'low',
      supportQuote: 'Central computer randomisation.',
      isAi: false,
    });
    // Atomic idempotent upsert — one judgement per (reviewer, study, domain).
    expect(fake.insert.conflict).toBeTruthy();
    expect(fake.insert.conflict).toHaveProperty('target');
    expect(fake.insert.conflict).toHaveProperty('set');
    // A locked (finished) judgement is not silently rewritten.
    expect(fake.insert.conflict).toHaveProperty('setWhere');
    // The runtime role cannot SELECT — RETURNING would fail at the DB.
    expect(fake.returningCalled).toBe(false);
  });
});

describe('finishOwnRob', () => {
  it('locks own rows (sets lockedAt) scoped by a WHERE, with no RETURNING', async () => {
    const fake = makeWriteDb();
    useDb(fake);

    await finishOwnRob({ reviewId: 'rev-1', reviewerId: 'user-self' });

    expect(fake.update.set).toHaveProperty('lockedAt');
    expect(fake.update.set?.lockedAt).toBeInstanceOf(Date);
    expect(fake.update.whereCalled).toBe(true);
    expect(fake.returningCalled).toBe(false);
  });
});
