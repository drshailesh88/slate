import { describe, expect, it } from 'vitest';
import type { ScreeningConflict } from './derive';
import { ConflictResolutionInvalidError } from './errors';
import { InMemoryConflictStore, type ResolutionRow } from './store';
import { assembleConflicts, resolveConflict } from './service';

const NOW = new Date('2026-07-07T10:00:00.000Z');

function base() {
  return {
    reviewId: 'rev-1',
    studyId: 'st-1',
    stage: 'title_abstract',
    note: null,
    actorId: 'user-actor',
  };
}

describe('resolveConflict — no-auto-resolve state machine', () => {
  it('align_on_one records the explicit human pick + an audit row', async () => {
    const store = new InMemoryConflictStore();
    await resolveConflict(
      store,
      {
        ...base(),
        method: 'align_on_one',
        decision: 'include',
        arbitratorId: null,
      },
      NOW,
    );

    const rows = await store.listResolutions('rev-1');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      method: 'align_on_one',
      decision: 'include',
      arbitratorId: null,
      resolvedBy: 'user-actor',
      resolvedAt: NOW,
    });
    // Method + actor + time recorded in the audit log.
    expect(store.audits).toHaveLength(1);
    expect(store.audits[0]).toMatchObject({
      actorId: 'user-actor',
      action: 'conflict.resolve',
    });
    expect(store.audits[0].after).toMatchObject({
      method: 'align_on_one',
      decision: 'include',
    });
  });

  it('refuses align_on_one without an explicit include/exclude (no majority auto-vote)', async () => {
    const store = new InMemoryConflictStore();
    await expect(
      resolveConflict(
        store,
        {
          ...base(),
          method: 'align_on_one',
          decision: null,
          arbitratorId: null,
        },
        NOW,
      ),
    ).rejects.toBeInstanceOf(ConflictResolutionInvalidError);
    expect(await store.listResolutions('rev-1')).toHaveLength(0);
    expect(store.audits).toHaveLength(0);
  });

  it('send_to_arbitrator records the arbitrator + a null decision', async () => {
    const store = new InMemoryConflictStore();
    await resolveConflict(
      store,
      {
        ...base(),
        method: 'send_to_arbitrator',
        decision: null,
        arbitratorId: 'user-arb',
      },
      NOW,
    );
    const rows = await store.listResolutions('rev-1');
    expect(rows[0]).toMatchObject({
      method: 'send_to_arbitrator',
      decision: null,
      arbitratorId: 'user-arb',
    });
  });

  it('refuses send_to_arbitrator without an arbitrator', async () => {
    const store = new InMemoryConflictStore();
    await expect(
      resolveConflict(
        store,
        {
          ...base(),
          method: 'send_to_arbitrator',
          decision: null,
          arbitratorId: null,
        },
        NOW,
      ),
    ).rejects.toBeInstanceOf(ConflictResolutionInvalidError);
  });

  it('refuses any resolution without a human actor', async () => {
    const store = new InMemoryConflictStore();
    await expect(
      resolveConflict(
        store,
        {
          ...base(),
          actorId: '',
          method: 'align_on_one',
          decision: 'include',
          arbitratorId: null,
        },
        NOW,
      ),
    ).rejects.toBeInstanceOf(ConflictResolutionInvalidError);
    expect(await store.listResolutions('rev-1')).toHaveLength(0);
  });

  it('upserts on re-resolution — one active row per study/stage', async () => {
    const store = new InMemoryConflictStore();
    await resolveConflict(
      store,
      {
        ...base(),
        method: 'send_to_arbitrator',
        decision: null,
        arbitratorId: 'user-arb',
      },
      NOW,
    );
    await resolveConflict(
      store,
      {
        ...base(),
        method: 'align_on_one',
        decision: 'exclude',
        arbitratorId: null,
      },
      new Date('2026-07-08T09:00:00.000Z'),
    );

    const rows = await store.listResolutions('rev-1');
    expect(rows).toHaveLength(1);
    expect(rows[0].method).toBe('align_on_one');
    expect(rows[0].decision).toBe('exclude');
    // History preserved append-only in the audit log.
    expect(store.audits).toHaveLength(2);
  });
});

describe('assembleConflicts — pure view assembly', () => {
  const conflicts: ScreeningConflict[] = [
    {
      studyId: 'st-1',
      stage: 'title_abstract',
      decisions: [
        {
          reviewerId: 'u-a',
          decision: 'include',
          isAi: false,
          excludeReasonCode: null,
          excludeReasonDetail: null,
        },
        {
          reviewerId: 'u-b',
          decision: 'exclude',
          isAi: false,
          excludeReasonCode: 'off_topic',
          excludeReasonDetail: 'Wrong population.',
        },
      ],
    },
  ];

  it('joins study meta, member names, and resolutions; keeps both calls', () => {
    const resolutions: ResolutionRow[] = [
      {
        reviewId: 'rev-1',
        studyId: 'st-1',
        stage: 'title_abstract',
        method: 'align_on_one',
        decision: 'include',
        arbitratorId: null,
        note: null,
        resolvedBy: 'u-a',
        resolvedAt: NOW,
      },
    ];
    const items = assembleConflicts({
      conflicts,
      resolutions,
      studies: new Map([
        [
          'st-1',
          { title: 'Trial X', authors: 'Ng', journal: 'JAMA', year: 2021 },
        ],
      ]),
      names: new Map([
        ['u-a', 'Dr. A'],
        ['u-b', 'Dr. B'],
      ]),
    });

    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Trial X');
    expect(items[0].decisions).toHaveLength(2);
    expect(items[0].decisions.map((d) => d.reviewerName)).toEqual([
      'Dr. A',
      'Dr. B',
    ]);
    expect(items[0].resolution?.method).toBe('align_on_one');
    expect(items[0].resolution?.resolvedByName).toBe('Dr. A');
  });

  it('falls back to a placeholder title when study meta is missing', () => {
    const items = assembleConflicts({
      conflicts,
      resolutions: [],
      studies: new Map(),
      names: new Map(),
    });
    expect(items[0].title).toBe('Untitled study');
    expect(items[0].resolution).toBeNull();
  });
});
