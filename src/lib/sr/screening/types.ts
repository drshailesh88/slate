// ─────────────────────────────────────────────────────────────────────────────
// Screening (T12) domain + view types — PURE TYPES, no runtime imports.
//
// These are the serializable shapes the server data seam (page.tsx) hands to the
// client screen across the RSC → client boundary. By construction they carry
// ONLY the caller's own decisions: there is no field here that could hold a
// co-reviewer's vote, the AI's verdict, or an AI relevance score. The blinding is
// server-enforced upstream (the chokepoint), and this type shape is the second
// wall — the screen literally cannot render what it is never handed.
// ─────────────────────────────────────────────────────────────────────────────

import type { ScreeningStage } from './stage';

export type ScreeningDecisionKind = 'include' | 'maybe' | 'exclude';

// One screenable reference (non-blinded — sourced from `studies`).
export interface ScreeningStudyDTO {
  id: string;
  /** Short human display id (external id, else a positional #). */
  refId: string;
  title: string;
  authors: string | null;
  journal: string | null;
  year: number | null;
  doi: string | null;
  abstract: string | null;
}

// The caller's OWN decision on a study. There is deliberately no `reviewerId`
// here — the whole set belongs to the caller — and no way to express another
// reviewer's or the AI's call.
export interface OwnDecisionDTO {
  studyId: string;
  decision: ScreeningDecisionKind;
  excludeReasonCode: string | null;
  excludeReasonDetail: string | null;
  /** True once the reviewer has finished screening (their rows are locked). */
  locked: boolean;
}

// One eligibility criterion, flattened for the checklist (from the protocol).
export interface ScreeningCriterionDTO {
  id: string;
  label: string;
  instruction: string;
}

export interface ScreeningCriteriaDTO {
  include: ScreeningCriterionDTO[];
  exclude: ScreeningCriterionDTO[];
}

export interface HighlightTermsDTO {
  include: string[];
  exclude: string[];
}

// Blinding-safe completion counts for the screening surface (from the chokepoint
// getSafeProgress). Integers only — never a decision distribution.
export interface ScreeningProgressDTO {
  finishedReviewers: number;
  totalReviewers: number;
}

// Everything the screen renders. `phase` is resolved SERVER-SIDE from
// `reviews.screening_phase` — never trusted from the client. During
// `independent`, `decisions` holds only the caller's own calls; at `reconcile`
// the screen shows the hand-off state and carries no decisions at all.
export interface ScreeningViewDTO {
  reviewId: string;
  reviewTitle: string;
  reviewType: string;
  phase: 'independent' | 'reconcile';
  stage: ScreeningStage;
  stageLabel: string;
  /** Caller's live role can cast decisions (reviewer / collaborator). */
  canScreen: boolean;
  /** Caller can trigger the one-way unblind (owner only). */
  canUnblind: boolean;
  /** Caller has finished screening (their own decisions are locked). */
  finished: boolean;
  studies: ScreeningStudyDTO[];
  decisions: OwnDecisionDTO[];
  criteria: ScreeningCriteriaDTO;
  highlightTerms: HighlightTermsDTO;
  /**
   * A NON-blinded study-id ordering for the optional "AI-suggested order" toggle.
   * `null` when no non-blinded ranking source exists (the AI reviewer + its
   * prioritization land in T14). The AI's blinded relevance SCORE is never read
   * here — ordering the queue by it would be a side channel on the verdict.
   */
  aiRanking: string[] | null;
  progress: ScreeningProgressDTO;
}
