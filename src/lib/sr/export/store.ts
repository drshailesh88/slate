import type { ConsensusRow } from '@/lib/sr/extraction/store';

// ─────────────────────────────────────────────────────────────────────────────
// Read port for the export assembler's VISIBLE data (review facts, the study
// pool, the consensus table, user display labels). The blinded datasets do NOT
// come through this port — they come only through the chokepoint's ForExport
// readers (src/lib/sr/authz/blinded-read.ts), which read the authoritative
// phase themselves. The port keeps the assembler unit-testable with an
// in-memory fake; the neon-http impl lives in ./drizzle-store.ts.
// ─────────────────────────────────────────────────────────────────────────────

export interface ExportReviewFacts {
  id: string;
  title: string;
  reviewType: string;
  screeningPhase: string;
  extractionPhase: string;
  robPhase: string;
}

export interface ExportStudyRow {
  id: string;
  title: string;
  abstract: string | null;
  authors: string | null;
  journal: string | null;
  year: number | null;
  doi: string | null;
  externalId: string | null;
}

export interface ExportStore {
  getReviewFacts(reviewId: string): Promise<ExportReviewFacts | null>;
  /** The study pool (removed duplicates excluded), reviewId-scoped. */
  listStudies(reviewId: string): Promise<ExportStudyRow[]>;
  /** Every recorded consensus row for the review (visible table). */
  listConsensus(reviewId: string): Promise<ConsensusRow[]>;
  /** Display labels (name, else email) for internal user ids. */
  listUserLabels(userIds: readonly string[]): Promise<Map<string, string>>;
}

// In-memory fake for tests.
export class InMemoryExportStore implements ExportStore {
  constructor(
    private readonly data: {
      facts?: ExportReviewFacts | null;
      studies?: ExportStudyRow[];
      consensus?: ConsensusRow[];
      userLabels?: Record<string, string>;
    } = {},
  ) {}

  async getReviewFacts(reviewId: string): Promise<ExportReviewFacts | null> {
    const facts = this.data.facts ?? null;
    return facts && facts.id === reviewId ? { ...facts } : null;
  }

  async listStudies(reviewId: string): Promise<ExportStudyRow[]> {
    void reviewId;
    return (this.data.studies ?? []).map((s) => ({ ...s }));
  }

  async listConsensus(reviewId: string): Promise<ConsensusRow[]> {
    return (this.data.consensus ?? [])
      .filter((r) => r.reviewId === reviewId)
      .map((r) => ({ ...r }));
  }

  async listUserLabels(
    userIds: readonly string[],
  ): Promise<Map<string, string>> {
    const labels = new Map<string, string>();
    for (const id of userIds) {
      const label = this.data.userLabels?.[id];
      if (label) labels.set(id, label);
    }
    return labels;
  }
}
