// ─────────────────────────────────────────────────────────────────────────────
// Drizzle/neon-http implementation of the ImportStore port (T9).
//
// neon-http runs each statement as its own request (no interactive
// transactions); every method here is a single statement whose effect is
// reversible and idempotent at the service layer. Reads are ALWAYS scoped by
// reviewId (IDOR defense) — a foreign id resolves to null.
// ─────────────────────────────────────────────────────────────────────────────

import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { auditLog, importBatches, studies } from '@/lib/db/schema/sr';
import type {
  AuditInput,
  BatchRow,
  ImportStore,
  NewBatchInput,
  NewStudyInput,
  StudyDupeUpdate,
  StudyRow,
} from './import-store';

type Database = ReturnType<typeof getDb>;

export class DrizzleImportStore implements ImportStore {
  constructor(private readonly db: Database = getDb()) {}

  async listBatches(reviewId: string): Promise<BatchRow[]> {
    return this.db
      .select()
      .from(importBatches)
      .where(eq(importBatches.reviewId, reviewId))
      .orderBy(asc(importBatches.createdAt));
  }

  async listStudies(reviewId: string): Promise<StudyRow[]> {
    return this.db
      .select()
      .from(studies)
      .where(eq(studies.reviewId, reviewId))
      .orderBy(asc(studies.createdAt));
  }

  async getBatch(reviewId: string, batchId: string): Promise<BatchRow | null> {
    const [row] = await this.db
      .select()
      .from(importBatches)
      .where(
        and(
          eq(importBatches.id, batchId),
          eq(importBatches.reviewId, reviewId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async getStudy(reviewId: string, studyId: string): Promise<StudyRow | null> {
    const [row] = await this.db
      .select()
      .from(studies)
      .where(and(eq(studies.id, studyId), eq(studies.reviewId, reviewId)))
      .limit(1);
    return row ?? null;
  }

  async insertBatch(batch: NewBatchInput): Promise<BatchRow> {
    const [row] = await this.db.insert(importBatches).values(batch).returning();
    return row;
  }

  async insertStudies(rows: NewStudyInput[]): Promise<void> {
    if (rows.length === 0) return;
    await this.db.insert(studies).values(rows);
  }

  async updateStudyDupe(
    studyId: string,
    update: StudyDupeUpdate,
  ): Promise<void> {
    await this.db.update(studies).set(update).where(eq(studies.id, studyId));
  }

  async setBatchUndone(batchId: string, undoneAt: Date | null): Promise<void> {
    await this.db
      .update(importBatches)
      .set({ undoneAt })
      .where(eq(importBatches.id, batchId));
  }

  async appendAudit(entry: AuditInput): Promise<void> {
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
