import type { ResolutionMethod } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Persistence port for screening conflict resolutions.
//
// The service depends only on this interface, so the no-auto-resolve state
// machine is exercised with an in-memory fake and no database. The neon-http
// implementation lives in ./drizzle-store.ts. neon-http has no interactive
// transactions, so every write is a SINGLE statement; the service composes them
// in a crash-recoverable order (record the resolution, then append the audit).
// ─────────────────────────────────────────────────────────────────────────────

export interface ResolutionRow {
  reviewId: string;
  studyId: string;
  stage: string;
  method: ResolutionMethod;
  // The picked call for `align_on_one`; null when sent to an arbitrator.
  decision: string | null;
  arbitratorId: string | null;
  note: string | null;
  // The human who recorded it — never null (no auto-resolve).
  resolvedBy: string;
  resolvedAt: Date;
}

export interface RecordResolutionInput {
  reviewId: string;
  studyId: string;
  stage: string;
  method: ResolutionMethod;
  decision: string | null;
  arbitratorId: string | null;
  note: string | null;
  resolvedBy: string;
}

// An append-only audit entry (who/what/when/before/after) — see auditLog.
export interface ConflictAuditEntry {
  reviewId: string;
  actorId: string | null;
  action: string;
  target: string;
  before: unknown;
  after: unknown;
}

export interface ConflictStore {
  /** Every recorded resolution for the review (one per study/stage). */
  listResolutions(reviewId: string): Promise<ResolutionRow[]>;
  /** Upsert the resolution for (reviewId, studyId, stage). */
  recordResolution(input: RecordResolutionInput, now: Date): Promise<void>;
  /** Append an audit entry. Never updates or deletes. */
  appendAudit(entry: ConflictAuditEntry): Promise<void>;
}

// In-memory fake for tests: single-statement semantics, deterministic ordering.
export class InMemoryConflictStore implements ConflictStore {
  private rows: ResolutionRow[] = [];
  readonly audits: ConflictAuditEntry[] = [];

  async listResolutions(reviewId: string): Promise<ResolutionRow[]> {
    return this.rows
      .filter((r) => r.reviewId === reviewId)
      .map((r) => ({ ...r }));
  }

  async recordResolution(
    input: RecordResolutionInput,
    now: Date,
  ): Promise<void> {
    const next: ResolutionRow = { ...input, resolvedAt: now };
    const idx = this.rows.findIndex(
      (r) =>
        r.reviewId === input.reviewId &&
        r.studyId === input.studyId &&
        r.stage === input.stage,
    );
    this.rows =
      idx === -1
        ? [...this.rows, next]
        : this.rows.map((r, i) => (i === idx ? next : r));
  }

  async appendAudit(entry: ConflictAuditEntry): Promise<void> {
    this.audits.push(entry);
  }
}
