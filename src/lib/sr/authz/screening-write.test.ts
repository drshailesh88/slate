import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({ getDb: vi.fn() }));

import { getDb } from '@/lib/db/client';
import {
  castOwnScreeningDecision,
  finishOwnScreening,
} from './screening-write';

// ─────────────────────────────────────────────────────────────────────────────
// The screening WRITE chokepoint. The runtime Postgres role has INSERT/UPDATE but
// NO SELECT on the blinded table, so two properties are load-bearing:
//   1. A write only ever names the caller's OWN reviewerId (passed in by the
//      server action — never a client value).
//   2. NO `.returning()` is ever used (RETURNING needs SELECT the runtime lacks).
// We fake the drizzle builder to record the chain and assert both.
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

describe('castOwnScreeningDecision', () => {
  it('upserts the caller own row (reviewerId as given, isAi false) with no RETURNING', async () => {
    const fake = makeWriteDb();
    useDb(fake);

    await castOwnScreeningDecision({
      reviewId: 'rev-1',
      studyId: 'st-1',
      reviewerId: 'user-self',
      stage: 'title_abstract',
      decision: 'exclude',
      excludeReasonCode: 'wrong_population',
      excludeReasonDetail: 'paediatric cohort',
    });

    expect(fake.insert.values).toMatchObject({
      reviewId: 'rev-1',
      studyId: 'st-1',
      reviewerId: 'user-self',
      stage: 'title_abstract',
      decision: 'exclude',
      excludeReasonCode: 'wrong_population',
      excludeReasonDetail: 'paediatric cohort',
      isAi: false,
    });
    // Atomic idempotent upsert — one decision per (reviewer, study, stage).
    expect(fake.insert.conflict).toBeTruthy();
    expect(fake.insert.conflict).toHaveProperty('target');
    expect(fake.insert.conflict).toHaveProperty('set');
    expect(fake.insert.conflict).toHaveProperty('setWhere');
    // The runtime role cannot SELECT — RETURNING would fail at the DB.
    expect(fake.returningCalled).toBe(false);
  });

  it('carries a null exclude reason for a non-exclude decision', async () => {
    const fake = makeWriteDb();
    useDb(fake);

    await castOwnScreeningDecision({
      reviewId: 'rev-1',
      studyId: 'st-2',
      reviewerId: 'user-self',
      stage: 'title_abstract',
      decision: 'include',
      excludeReasonCode: null,
      excludeReasonDetail: null,
    });

    expect(fake.insert.values).toMatchObject({
      decision: 'include',
      excludeReasonCode: null,
      excludeReasonDetail: null,
    });
  });
});

describe('finishOwnScreening', () => {
  it('locks own rows (sets lockedAt) scoped by a WHERE, with no RETURNING', async () => {
    const fake = makeWriteDb();
    useDb(fake);

    await finishOwnScreening({
      reviewId: 'rev-1',
      reviewerId: 'user-self',
      stage: 'title_abstract',
    });

    expect(fake.update.set).toHaveProperty('lockedAt');
    expect(fake.update.set?.lockedAt).toBeInstanceOf(Date);
    expect(fake.update.whereCalled).toBe(true);
    expect(fake.returningCalled).toBe(false);
  });
});
