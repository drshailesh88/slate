import { beforeEach, describe, expect, it } from 'vitest';
import { ReviewAccessError } from './authz/errors';
import type { ParsedReference } from './import-parse';
import {
  getImportState,
  importReferences,
  markNotDuplicate,
  mergeDuplicate,
  restoreImport,
  SrImportError,
  undoDedupDecision,
  undoImport,
} from './import-service';
import type {
  AuditInput,
  BatchRow,
  ImportStore,
  NewBatchInput,
  NewStudyInput,
  StudyDupeUpdate,
  StudyRow,
} from './import-store';

// In-memory ImportStore fake — the whole reversible import/dedup contract is
// exercised without a database (mirrors the sync store's in-memory fake).
class FakeImportStore implements ImportStore {
  batches: BatchRow[] = [];
  studies: StudyRow[] = [];
  audit: AuditInput[] = [];
  private seq = 0;

  async listBatches(reviewId: string): Promise<BatchRow[]> {
    return this.batches.filter((b) => b.reviewId === reviewId);
  }
  async listStudies(reviewId: string): Promise<StudyRow[]> {
    return this.studies.filter((s) => s.reviewId === reviewId);
  }
  async getBatch(reviewId: string, batchId: string): Promise<BatchRow | null> {
    return (
      this.batches.find((b) => b.reviewId === reviewId && b.id === batchId) ??
      null
    );
  }
  async getStudy(reviewId: string, studyId: string): Promise<StudyRow | null> {
    return (
      this.studies.find((s) => s.reviewId === reviewId && s.id === studyId) ??
      null
    );
  }
  async insertBatch(batch: NewBatchInput): Promise<BatchRow> {
    const row: BatchRow = {
      id: `batch-${++this.seq}`,
      ...batch,
      createdAt: new Date(0),
      undoneAt: null,
    };
    this.batches.push(row);
    return row;
  }
  async insertStudies(rows: NewStudyInput[]): Promise<void> {
    for (const r of rows) this.studies.push({ ...r });
  }
  async updateStudyDupe(
    studyId: string,
    update: StudyDupeUpdate,
  ): Promise<void> {
    const study = this.studies.find((s) => s.id === studyId);
    if (!study) return;
    study.dupeStatus = update.dupeStatus;
    if ('dupeOfStudyId' in update)
      study.dupeOfStudyId = update.dupeOfStudyId ?? null;
    if ('dupeMatchedOn' in update)
      study.dupeMatchedOn = update.dupeMatchedOn ?? null;
  }
  async setBatchUndone(batchId: string, undoneAt: Date | null): Promise<void> {
    const batch = this.batches.find((b) => b.id === batchId);
    if (batch) batch.undoneAt = undoneAt;
  }
  async appendAudit(entry: AuditInput): Promise<void> {
    this.audit.push(entry);
  }
}

const REVIEW = 'review-1';
const ACTOR = 'user-1';

function ref(
  over: Partial<ParsedReference> & { title: string },
): ParsedReference {
  return { authors: ['Doe J'], ...over };
}

