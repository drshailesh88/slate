// ─────────────────────────────────────────────────────────────────────────────
// Import + dedup service (T9) — persistence orchestration over the ImportStore
// port and the pure math (./import.ts). Every mutation is reversible and writes
// an append-only audit_log row; nothing is ever hard-deleted (undo = restore).
//
// IDOR defense: every study/batch read is scoped by reviewId, so a foreign id
// is indistinguishable from a nonexistent one (ReviewAccessError → 404). Role
// authorization (who may mutate) is enforced at the server-action boundary.
// ─────────────────────────────────────────────────────────────────────────────

import { ReviewAccessError } from './authz/errors';
import {
  countInScreeningPool,
  deriveDupeQueue,
  deriveImportLedger,
  detectDuplicates,
  type DupeQueueEntry,
  type DupeStatus,
  type ImportLedger,
  type ImportTarget,
  type ImportView,
  type KeyedRef,
} from './import';
import type { ParsedReference } from './import-parse';
import type {
  BatchRow,
  ImportStore,
  NewStudyInput,
  StudyRow,
} from './import-store';

const AUTHOR_DELIMITER = '; ';

// A dedup decision removes a record from the pool only in these states — every
// removal is reversible (the row is kept, just flagged).
const REMOVED_FROM_POOL: readonly DupeStatus[] = ['auto_merged', 'merged'];

export class SrImportError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = 'SrImportError';
    this.code = code;
    this.status = status;
  }
}

// ── Read: the ledger + dedup queue view-model ────────────────────────────────

export interface UndoneBatch {
  id: string;
  source: string;
  refs: number;
}

export interface ImportState {
  ledger: ImportLedger;
  queue: DupeQueueEntry[];
  poolSize: number;
  undoneBatches: UndoneBatch[];
}

function splitAuthors(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(/;\s*/)
    .map((a) => a.trim())
    .filter(Boolean);
}

function joinAuthors(authors: string[]): string | null {
  const cleaned = authors.map((a) => a.trim()).filter(Boolean);
  return cleaned.length ? cleaned.join(AUTHOR_DELIMITER) : null;
}

// Project the persisted rows into the pure view the derivations consume. Studies
// in an undone batch are excluded from the funnel view (their import is undone);
// the undone batches are surfaced separately for the reversible "restore" row.
export function buildImportView(
  batches: BatchRow[],
  studies: StudyRow[],
): { view: ImportView; undoneBatches: UndoneBatch[] } {
  const undoneIds = new Set(
    batches.filter((b) => b.undoneAt !== null).map((b) => b.id),
  );
  const activeBatches = batches.filter((b) => b.undoneAt === null);

  const refIdByStudy = new Map<string, number>();
  studies.forEach((study, i) => refIdByStudy.set(study.id, i + 1));

  const visibleStudies = studies.filter(
    (study) => study.batchId === null || !undoneIds.has(study.batchId),
  );

  const view: ImportView = {
    batches: activeBatches.map((b) => ({
      id: b.id,
      source: b.source,
      target: b.target,
      ai: b.ai,
    })),
    candidates: visibleStudies.map((study) => ({
      id: study.id,
      refId: refIdByStudy.get(study.id) ?? 0,
      title: study.title,
      authors: splitAuthors(study.authors),
      year: study.year ?? undefined,
      batchId: study.batchId ?? undefined,
      dupe:
        study.dupeStatus === 'unique'
          ? undefined
          : {
              status: study.dupeStatus,
              matchedOn: study.dupeMatchedOn ?? [],
              ofRefId: study.dupeOfStudyId
                ? refIdByStudy.get(study.dupeOfStudyId)
                : undefined,
            },
    })),
  };

  const undoneBatches: UndoneBatch[] = batches
    .filter((b) => b.undoneAt !== null)
    .map((b) => ({
      id: b.id,
      source: b.source,
      refs: studies.filter((s) => s.batchId === b.id).length,
    }));

  return { view, undoneBatches };
}

