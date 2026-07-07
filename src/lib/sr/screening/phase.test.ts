import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({ getDb: vi.fn() }));

import { getDb } from '@/lib/db/client';
import { loadScreeningFacts, unblindScreening } from './phase';

// ─────────────────────────────────────────────────────────────────────────────
// The unblind is one-way + atomic. We fake the drizzle builder so the CAS UPDATE
// (independent → reconcile) can report "flipped a row" or "matched nothing", and
// assert: a first flip succeeds + audits; a second (already reconcile) no-ops and
// does NOT audit. Phase is read from `reviews`, never from the caller.
// ─────────────────────────────────────────────────────────────────────────────

function makeDb(options: {
  reviewRow?: Record<string, unknown> | null;
  flipRows?: unknown[];
}) {
  const audits: Record<string, unknown>[] = [];
  let updateWhereCalled = false;

  const db = {
    select() {
      const chain: Record<string, unknown> = {};
      Object.assign(chain, {
        from: () => chain,
        where: () => chain,
        limit: () =>
          Promise.resolve(options.reviewRow ? [options.reviewRow] : []),
      });
      return chain;
    },
    update() {
      const chain: Record<string, unknown> = {};
      Object.assign(chain, {
        set: () => chain,
        where: () => {
          updateWhereCalled = true;
          return chain;
        },
        returning: () => Promise.resolve(options.flipRows ?? []),
      });
      return chain;
    },
    insert() {
      return {
        values: (v: Record<string, unknown>) => {
          audits.push(v);
          return Promise.resolve(undefined);
        },
      };
    },
  };

  return {
    db,
    audits,
    get updateWhereCalled() {
      return updateWhereCalled;
    },
  };
}

function useDb(fake: { db: unknown }) {
  (getDb as unknown as ReturnType<typeof vi.fn>).mockReturnValue(fake.db);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadScreeningFacts', () => {
  it('reads the authoritative phase + stage from reviews', async () => {
    const fake = makeDb({
      reviewRow: {
        title: 'SGLT2 review',
        reviewType: 'Intervention review',
        screeningPhase: 'independent',
        screeningStage: 'title_abstract',
      },
    });
    useDb(fake);

    const facts = await loadScreeningFacts('rev-1');
    expect(facts).toMatchObject({
      reviewId: 'rev-1',
      phase: 'independent',
      stage: 'title_abstract',
      title: 'SGLT2 review',
    });
  });

  it('returns null for a missing review (defensive 404)', async () => {
    const fake = makeDb({ reviewRow: null });
    useDb(fake);
    expect(await loadScreeningFacts('nope')).toBeNull();
  });
});

describe('unblindScreening', () => {
  it('flips independent → reconcile and audits when the CAS matches a row', async () => {
    const fake = makeDb({ flipRows: [{ id: 'rev-1' }] });
    useDb(fake);

    const result = await unblindScreening('rev-1', 'owner-1');

    expect(result.flipped).toBe(true);
    expect(fake.updateWhereCalled).toBe(true);
    expect(fake.audits).toHaveLength(1);
    expect(fake.audits[0]).toMatchObject({
      action: 'screening.unblind',
      after: { screeningPhase: 'reconcile' },
    });
  });

  it('is one-way: a second call (already reconcile) no-ops and does not audit', async () => {
    const fake = makeDb({ flipRows: [] });
    useDb(fake);

    const result = await unblindScreening('rev-1', 'owner-1');

    expect(result.flipped).toBe(false);
    expect(fake.audits).toHaveLength(0);
  });
});
