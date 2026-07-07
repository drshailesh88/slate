import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { auditLog, screeningConflictResolutions } from '@/lib/db/schema/sr';
import type {
  ConflictAuditEntry,
  ConflictStore,
  RecordResolutionInput,
  ResolutionRow,
} from './store';
import type { ResolutionMethod } from './types';

type Database = ReturnType<typeof getDb>;

// ─────────────────────────────────────────────────────────────────────────────
// Neon-http-backed ConflictStore. Each method is a SINGLE statement (neon-http
// has no interactive transactions). A resolution UPSERTS on the unique
// (review, study, stage) key so a re-resolution (e.g. arbitrator overriding an
// earlier align-on-one) replaces the active row; the full history is preserved
// append-only in audit_log.
// ─────────────────────────────────────────────────────────────────────────────

export class DrizzleConflictStore implements ConflictStore {
  constructor(private readonly db: Database = getDb()) {}

  async listResolutions(reviewId: string): Promise<ResolutionRow[]> {
    const rows = await this.db
      .select({
        reviewId: screeningConflictResolutions.reviewId,
        studyId: screeningConflictResolutions.studyId,
        stage: screeningConflictResolutions.stage,
        method: screeningConflictResolutions.method,
        decision: screeningConflictResolutions.decision,
        arbitratorId: screeningConflictResolutions.arbitratorId,
        note: screeningConflictResolutions.note,
        resolvedBy: screeningConflictResolutions.resolvedBy,
        resolvedAt: screeningConflictResolutions.updatedAt,
      })
      .from(screeningConflictResolutions)
      .where(eq(screeningConflictResolutions.reviewId, reviewId));

    return rows.map((r) => ({
      reviewId: r.reviewId,
      studyId: r.studyId,
      stage: r.stage,
      method: r.method as ResolutionMethod,
      decision: r.decision,
      arbitratorId: r.arbitratorId,
      note: r.note,
      resolvedBy: r.resolvedBy,
      resolvedAt: r.resolvedAt,
    }));
  }

  async recordResolution(
    input: RecordResolutionInput,
    now: Date,
  ): Promise<void> {
    await this.db
      .insert(screeningConflictResolutions)
      .values({
        reviewId: input.reviewId,
        studyId: input.studyId,
        stage: input.stage as 'title_abstract' | 'full_text',
        method: input.method,
        decision: input.decision as 'include' | 'exclude' | 'maybe' | null,
        arbitratorId: input.arbitratorId,
        note: input.note,
        resolvedBy: input.resolvedBy,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          screeningConflictResolutions.reviewId,
          screeningConflictResolutions.studyId,
          screeningConflictResolutions.stage,
        ],
        set: {
          method: input.method,
          decision: input.decision as 'include' | 'exclude' | 'maybe' | null,
          arbitratorId: input.arbitratorId,
          note: input.note,
          resolvedBy: input.resolvedBy,
          updatedAt: now,
        },
      });
  }

  async appendAudit(entry: ConflictAuditEntry): Promise<void> {
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