export async function getImportState(
  store: ImportStore,
  reviewId: string,
): Promise<ImportState> {
  const [batches, studies] = await Promise.all([
    store.listBatches(reviewId),
    store.listStudies(reviewId),
  ]);
  const { view, undoneBatches } = buildImportView(batches, studies);
  return {
    ledger: deriveImportLedger(view),
    queue: deriveDupeQueue(view),
    poolSize: countInScreeningPool(view.candidates),
    undoneBatches,
  };
}

// ── Write: import references (parse → dedup → persist → audit) ────────────────

export interface ImportInput {
  reviewId: string;
  actorId: string;
  source: string;
  target: ImportTarget;
  ai: boolean;
  references: ParsedReference[];
  /** Injectable id generator (deterministic tests); defaults to a random uuid. */
  genId?: () => string;
}

export interface ImportOutcome {
  batchId: string | null;
  imported: number;
  duplicates: number;
  needsReview: number;
}

function toKeyedRef(
  id: string,
  ref: ParsedReference,
  source: string,
): KeyedRef {
  return {
    key: id,
    title: ref.title,
    authors: ref.authors,
    year: ref.year ?? null,
    doi: ref.doi ?? null,
    externalId: ref.externalId ?? null,
    source,
  };
}

// A study currently occupying the screening pool can serve as a dedup original.
function poolStudyToKeyedRef(study: StudyRow): KeyedRef {
  return {
    key: study.id,
    title: study.title,
    authors: splitAuthors(study.authors),
    year: study.year,
    doi: study.doi,
    externalId: study.externalId,
    source: study.source,
  };
}

export async function importReferences(
  store: ImportStore,
  input: ImportInput,
): Promise<ImportOutcome> {
  const genId = input.genId ?? (() => crypto.randomUUID());
  const source = input.source.trim() || 'Import';

  if (input.references.length === 0) {
    return { batchId: null, imported: 0, duplicates: 0, needsReview: 0 };
  }

  // Existing pool studies (active batch, not a removed duplicate) are candidates
  // for cross-batch dedup — a later import dedupes against what's already here.
  const existing = await store.listStudies(input.reviewId);
  const undoneBatchIds = new Set(
    (await store.listBatches(input.reviewId))
      .filter((b) => b.undoneAt !== null)
      .map((b) => b.id),
  );
  const seen: KeyedRef[] = existing
    .filter(
      (s) =>
        !REMOVED_FROM_POOL.includes(s.dupeStatus) &&
        (s.batchId === null || !undoneBatchIds.has(s.batchId)),
    )
    .map(poolStudyToKeyedRef);

  // Assign a stable study id to every incoming reference up front so a dedup
  // pointer to an earlier row IN THIS import resolves to the real row id.
  const idByIndex = input.references.map(() => genId());
  const incoming: KeyedRef[] = input.references.map((ref, i) =>
    toKeyedRef(idByIndex[i], ref, source),
  );
  const decisions = detectDuplicates(incoming, seen);

  const batch = await store.insertBatch({
    reviewId: input.reviewId,
    source,
    target: input.target,
    ai: input.ai,
    createdBy: input.actorId,
  });

  const rows: NewStudyInput[] = input.references.map((ref, i) => {
    const key = idByIndex[i];
    const decision = decisions.get(key);
    const matchedOn = decision?.matchedOn.length ? decision.matchedOn : null;
    return {
      id: key,
      reviewId: input.reviewId,
      title: ref.title,
      abstract: ref.abstract ?? null,
      authors: joinAuthors(ref.authors),
      journal: ref.journal ?? null,
      year: ref.year ?? null,
      doi: ref.doi ?? null,
      externalId: ref.externalId ?? null,
      source,
      batchId: batch.id,
      dupeStatus: decision?.status ?? 'unique',
      dupeOfStudyId: decision?.ofKey ?? null,
      dupeMatchedOn: matchedOn,
    };
  });

  await store.insertStudies(rows);

  const duplicates = rows.filter((r) => r.dupeStatus === 'auto_merged').length;
  const needsReview = rows.filter(
    (r) => r.dupeStatus === 'needs_review',
  ).length;

  await store.appendAudit({
    reviewId: input.reviewId,
    actorId: input.actorId,
    action: 'import.create',
    target: batch.id,
    before: null,
    after: {
      source,
      target: input.target,
      ai: input.ai,
      imported: rows.length,
      duplicates,
      needsReview,
    },
  });

  return { batchId: batch.id, imported: rows.length, duplicates, needsReview };
}

