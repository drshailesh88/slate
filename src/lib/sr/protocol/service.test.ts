import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryProtocolStore } from './store';
import {
  amendProtocol,
  loadProtocol,
  lockProtocol,
  saveDraft,
  toDTO,
} from './service';
import {
  AmendmentReasonRequiredError,
  ProtocolAlreadyLockedError,
  ProtocolIncompleteError,
  ProtocolLockedError,
  ProtocolNotLockedError,
} from './errors';
import type { EligibilityCriterion, ProtocolContent } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// The protocol versioning contract: PICO + criteria persist; locking turns
// further edits into dated amendments (with a reason), never overwrites; the
// amendment history is preserved. Exercised against the in-memory store — no DB.
// ─────────────────────────────────────────────────────────────────────────────

const REVIEW = '00000000-0000-4000-8000-000000000001';
const OWNER = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';

function criterion(
  over: Partial<EligibilityCriterion> & { id: string },
): EligibilityCriterion {
  return {
    kind: 'include',
    label: 'Adults with heart failure',
    instruction: 'Include adults diagnosed with heart failure.',
    answerStructure: 'yes_no_maybe',
    ...over,
  };
}

function content(over: Partial<ProtocolContent> = {}): ProtocolContent {
  return {
    researchQuestion:
      'In adults with heart failure, do SGLT2 inhibitors reduce hospitalisation?',
    pico: {
      population: 'Adults with heart failure',
      intervention: 'SGLT2 inhibitors',
      comparator: 'Placebo or standard care',
      outcome: 'HF hospitalisation or mortality',
      studyDesign: 'Randomised controlled trials',
    },
    criteria: [
      criterion({
        id: 'c1',
        kind: 'include',
        label: 'Adults with heart failure',
      }),
      criterion({
        id: 'c2',
        kind: 'exclude',
        label: 'Conference abstract only',
      }),
    ],
    ...over,
  };
}

let store: InMemoryProtocolStore;
const T1 = new Date('2026-07-01T10:00:00.000Z');
const T2 = new Date('2026-07-02T12:30:00.000Z');
const T3 = new Date('2026-07-03T09:15:00.000Z');

beforeEach(() => {
  store = new InMemoryProtocolStore();
});

describe('loadProtocol — states', () => {
  it('is empty before anything is saved', async () => {
    const view = await loadProtocol(store, REVIEW);
    expect(view.status).toBe('empty');
    expect(view.currentVersion).toBeNull();
    expect(view.content.criteria).toEqual([]);
    expect(view.versions).toEqual([]);
  });
});

describe('saveDraft — PICO + criteria persist', () => {
  it('persists the research question, PICO, and criteria as a draft', async () => {
    const view = await saveDraft(
      store,
      { reviewId: REVIEW, actorId: OWNER, content: content() },
      T1,
    );

    expect(view.status).toBe('draft');
    expect(view.currentVersion).toBeNull();
    expect(view.content.researchQuestion).toContain('SGLT2');
    expect(view.content.pico.population).toBe('Adults with heart failure');
    expect(view.content.criteria.map((c) => c.label)).toEqual([
      'Adults with heart failure',
      'Conference abstract only',
    ]);
    // Round-trips through a fresh load (really persisted, not just returned).
    const reloaded = await loadProtocol(store, REVIEW);
    expect(reloaded.content).toEqual(view.content);
  });

  it('overwrites the draft in place on a second save (no version yet)', async () => {
    await saveDraft(
      store,
      { reviewId: REVIEW, actorId: OWNER, content: content() },
      T1,
    );
    const view = await saveDraft(
      store,
      {
        reviewId: REVIEW,
        actorId: OWNER,
        content: content({ researchQuestion: 'Revised question' }),
      },
      T2,
    );

    expect(view.status).toBe('draft');
    expect(view.content.researchQuestion).toBe('Revised question');
    // Still a single row's worth of state — no versions accrued while drafting.
    expect(view.versions).toEqual([]);
  });

  it('records a save_draft audit entry', async () => {
    await saveDraft(
      store,
      { reviewId: REVIEW, actorId: OWNER, content: content() },
      T1,
    );
    expect(store.audits.map((a) => a.action)).toContain('protocol.save_draft');
  });
});