// Deterministic id generator so tests can name the studies they create.
function counter(prefix = 's') {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

let store: FakeImportStore;
beforeEach(() => {
  store = new FakeImportStore();
});

describe('importReferences — persistence', () => {
  it('persists parsed references as studies rows with a batch', async () => {
    const outcome = await importReferences(store, {
      reviewId: REVIEW,
      actorId: ACTOR,
      source: 'PubMed',
      target: 'screen',
      ai: false,
      references: [
        ref({
          title: 'Alpha',
          authors: ['Smith A'],
          year: 2020,
          doi: '10.1/a',
          journal: 'BMJ',
          externalId: '111',
        }),
        ref({ title: 'Beta', authors: ['Jones B'], year: 2021 }),
      ],
      genId: counter(),
    });

    expect(outcome).toMatchObject({
      imported: 2,
      duplicates: 0,
      needsReview: 0,
    });
    expect(outcome.batchId).toBeTruthy();
    expect(store.studies).toHaveLength(2);
    const alpha = store.studies.find((s) => s.title === 'Alpha');
    expect(alpha).toMatchObject({
      reviewId: REVIEW,
      authors: 'Smith A',
      year: 2020,
      doi: '10.1/a',
      journal: 'BMJ',
      externalId: '111',
      source: 'PubMed',
      dupeStatus: 'unique',
    });
    expect(alpha?.batchId).toBe(outcome.batchId);
  });

  it('does not create a batch for an empty import', async () => {
    const outcome = await importReferences(store, {
      reviewId: REVIEW,
      actorId: ACTOR,
      source: 'RIS file',
      target: 'screen',
      ai: false,
      references: [],
    });
    expect(outcome).toEqual({
      batchId: null,
      imported: 0,
      duplicates: 0,
      needsReview: 0,
    });
    expect(store.batches).toHaveLength(0);
  });

  it('writes an import.create audit row', async () => {
    await importReferences(store, {
      reviewId: REVIEW,
      actorId: ACTOR,
      source: 'PubMed',
      target: 'screen',
      ai: false,
      references: [ref({ title: 'Alpha' })],
      genId: counter(),
    });
    const entry = store.audit.find((a) => a.action === 'import.create');
    expect(entry?.reviewId).toBe(REVIEW);
    expect(entry?.actorId).toBe(ACTOR);
  });
});

describe('importReferences — ledger counts', () => {
  it('auto-merges high-confidence duplicates and counts them in the ledger', async () => {
    await importReferences(store, {
      reviewId: REVIEW,
      actorId: ACTOR,
      source: 'PubMed',
      target: 'screen',
      ai: false,
      references: [
        ref({ title: 'Trial X', doi: '10.1/x' }),
        ref({ title: 'Trial X (revised)', doi: '10.1/x' }), // same DOI → auto-merged
        ref({ title: 'Unrelated', doi: '10.1/y' }),
      ],
      genId: counter(),
    });

    const state = await getImportState(store, REVIEW);
    expect(state.ledger.batches).toHaveLength(1);
    expect(state.ledger.batches[0]).toMatchObject({
      refs: 3,
      duplicatesRemoved: 1,
    });
    expect(state.ledger.totalDuplicatesRemoved).toBe(1);
    expect(state.poolSize).toBe(2);
  });

  it('dedupes a later import against studies already in the pool', async () => {
    const first = counter('a');
    await importReferences(store, {
      reviewId: REVIEW,
      actorId: ACTOR,
      source: 'PubMed',
      target: 'screen',
      ai: false,
      references: [ref({ title: 'Shared paper', doi: '10.1/z' })],
      genId: first,
    });
    await importReferences(store, {
      reviewId: REVIEW,
      actorId: ACTOR,
      source: 'Embase',
      target: 'screen',
      ai: false,
      references: [ref({ title: 'Shared paper (dup)', doi: '10.1/z' })],
      genId: counter('b'),
    });

    const state = await getImportState(store, REVIEW);
    expect(state.poolSize).toBe(1);
    const embase = state.ledger.batches.find((b) => b.source === 'Embase');
    expect(embase).toMatchObject({ refs: 1, duplicatesRemoved: 1 });
  });
});

describe('reversible dedup — merge / keep / undo', () => {
  async function importUncertainPair() {
    await importReferences(store, {
      reviewId: REVIEW,
      actorId: ACTOR,
      source: 'PubMed',
      target: 'screen',
      ai: false,
      references: [
        ref({
          title: 'Dapagliflozin in heart failure',
          authors: ['McMurray J'],
          year: 2019,
        }),
        ref({
          title: 'Dapagliflozin in heart failure',
          authors: ['McMurray J'],
          year: 2019,
        }),
      ],
      genId: counter(),
    });
    return store.studies.find((s) => s.dupeStatus === 'needs_review')!;
  }

  it('queues an uncertain pair (both stay in the pool)', async () => {
    await importUncertainPair();
    const state = await getImportState(store, REVIEW);
    expect(state.queue).toHaveLength(1);
    expect(state.queue[0].matchedOn).toEqual(['title', 'year', 'first author']);
    expect(state.poolSize).toBe(2);
  });

  it('merge removes it from the pool; undo restores it', async () => {
    const dup = await importUncertainPair();

    await mergeDuplicate(store, {
      reviewId: REVIEW,
      actorId: ACTOR,
      studyId: dup.id,
    });
    let state = await getImportState(store, REVIEW);
    expect(state.poolSize).toBe(1);
    expect(state.queue).toHaveLength(0);
    expect(state.ledger.totalDuplicatesRemoved).toBe(1);

    await undoDedupDecision(store, {
      reviewId: REVIEW,
      actorId: ACTOR,
      studyId: dup.id,
    });
    state = await getImportState(store, REVIEW);
    expect(state.poolSize).toBe(2);
    expect(state.queue).toHaveLength(1);
    expect(store.audit.map((a) => a.action)).toEqual(
      expect.arrayContaining(['dedup.merge', 'dedup.undo']),
    );
  });

  it('mark-not-duplicate keeps it in the pool and clears the queue', async () => {
    const dup = await importUncertainPair();
    await markNotDuplicate(store, {
      reviewId: REVIEW,
      actorId: ACTOR,
      studyId: dup.id,
    });
    const state = await getImportState(store, REVIEW);
    expect(state.poolSize).toBe(2);
    expect(state.queue).toHaveLength(0);
    expect(store.studies.find((s) => s.id === dup.id)?.dupeStatus).toBe('kept');
  });

  it('refuses to merge a study that is not in the queue', async () => {
    await importReferences(store, {
      reviewId: REVIEW,
      actorId: ACTOR,
      source: 'PubMed',
      target: 'screen',
      ai: false,
      references: [ref({ title: 'Unique study' })],
      genId: counter(),
    });
    const unique = store.studies[0];
    await expect(
      mergeDuplicate(store, {
        reviewId: REVIEW,
        actorId: ACTOR,
        studyId: unique.id,
      }),
    ).rejects.toBeInstanceOf(SrImportError);
  });
});

describe('reversible import — undo / restore', () => {
  it('undo removes a batch from the pool; restore brings it back', async () => {
    await importReferences(store, {
      reviewId: REVIEW,
      actorId: ACTOR,
      source: 'PubMed',
      target: 'screen',
      ai: false,
      references: [ref({ title: 'A' }), ref({ title: 'B' })],
      genId: counter('a'),
    });
    const second = await importReferences(store, {
      reviewId: REVIEW,
      actorId: ACTOR,
      source: 'Embase',
      target: 'screen',
      ai: false,
      references: [ref({ title: 'C' }), ref({ title: 'D' })],
      genId: counter('b'),
    });

    let state = await getImportState(store, REVIEW);
    expect(state.poolSize).toBe(4);

    await undoImport(store, {
      reviewId: REVIEW,
      actorId: ACTOR,
      batchId: second.batchId!,
    });
    state = await getImportState(store, REVIEW);
    expect(state.poolSize).toBe(2);
    expect(state.ledger.batches).toHaveLength(1);
    expect(state.undoneBatches).toHaveLength(1);
    // The rows are NOT deleted — undo is reversible, never a silent drop.
    expect(store.studies).toHaveLength(4);

    await restoreImport(store, {
      reviewId: REVIEW,
      actorId: ACTOR,
      batchId: second.batchId!,
    });
    state = await getImportState(store, REVIEW);
    expect(state.poolSize).toBe(4);
    expect(state.undoneBatches).toHaveLength(0);
  });

  it('undo is idempotent', async () => {
    const outcome = await importReferences(store, {
      reviewId: REVIEW,
      actorId: ACTOR,
      source: 'PubMed',
      target: 'screen',
      ai: false,
      references: [ref({ title: 'A' })],
      genId: counter(),
    });
    await undoImport(store, {
      reviewId: REVIEW,
      actorId: ACTOR,
      batchId: outcome.batchId!,
    });
    await undoImport(store, {
      reviewId: REVIEW,
      actorId: ACTOR,
      batchId: outcome.batchId!,
    });
    expect(store.audit.filter((a) => a.action === 'import.undo')).toHaveLength(
      1,
    );
  });
});

describe('IDOR scoping', () => {
  it('a study in another review is indistinguishable from a nonexistent one', async () => {
    await importReferences(store, {
      reviewId: REVIEW,
      actorId: ACTOR,
      source: 'PubMed',
      target: 'screen',
      ai: false,
      references: [
        ref({ title: 'x' }),
        ref({ title: 'x', authors: ['Doe J'], year: 2000 }),
      ],
      genId: counter(),
    });
    const dup = store.studies.find((s) => s.dupeStatus === 'needs_review')!;
    await expect(
      mergeDuplicate(store, {
        reviewId: 'other-review',
        actorId: ACTOR,
        studyId: dup.id,
      }),
    ).rejects.toBeInstanceOf(ReviewAccessError);
  });

  it('a batch in another review 404s on undo', async () => {
    const outcome = await importReferences(store, {
      reviewId: REVIEW,
      actorId: ACTOR,
      source: 'PubMed',
      target: 'screen',
      ai: false,
      references: [ref({ title: 'A' })],
      genId: counter(),
    });
    await expect(
      undoImport(store, {
        reviewId: 'other-review',
        actorId: ACTOR,
        batchId: outcome.batchId!,
      }),
    ).rejects.toBeInstanceOf(ReviewAccessError);
  });
});
