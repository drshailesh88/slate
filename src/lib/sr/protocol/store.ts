import type { ProtocolContent } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Persistence port for the protocol version ledger.
//
// The service (service.ts) depends only on this interface, so the versioning
// state machine — draft → lock → dated amendments, history preserved — is
// exercised with an in-memory fake and no database. The Drizzle/neon-http
// implementation lives in ./drizzle-store.ts. Because neon-http has no
// interactive transactions, every write below is a SINGLE statement; the service
// composes them in a crash-recoverable order (append the version, then no more).
// ─────────────────────────────────────────────────────────────────────────────

/** A persisted protocol row: the single draft (version null) or a locked version. */
export interface ProtocolRow {
  reviewId: string;
  /** null = the working draft; 1..N = an immutable locked version. */
  version: number | null;
  researchQuestion: string;
  pico: ProtocolContent['pico'];
  criteria: ProtocolContent['criteria'];
  reason: string | null;
  lockedAt: Date | null;
  lockedBy: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** An append-only audit entry (who/what/when/before/after) — see auditLog. */
export interface ProtocolAuditEntry {
  reviewId: string;
  actorId: string | null;
  action: string;
  target: string;
  before: unknown;
  after: unknown;
}

export interface LockStamp {
  version: number;
  lockedAt: Date;
  lockedBy: string;
}

export interface ProtocolStore {
  /** All rows for the review — the single draft plus every locked version. */
  listRows(reviewId: string): Promise<ProtocolRow[]>;
  /** Insert the working draft (version null). At most one exists per review. */
  insertDraft(input: {
    reviewId: string;
    content: ProtocolContent;
    actorId: string | null;
    now: Date;
  }): Promise<void>;
  /** Overwrite the working draft's content in place (WHERE version IS NULL). */
  updateDraft(input: {
    reviewId: string;
    content: ProtocolContent;
    now: Date;
  }): Promise<void>;
  /** Promote the draft to version 1: write content + lock stamp in one update. */
  promoteDraft(input: {
    reviewId: string;
    content: ProtocolContent;
    stamp: LockStamp;
  }): Promise<void>;
  /** Insert an immutable locked version (v1 baseline with no draft, or an amendment). */
  insertVersion(input: {
    reviewId: string;
    content: ProtocolContent;
    stamp: LockStamp;
    reason: string | null;
    actorId: string | null;
  }): Promise<void>;
  /** Append an audit entry. Never updates or deletes. */
  appendAudit(entry: ProtocolAuditEntry): Promise<void>;
}

// In-memory fake for tests: single-statement semantics, deterministic ordering.
export class InMemoryProtocolStore implements ProtocolStore {
  private rows: ProtocolRow[] = [];
  readonly audits: ProtocolAuditEntry[] = [];

  async listRows(reviewId: string): Promise<ProtocolRow[]> {
    return this.rows
      .filter((r) => r.reviewId === reviewId)
      .map((r) => ({ ...r, pico: { ...r.pico }, criteria: [...r.criteria] }));
  }

  async insertDraft({
    reviewId,
    content,
    actorId,
    now,
  }: {
    reviewId: string;
    content: ProtocolContent;
    actorId: string | null;
    now: Date;
  }): Promise<void> {
    if (this.rows.some((r) => r.reviewId === reviewId && r.version === null)) {
      throw new Error('protocol_versions_one_draft_idx violation (fake)');
    }
    this.rows = [
      ...this.rows,
      {
        reviewId,
        version: null,
        researchQuestion: content.researchQuestion,
        pico: { ...content.pico },
        criteria: [...content.criteria],
        reason: null,
        lockedAt: null,
        lockedBy: null,
        createdBy: actorId,
        createdAt: now,
        updatedAt: now,
      },
    ];
  }

  async updateDraft({
    reviewId,
    content,
    now,
  }: {
    reviewId: string;
    content: ProtocolContent;
    now: Date;
  }): Promise<void> {
    this.rows = this.rows.map((r) =>
      r.reviewId === reviewId && r.version === null
        ? {
            ...r,
            researchQuestion: content.researchQuestion,
            pico: { ...content.pico },
            criteria: [...content.criteria],
            updatedAt: now,
          }
        : r,
    );
  }

  async promoteDraft({
    reviewId,
    content,
    stamp,
  }: {
    reviewId: string;
    content: ProtocolContent;
    stamp: LockStamp;
  }): Promise<void> {
    this.rows = this.rows.map((r) =>
      r.reviewId === reviewId && r.version === null
        ? {
            ...r,
            version: stamp.version,
            researchQuestion: content.researchQuestion,
            pico: { ...content.pico },
            criteria: [...content.criteria],
            lockedAt: stamp.lockedAt,
            lockedBy: stamp.lockedBy,
            updatedAt: stamp.lockedAt,
          }
        : r,
    );
  }

  async insertVersion({
    reviewId,
    content,
    stamp,
    reason,
    actorId,
  }: {
    reviewId: string;
    content: ProtocolContent;
    stamp: LockStamp;
    reason: string | null;
    actorId: string | null;
  }): Promise<void> {
    if (
      this.rows.some(
        (r) => r.reviewId === reviewId && r.version === stamp.version,
      )
    ) {
      throw new Error(
        'protocol_versions_review_version_unique violation (fake)',
      );
    }
    this.rows = [
      ...this.rows,
      {
        reviewId,
        version: stamp.version,
        researchQuestion: content.researchQuestion,
        pico: { ...content.pico },
        criteria: [...content.criteria],
        reason,
        lockedAt: stamp.lockedAt,
        lockedBy: stamp.lockedBy,
        createdBy: actorId,
        createdAt: stamp.lockedAt,
        updatedAt: stamp.lockedAt,
      },
    ];
  }

  async appendAudit(entry: ProtocolAuditEntry): Promise<void> {
    this.audits.push(entry);
  }
}