describe('lockProtocol', () => {
  it('locks the current content as immutable version 1 (baseline, no reason)', async () => {
    await saveDraft(
      store,
      { reviewId: REVIEW, actorId: OWNER, content: content() },
      T1,
    );
    const view = await lockProtocol(
      store,
      { reviewId: REVIEW, actorId: OWNER, content: content() },
      T2,
    );

    expect(view.status).toBe('locked');
    expect(view.currentVersion).toBe(1);
    expect(view.versions).toHaveLength(1);
    expect(view.versions[0].version).toBe(1);
    expect(view.versions[0].reason).toBeNull();
    expect(view.versions[0].lockedAt).toEqual(T2);
    expect(view.versions[0].lockedBy).toBe(OWNER);
    expect(view.lockedAt).toEqual(T2);
  });

  it('can lock straight from content with no prior draft row', async () => {
    const view = await lockProtocol(
      store,
      { reviewId: REVIEW, actorId: OWNER, content: content() },
      T1,
    );
    expect(view.status).toBe('locked');
    expect(view.currentVersion).toBe(1);
    expect(view.content.criteria).toHaveLength(2);
  });

  it('refuses to lock a protocol with no eligibility criteria', async () => {
    await expect(
      lockProtocol(
        store,
        {
          reviewId: REVIEW,
          actorId: OWNER,
          content: content({ criteria: [] }),
        },
        T1,
      ),
    ).rejects.toBeInstanceOf(ProtocolIncompleteError);
  });

  it('refuses to lock an already-locked protocol', async () => {
    await lockProtocol(
      store,
      { reviewId: REVIEW, actorId: OWNER, content: content() },
      T1,
    );
    await expect(
      lockProtocol(
        store,
        { reviewId: REVIEW, actorId: OWNER, content: content() },
        T2,
      ),
    ).rejects.toBeInstanceOf(ProtocolAlreadyLockedError);
  });

  it('records a lock audit entry', async () => {
    await lockProtocol(
      store,
      { reviewId: REVIEW, actorId: OWNER, content: content() },
      T1,
    );
    expect(store.audits.map((a) => a.action)).toContain('protocol.lock');
  });
});

