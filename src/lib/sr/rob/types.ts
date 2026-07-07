// ─────────────────────────────────────────────────────────────────────────────
// Risk-of-Bias (T16) domain + view types — PURE TYPES, no runtime imports.
//
// These are the serializable shapes the server data seam (page.tsx) hands to the
// client screen across the RSC → client boundary. During `independent` they carry
// ONLY the caller's own domain judgements: there is no field that could hold a
// co-reviewer's judgement or the AI reviewer's suggestion. The blinding is
// server-enforced upstream (the chokepoint returns own-only), and this type shape
// is the second wall — the screen literally cannot render what it is never handed.
//
// At `reconcile` the DTO gains the reveal: every reviewer's judgement plus the AI
// reviewer's suggestion (labeled, overridable, never pre-selected).
// ─────────────────────────────────────────────────────────────────────────────

import type { RobInstrument, RobJudgement } from './domains';

export type { RobInstrument, RobJudgement } from './domains';

// One instrument domain, flattened for the grid (name + signalling questions).
export interface RobDomainMetaDTO {
  id: string;
  name: string;
  signalling: string[];
}

// One included study to appraise (non-blinded — sourced from `studies`).
export interface RobStudyDTO {
  id: string;
  /** Short human display id (external id, else a positional #). */
  refId: string;
  title: string;
  authors: string | null;
  journal: string | null;
  year: number | null;
  doi: string | null;
  instrument: RobInstrument;
  instrumentLabel: string;
  /** The instrument's domains, in order. */
  domains: RobDomainMetaDTO[];
  /**
   * Overall roll-up. During `independent` it is the CALLER'S OWN roll-up (over
   * their own domain judgements); at `reconcile` it is the reconciled/consensus
   * roll-up. It never mixes another reviewer's judgements during independent.
   */
  overall: RobJudgement;
}

// The caller's OWN judgement for one (study, domain). There is deliberately no
// `reviewerId` — the whole set belongs to the caller — and no way to express
// another reviewer's or the AI's judgement.
export interface OwnDomainJudgementDTO {
  studyId: string;
  domainId: string;
  judgement: RobJudgement;
  /** Evidence for the judgement (provenance). Required when a judgement is set. */
  supportQuote: string | null;
  /** True once the reviewer has finished appraising (their rows are locked). */
  locked: boolean;
}

// ── Reconcile-only shapes (post-firewall) ────────────────────────────────────

// One reviewer's (or the AI's) judgement for a domain, shown at equal weight.
export interface RobReviewerJudgementDTO {
  /** Display label for the author (reviewer name, or "AI reviewer"). */
  authorLabel: string;
  /** The AI's suggestion is labeled + overridable; a human confirms it. */
  isAi: boolean;
  judgement: RobJudgement;
  supportQuote: string | null;
}

export interface RobReconcileDomainDTO {
  domainId: string;
  name: string;
  /** Every reviewer's judgement + the AI's suggestion (labeled), equal weight. */
  entries: RobReviewerJudgementDTO[];
  /** The reconciled call, once a human has recorded it; null until then. */
  consensus: RobJudgement | null;
  consensusSupportQuote: string | null;
}

export interface RobReconcileStudyDTO {
  studyId: string;
  domains: RobReconcileDomainDTO[];
}

// Blinding-safe completion counts for the RoB surface (from the chokepoint's
// getSafeProgress). Integers only — never a judgement distribution.
export interface RobProgressDTO {
  finishedReviewers: number;
  totalReviewers: number;
}

// Everything the screen renders. `phase` is resolved SERVER-SIDE from
// `reviews.rob_phase` — never trusted from the client. During `independent`,
// `judgements` holds only the caller's own calls and `reconciliation` is empty;
// at `reconcile` the reveal (all reviewers + the AI's labeled suggestion) fills
// `reconciliation`.
export interface RobViewDTO {
  reviewId: string;
  reviewTitle: string;
  reviewType: string;
  phase: 'independent' | 'reconcile';
  /** Caller's live role can cast independent judgements (reviewer / collaborator). */
  canAppraise: boolean;
  /** Caller can record the reconciled judgement after unblind (owner / arbitrator). */
  canReconcile: boolean;
  /** Caller can trigger the one-way unblind (owner only). */
  canUnblind: boolean;
  /** Caller has finished appraising (their own judgements are locked). */
  finished: boolean;
  studies: RobStudyDTO[];
  /** Own domain judgements during `independent`; empty at `reconcile`. */
  judgements: OwnDomainJudgementDTO[];
  /** Per-study reconcile reveal during `reconcile`; empty during `independent`. */
  reconciliation: RobReconcileStudyDTO[];
  progress: RobProgressDTO;
}
