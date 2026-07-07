// ─────────────────────────────────────────────────────────────────────────────
// Export (T19) domain types — PURE TYPES, no runtime imports.
//
// The bundle is the single serializable shape every format builder (RevMan /
// RIS / CSV / PDF) renders from. Two science invariants are encoded here:
//   • The reconciled CONSENSUS dataset and each reviewer's original AS-EXTRACTED
//     entries are SEPARATE fields with distinct row types — the consensus can
//     never silently replace the originals (non-neg #8).
//   • A blinded dataset is either `ready` (post-unblind, through the chokepoint)
//     or `withheld` with an honest reason — never silently empty. During
//     `independent` only consensus + non-blinded data can be `ready`.
// Rows keep provenance, the four explicit states, and the derived flag — a
// blank is never a zero.
// ─────────────────────────────────────────────────────────────────────────────

import type { ExtractionState } from '@/lib/sr/extraction/states';
import type {
  ExtractionConsensusSource,
  ExtractionResolutionMethod,
  ProvenanceDTO,
} from '@/lib/sr/extraction/types';

export type ExportFormat = 'revman' | 'ris' | 'csv' | 'pdf';

export type ExportDatasetId =
  'references' | 'consensus' | 'as_extracted' | 'rob' | 'screening';

export interface ExportReviewMeta {
  id: string;
  title: string;
  reviewType: string;
  screeningPhase: string;
  extractionPhase: string;
  robPhase: string;
}

// One study reference (non-blinded — sourced from `studies`).
export interface ExportStudyRef {
  id: string;
  refId: string;
  title: string;
  abstract: string | null;
  authors: string | null;
  journal: string | null;
  year: number | null;
  doi: string | null;
  externalId: string | null;
}

// One reconciled value — the CONSENSUS dataset (visible `extraction_consensus`).
export interface ConsensusExportRow {
  studyId: string;
  studyTitle: string;
  fieldId: string;
  fieldLabel: string;
  value: string | null;
  state: ExtractionState;
  derived: boolean;
  derivedFormula: string | null;
  provenance: ProvenanceDTO | null;
  source: ExtractionConsensusSource;
  resolutionMethod: ExtractionResolutionMethod;
  authorContacted: boolean;
  authorContactNote: string | null;
  resolvedByLabel: string;
}

// One reviewer's ORIGINAL entry — the AS-EXTRACTED dataset (blinded table,
// through the chokepoint, reconcile-gated). Never merged into consensus rows.
export interface AsExtractedExportRow {
  studyId: string;
  studyTitle: string;
  fieldId: string;
  fieldLabel: string;
  reviewerLabel: string;
  isAi: boolean;
  value: string | null;
  state: ExtractionState;
  derived: boolean;
  derivedFormula: string | null;
  provenance: ProvenanceDTO | null;
}

export interface RobExportRow {
  studyId: string;
  studyTitle: string;
  reviewerLabel: string;
  isAi: boolean;
  domainId: string;
  judgement: string;
  supportQuote: string | null;
}

export interface ScreeningExportRow {
  studyId: string;
  studyTitle: string;
  reviewerLabel: string;
  isAi: boolean;
  stage: string;
  decision: string;
  excludeReasonCode: string | null;
  excludeReasonDetail: string | null;
}

// A blinded-sourced dataset: present in full, or withheld with the honest
// reason — never silently empty.
export type ExportSection<T> =
  { status: 'ready'; rows: T[] } | { status: 'withheld'; reason: string };

export interface ExportBundle {
  review: ExportReviewMeta;
  generatedAt: string;
  studies: ExportStudyRef[];
  /** The reconciled consensus dataset (non-blinded table; always readable). */
  consensus: ConsensusExportRow[];
  /** Each reviewer's original entries — SEPARATE from consensus, labeled. */
  asExtracted: ExportSection<AsExtractedExportRow>;
  rob: ExportSection<RobExportRow>;
  screening: ExportSection<ScreeningExportRow>;
}

// ── The screen DTO (what the page hands the client): availability + counts,
// never the rows themselves — downloads go through the API route. ────────────
export interface ExportSectionSummary {
  status: 'ready' | 'withheld';
  count: number;
  reason: string | null;
}

export interface ExportViewDTO {
  reviewId: string;
  reviewTitle: string;
  reviewType: string;
  studyCount: number;
  consensusCount: number;
  asExtracted: ExportSectionSummary;
  rob: ExportSectionSummary;
  screening: ExportSectionSummary;
}
