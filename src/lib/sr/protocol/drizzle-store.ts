import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { auditLog, protocolVersions } from '@/lib/db/schema/sr';
import type { ProtocolContent } from './types';
import type {
  LockStamp,
  ProtocolAuditEntry,
  ProtocolRow,
  ProtocolStore,
} from './store';

type Database = ReturnType<typeof getDb>;

// ─────────────────────────────────────────────────────────────────────────────
// Neon-http-backed ProtocolStore. The neon-http driver runs each statement as
// its own request (no interactive transactions), so every method here is a
// SINGLE statement. The draft is the one row with version IS NULL; locked
// versions are append-only and never updated.
// ─────────────────────────────────────────────────────────────────────────────

export class DrizzleProtocolStore implements ProtocolStore {
  constructor(private readonly db: Database = getDb()) {}

  async listRows(reviewId: string): Promise<ProtocolRow[]> {
    const rows = await this.db
      .select({
        reviewId: protocolVersions.reviewId,
        version: protocolVersions.version,
        researchQuestion: protocolVersions.researchQuestion,
        pico: protocolVersions.pico,
        criteria: protocolVersions.criteria,
        reason: protocolVersions.reason,
        lockedAt: protocolVersions.lockedAt,
        lockedBy: protocolVersions.lockedBy,
        createdBy: protocolVersions.createdBy,
        createdAt: protocolVersions.createdAt,
        updatedAt: protocolVersions.updatedAt,
      })
      .from(protocolVersions)
      .where(eq(protocolVersions.reviewId, reviewId));
    return rows;
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
    await this.db.insert(protocolVersions).values({
      reviewId,
      version: null,
      researchQuestion: content.researchQuestion,
      pico: content.pico,
      criteria: content.criteria,
      createdBy: actorId,
      createdAt: now,
      updatedAt: now,
    });
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
    await this.db
      .update(protocolVersions)
      .set({
        researchQuestion: content.researchQuestion,
        pico: content.pico,
        criteria: content.criteria,
        updatedAt: now,
      })
      .where(
        and(
          eq(protocolVersions.reviewId, reviewId),
          isNull(protocolVersions.version),
        ),
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
    await this.db
      .update(protocolVersions)
      .set({
        version: stamp.version,
        researchQuestion: content.researchQuestion,
        pico: content.pico,
        criteria: content.criteria,
        lockedAt: stamp.lockedAt,
        lockedBy: stamp.lockedBy,
        updatedAt: stamp.lockedAt,
      })
      .where(
        and(
          eq(protocolVersions.reviewId, reviewId),
          isNull(protocolVersions.version),
        ),
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
    await this.db.insert(protocolVersions).values({
      reviewId,
      version: stamp.version,
      researchQuestion: content.researchQuestion,
      pico: content.pico,
      criteria: content.criteria,
      reason,
      lockedAt: stamp.lockedAt,
      lockedBy: stamp.lockedBy,
      createdBy: actorId,
      createdAt: stamp.lockedAt,
      updatedAt: stamp.lockedAt,
    });
  }

  async appendAudit(entry: ProtocolAuditEntry): Promise<void> {
    await this.db.insert(auditLog).values({
      reviewId: entry.reviewId,
      actorId: entry.actorId,
      action: entry.action,
      target: entry.target,
      before: entry.before,
      after: entry.after,
    });
  }
}
