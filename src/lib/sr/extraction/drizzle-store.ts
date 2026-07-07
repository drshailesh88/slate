import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { auditLog, extractionConsensus } from '@/lib/db/schema/sr';
import type { ExtractionState } from './states';
import type {
  ConsensusAuditEntry,
  ConsensusRow,
  ExtractionConsensusStore,
  UpsertConsensusInput,
} from './store';
import type {
  ExtractionConsensusSource,
  ExtractionResolutionMethod,
} from './types';

type Database = ReturnType<typeof getDb>;

// ─────────────────────────────────────────────────────────────────────────────
// Neon-http-backed ExtractionConsensusStore. Each method is a SINGLE statement
// (neon-http has no interactive transactions). A consensus UPSERTS on the unique
// (review, study, field) key so a re-resolution replaces the active row; the full
// history is preserved append-only in audit_log. This table is NON-blinded and
// SEPARATE from the blinded extraction-entries table — recording a consensus
// never overwrites either reviewer's as-extracted entry (non-neg #8).
// ─────────────────────────────────────────────────────────────────────────────

export class DrizzleExtractionConsensusStore implements ExtractionConsensusStore {
  constructor(private readonly db: Database = getDb()) {}

  async listConsensus(reviewId: string): Promise<ConsensusRow[]> {
    const rows = await this.db
      .select()
      .from(extractionConsensus)
      .where(eq(extractionConsensus.reviewId, reviewId));
    return rows.map(mapRow);
  }

  async getConsensus(
    reviewId: string,
    studyId: string,
    fieldId: string,
  ): Promise<ConsensusRow | null> {
    const [row] = await this.db
      .select()
      .from(extractionConsensus)
      .where(
        and(
          eq(extractionConsensus.reviewId, reviewId),
          eq(extractionConsensus.studyId, studyId),
          eq(extractionConsensus.fieldId, fieldId),
        ),
      )
      .limit(1);
    return row ? mapRow(row) : null;
  }

  async upsertConsensus(input: UpsertConsensusInput, now: Date): Promise<void> {
    await this.db
      .insert(extractionConsensus)
      .values({
        reviewId: input.reviewId,
        studyId: input.studyId,
        fieldId: input.fieldId,
        value: input.value,
        state: input.state,
        source: input.source,
        derived: input.derived,
        derivedFormula: input.derivedFormula,
        provenance: input.provenance,
        resolutionMethod: input.resolutionMethod,
        arbitratorId: input.arbitratorId,
        authorContacted: input.authorContacted,
        authorContactNote: input.authorContactNote,
        resolvedBy: input.resolvedBy,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          extractionConsensus.reviewId,
          extractionConsensus.studyId,
          extractionConsensus.fieldId,
        ],
        set: {
          value: input.value,
          state: input.state,
          source: input.source,
          derived: input.derived,
          derivedFormula: input.derivedFormula,
          provenance: input.provenance,
          resolutionMethod: input.resolutionMethod,
          arbitratorId: input.arbitratorId,
          authorContacted: input.authorContacted,
          authorContactNote: input.authorContactNote,
          resolvedBy: input.resolvedBy,
          updatedAt: now,
        },
      });
  }

  async appendAudit(entry: ConsensusAuditEntry): Promise<void> {
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

function mapRow(row: typeof extractionConsensus.$inferSelect): ConsensusRow {
  return {
    reviewId: row.reviewId,
    studyId: row.studyId,
    fieldId: row.fieldId,
    value: row.value,
    state: row.state as ExtractionState,
    source: row.source as ExtractionConsensusSource,
    derived: row.derived,
    derivedFormula: row.derivedFormula,
    provenance: row.provenance,
    resolutionMethod: row.resolutionMethod as ExtractionResolutionMethod,
    arbitratorId: row.arbitratorId,
    authorContacted: row.authorContacted,
    authorContactNote: row.authorContactNote,
    resolvedBy: row.resolvedBy,
    resolvedAt: row.updatedAt,
  };
}
