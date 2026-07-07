import type { ExtractionState } from './states';
import type {
  ExtractionConsensusSource,
  ExtractionResolutionMethod,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Persistence port for extraction consensus (the reconciled values). The service
// depends only on this interface, so the no-auto-resolve + resolution-ladder
// state machine is exercised with an in-memory fake and no database. The
// neon-http impl lives in ./drizzle-store.ts. neon-http has no interactive
// transactions, so every write is a SINGLE statement; the service composes them
// in a crash-recoverable order (record the consensus, then append the audit).
//
// This table is SEPARATE from the blinded extraction-entries table: recording a
// consensus never overwrites either reviewer's as-extracted entry (non-neg #8).
// ─────────────────────────────────────────────────────────────────────────────

export interface ConsensusRow {
  reviewId: string;
  studyId: string;
  fieldId: string;
  value: string | null;
  state: ExtractionState;
  source: ExtractionConsensusSource;
  derived: boolean;
  derivedFormula: string | null;
  provenance: unknown;
  resolutionMethod: ExtractionResolutionMethod;
  arbitratorId: string | null;
  authorContacted: boolean;
  authorContactNote: string | null;
  resolvedBy: string;
  resolvedAt: Date;
}

// The full row the service upserts. `resolvedAt` is supplied by the store.
export type UpsertConsensusInput = Omit<ConsensusRow, 'resolvedAt'>;

export interface ConsensusAuditEntry {
  reviewId: string;
  actorId: string | null;
  action: string;
  target: string;
  before: unknown;
  after: unknown;
}

export interface ExtractionConsensusStore {
  /** Every recorded consensus for the review (one per study/field). */
  listConsensus(reviewId: string): Promise<ConsensusRow[]>;
  /** The current consensus for one field, or null. */
  getConsensus(
    reviewId: string,
    studyId: string,
    fieldId: string,
  ): Promise<ConsensusRow | null>;
  /** Upsert the consensus for (reviewId, studyId, fieldId). */
  upsertConsensus(input: UpsertConsensusInput, now: Date): Promise<void>;
  /** Append an audit entry. Never updates or deletes. */
  appendAudit(entry: ConsensusAuditEntry): Promise<void>;
}

// In-memory fake for tests: single-statement semantics, deterministic ordering.
export class InMemoryExtractionConsensusStore implements ExtractionConsensusStore {
  private rows: ConsensusRow[] = [];
  readonly audits: ConsensusAuditEntry[] = [];

  async listConsensus(reviewId: string): Promise<ConsensusRow[]> {
    return this.rows
      .filter((r) => r.reviewId === reviewId)
      .map((r) => ({ ...r }));
  }

  async getConsensus(
    reviewId: string,
    studyId: string,
    fieldId: string,
  ): Promise<ConsensusRow | null> {
    const row = this.rows.find(
      (r) =>
        r.reviewId === reviewId &&
        r.studyId === studyId &&
        r.fieldId === fieldId,
    );
    return row ? { ...row } : null;
  }

  async upsertConsensus(input: UpsertConsensusInput, now: Date): Promise<void> {
    const next: ConsensusRow = { ...input, resolvedAt: now };
    const idx = this.rows.findIndex(
      (r) =>
        r.reviewId === input.reviewId &&
        r.studyId === input.studyId &&
        r.fieldId === input.fieldId,
    );
    this.rows =
      idx === -1
        ? [...this.rows, next]
        : this.rows.map((r, i) => (i === idx ? next : r));
  }

  async appendAudit(entry: ConsensusAuditEntry): Promise<void> {
    this.audits.push(entry);
  }
}