describe('locking makes further edits dated amendments, not overwrites', () => {
  it('refuses a plain draft save once locked (no silent overwrite)', async () => {
    await lockProtocol(
      store,
      { reviewId: REVIEW, actorId: OWNER, content: content() },
      T1,
    );
    await expect(
      saveDraft(
        store,
        {
          reviewId: REVIEW,
          actorId: OWNER,
          content: content({ researchQuestion: 'Sneaky overwrite' }),
        },
        T2,
      ),
    ).rejects.toBeInstanceOf(ProtocolLockedError);

    // The locked v1 is untouched.
    const view = await loadProtocol(store, REVIEW);
    expect(view.content.researchQuestion).toContain('SGLT2');
    expect(view.versions).toHaveLength(1);
  });

  it('records an edit as a dated amendment (new version + reason + author + time)', async () => {
    await lockProtocol(
      store,
      { reviewId: REVIEW, actorId: OWNER, content: content() },
      T1,
    );

    const amended = content({
      researchQuestion: 'Widened to HFpEF as well as HFrEF',
      criteria: [
        criterion({
          id: 'c1',
          kind: 'include',
          label: 'Adults with heart failure',
        }),
        criterion({
          id: 'c2',
          kind: 'exclude',
          label: 'Conference abstract only',
        }),
        criterion({
          id: 'c3',
          kind: 'include',
          label: 'Preserved ejection fraction',
        }),
      ],
    });

    const view = await amendProtocol(
      store,
      {
        reviewId: REVIEW,
        actorId: OTHER,
        content: amended,
        reason: 'Protocol widened to include HFpEF after scoping search.',
      },
      T2,
    );

    expect(view.status).toBe('locked');
    expect(view.currentVersion).toBe(2);
    expect(view.content.researchQuestion).toBe(
      'Widened to HFpEF as well as HFrEF',
    );
    expect(view.content.criteria).toHaveLength(3);

    const v2 = view.versions[1];
    expect(v2.version).toBe(2);
    expect(v2.reason).toBe(
      'Protocol widened to include HFpEF after scoping search.',
    );
    expect(v2.lockedBy).toBe(OTHER);
    expect(v2.lockedAt).toEqual(T2);
  });

  it('preserves the amendment history: v1 stays exactly as first locked', async () => {
    await lockProtocol(
      store,
      { reviewId: REVIEW, actorId: OWNER, content: content() },
      T1,
    );
    await amendProtocol(
      store,
      {
        reviewId: REVIEW,
        actorId: OWNER,
        content: content({ researchQuestion: 'v2 question' }),
        reason: 'first amendment',
      },
      T2,
    );
    await amendProtocol(
      store,
      {
        reviewId: REVIEW,
        actorId: OWNER,
        content: content({ researchQuestion: 'v3 question' }),
        reason: 'second amendment',
      },
      T3,
    );

    const view = await loadProtocol(store, REVIEW);
    expect(view.versions.map((v) => v.version)).toEqual([1, 2, 3]);
    // The v1 baseline content is frozen — never overwritten by amendments.
    expect(view.versions[0].content.researchQuestion).toContain('SGLT2');
    expect(view.versions[0].reason).toBeNull();
    expect(view.versions[1].content.researchQuestion).toBe('v2 question');
    expect(view.versions[1].reason).toBe('first amendment');
    expect(view.versions[2].content.researchQuestion).toBe('v3 question');
    expect(view.versions[2].reason).toBe('second amendment');
    // Current content is the newest version.
    expect(view.content.researchQuestion).toBe('v3 question');
    expect(view.currentVersion).toBe(3);
  });

  it('requires a non-empty reason for an amendment', async () => {
    await lockProtocol(
      store,
      { reviewId: REVIEW, actorId: OWNER, content: content() },
      T1,
    );
    await expect(
      amendProtocol(
        store,
        { reviewId: REVIEW, actorId: OWNER, content: content(), reason: '   ' },
        T2,
      ),
    ).rejects.toBeInstanceOf(AmendmentReasonRequiredError);
    // No phantom version was written.
    const view = await loadProtocol(store, REVIEW);
    expect(view.versions).toHaveLength(1);
  });

  it('refuses an amendment before the protocol is ever locked', async () => {
    await saveDraft(
      store,
      { reviewId: REVIEW, actorId: OWNER, content: content() },
      T1,
    );
    await expect(
      amendProtocol(
        store,
        { reviewId: REVIEW, actorId: OWNER, content: content(), reason: 'x' },
        T2,
      ),
    ).rejects.toBeInstanceOf(ProtocolNotLockedError);
  });

  it('records an amend audit entry', async () => {
    await lockProtocol(
      store,
      { reviewId: REVIEW, actorId: OWNER, content: content() },
      T1,
    );
    await amendProtocol(
      store,
      { reviewId: REVIEW, actorId: OWNER, content: content(), reason: 'r' },
      T2,
    );
    expect(store.audits.map((a) => a.action)).toContain('protocol.amend');
  });
});

describe('toDTO', () => {
  it('serializes timestamps to ISO strings for the client boundary', async () => {
    await lockProtocol(
      store,
      { reviewId: REVIEW, actorId: OWNER, content: content() },
      T2,
    );
    const dto = toDTO(await loadProtocol(store, REVIEW));
    expect(dto.lockedAt).toBe(T2.toISOString());
    expect(dto.versions[0].lockedAt).toBe(T2.toISOString());
    expect(typeof dto.versions[0].lockedAt).toBe('string');
  });
});