// ── Write: reversible dedup decisions ────────────────────────────────────────

interface StudyAction {
  reviewId: string;
  actorId: string;
  studyId: string;
}

async function requireStudy(
  store: ImportStore,
  reviewId: string,
  studyId: string,
): Promise<StudyRow> {
  const study = await store.getStudy(reviewId, studyId);
  if (!study) throw new ReviewAccessError();
  return study;
}

async function transitionDupe(
  store: ImportStore,
  action: StudyAction,
  from: readonly DupeStatus[],
  to: DupeStatus,
  auditAction: string,
): Promise<void> {
  const study = await requireStudy(store, action.reviewId, action.studyId);
  if (!from.includes(study.dupeStatus)) {
    throw new SrImportError(
      'invalid_dupe_transition',
      409,
      `Cannot ${auditAction} a study in state "${study.dupeStatus}".`,
    );
  }
  await store.updateStudyDupe(action.studyId, { dupeStatus: to });
  await store.appendAudit({
    reviewId: action.reviewId,
    actorId: action.actorId,
    action: auditAction,
    target: action.studyId,
    before: { dupeStatus: study.dupeStatus },
    after: { dupeStatus: to },
  });
}

/** Confirm an uncertain pair as a duplicate → removed from the pool (reversible). */
export function mergeDuplicate(
  store: ImportStore,
  action: StudyAction,
): Promise<void> {
  return transitionDupe(
    store,
    action,
    ['needs_review'],
    'merged',
    'dedup.merge',
  );
}

/** Reject an uncertain pair → kept in the pool as a distinct record. */
export function markNotDuplicate(
  store: ImportStore,
  action: StudyAction,
): Promise<void> {
  return transitionDupe(store, action, ['needs_review'], 'kept', 'dedup.keep');
}

/** Reverse a merge / keep decision → back to the uncertain queue (undo restores). */
export function undoDedupDecision(
  store: ImportStore,
  action: StudyAction,
): Promise<void> {
  return transitionDupe(
    store,
    action,
    ['merged', 'kept'],
    'needs_review',
    'dedup.undo',
  );
}

// ── Write: reversible import undo / restore ──────────────────────────────────

interface BatchAction {
  reviewId: string;
  actorId: string;
  batchId: string;
}

async function requireBatch(
  store: ImportStore,
  reviewId: string,
  batchId: string,
): Promise<BatchRow> {
  const batch = await store.getBatch(reviewId, batchId);
  if (!batch) throw new ReviewAccessError();
  return batch;
}

/** Undo a whole import: its studies leave the pool, but the rows are kept. */
export async function undoImport(
  store: ImportStore,
  action: BatchAction,
): Promise<void> {
  const batch = await requireBatch(store, action.reviewId, action.batchId);
  if (batch.undoneAt !== null) return; // idempotent
  await store.setBatchUndone(action.batchId, new Date());
  await store.appendAudit({
    reviewId: action.reviewId,
    actorId: action.actorId,
    action: 'import.undo',
    target: action.batchId,
    before: { undone: false },
    after: { undone: true },
  });
}

/** Restore a previously-undone import → its studies re-enter the pool. */
export async function restoreImport(
  store: ImportStore,
  action: BatchAction,
): Promise<void> {
  const batch = await requireBatch(store, action.reviewId, action.batchId);
  if (batch.undoneAt === null) return; // idempotent
  await store.setBatchUndone(action.batchId, null);
  await store.appendAudit({
    reviewId: action.reviewId,
    actorId: action.actorId,
    action: 'import.restore',
    target: action.batchId,
    before: { undone: true },
    after: { undone: false },
  });
}
