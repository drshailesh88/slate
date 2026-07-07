// ─────────────────────────────────────────────────────────────────────────────
// Persistence port for import + dedup (T9).
//
// The service (./import-service.ts) depends only on this interface; the real
// Drizzle/neon-http implementation lives in ./import-drizzle-store.ts and tests
// supply an in-memory fake, so the import/ledger/reversible-dedup logic is
// exercised without a database (mirrors the T4 sync store pattern).
// ─────────────────────────────────────────────────────────────────────────────

import type { DupeStatus, ImportTarget } from './import';

export interface BatchRow {
  id: string;
  reviewId: string;
  source: string;
  target: ImportTarget;
  ai: boolean;
  createdAt: Date;
  undoneAt: Date | null;
}

export interface StudyRow {
  id: string;
  reviewId: string;
  title: string;
  abstract: string | null;
  authors: string | null;
  journal: string | null;
  year: number | null;
  doi: string | null;
  externalId: string | null;
  source: string | null;
  batchId: string | null;
  dupeStatus: DupeStatus;
  dupeOfStudyId: string | null;
  dupeMatchedOn: string[] | null;
}

export interface NewBatchInput {
  reviewId: string;
  source: string;
  target: ImportTarget;
  ai: boolean;
  createdBy: string;
}

export interface NewStudyInput {
  id: string;
  reviewId: string;
  title: string;
  abstract: string | null;
  authors: string | null;
  journal: string | null;
  year: number | null;
  doi: string | null;
  externalId: string | null;
  source: string | null;
  batchId: string;
  dupeStatus: DupeStatus;
  dupeOfStudyId: string | null;
  dupeMatchedOn: string[] | null;
}

export interface StudyDupeUpdate {
  dupeStatus: DupeStatus;
  dupeOfStudyId?: string | null;
  dupeMatchedOn?: string[] | null;
}

export interface AuditInput {
  reviewId: string;
  actorId: string;
  action: string;
  target: string;
  before: unknown;
  after: unknown;
}

export interface ImportStore {
  listBatches(reviewId: string): Promise<BatchRow[]>;
  listStudies(reviewId: string): Promise<StudyRow[]>;
  getBatch(reviewId: string, batchId: string): Promise<BatchRow | null>;
  getStudy(reviewId: string, studyId: string): Promise<StudyRow | null>;
  insertBatch(batch: NewBatchInput): Promise<BatchRow>;
  insertStudies(rows: NewStudyInput[]): Promise<void>;
  updateStudyDupe(studyId: string, update: StudyDupeUpdate): Promise<void>;
  setBatchUndone(batchId: string, undoneAt: Date | null): Promise<void>;
  appendAudit(entry: AuditInput): Promise<void>;
}
