import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { reviews, studies } from '@/lib/db/schema/sr';
import { DrizzleExtractionConsensusStore } from '@/lib/sr/extraction/drizzle-store';
import type { ConsensusRow } from '@/lib/sr/extraction/store';
import type { ExportReviewFacts, ExportStore, ExportStudyRow } from './store';

type Database = ReturnType<typeof getDb>;

// Duplicates the importer confidently removed are out of the export pool —
// the same pool rule screening and RoB use.
const REMOVED_DUPE_STATUSES = ['auto_merged', 'merged'] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Neon-http-backed ExportStore. VISIBLE tables only: reviews (facts), studies
// (the reference pool), extraction_consensus (via the T15 store), users
// (display labels). Every read is reviewId-scoped. The blinded datasets never
// come through here — only through the chokepoint's ForExport readers.
// ─────────────────────────────────────────────────────────────────────────────

export class DrizzleExportStore implements ExportStore {
  private readonly consensusStore: DrizzleExtractionConsensusStore;

  constructor(private readonly db: Database = getDb()) {
    this.consensusStore = new DrizzleExtractionConsensusStore(db);
  }

  async getReviewFacts(reviewId: string): Promise<ExportReviewFacts | null> {
    const [row] = await this.db
      .select({
        id: reviews.id,
        title: reviews.title,
        reviewType: reviews.reviewType,
        screeningPhase: reviews.screeningPhase,
        extractionPhase: reviews.extractionPhase,
        robPhase: reviews.robPhase,
      })
      .from(reviews)
      .where(eq(reviews.id, reviewId))
      .limit(1);
    return row ?? null;
  }

  async listStudies(reviewId: string): Promise<ExportStudyRow[]> {
    return this.db
      .select({
        id: studies.id,
        title: studies.title,
        abstract: studies.abstract,
        authors: studies.authors,
        journal: studies.journal,
        year: studies.year,
        doi: studies.doi,
        externalId: studies.externalId,
      })
      .from(studies)
      .where(
        and(
          eq(studies.reviewId, reviewId),
          notInArray(studies.dupeStatus, [...REMOVED_DUPE_STATUSES]),
        ),
      )
      .orderBy(studies.createdAt);
  }

  async listConsensus(reviewId: string): Promise<ConsensusRow[]> {
    return this.consensusStore.listConsensus(reviewId);
  }

  async listUserLabels(
    userIds: readonly string[],
  ): Promise<Map<string, string>> {
    const labels = new Map<string, string>();
    if (userIds.length === 0) return labels;
    const rows = await this.db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(inArray(users.id, [...userIds]));
    for (const row of rows) {
      labels.set(row.id, row.name ?? row.email ?? 'Reviewer');
    }
    return labels;
  }
}
