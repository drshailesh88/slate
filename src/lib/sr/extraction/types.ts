// ─────────────────────────────────────────────────────────────────────────────
// Extraction (T15) domain + view types — PURE TYPES, no runtime imports.
//
// These are the serializable shapes the server data seam hands the client across
// the RSC → client boundary. By construction the INDEPENDENT view carries ONLY
// the caller's own entries: no field here can hold a co-reviewer's value or the
// AI's during independent extraction. The blinding is server-enforced upstream
// (the chokepoint); this shape is the second wall.
// ─────────────────────────────────────────────────────────────────────────────

import type { ExtractionSectionDef } from './fields';
import type { FinalCell } from './resolve-final';
import type { ExtractionState } from './states';

export type ExtractionResolutionMethod =
  'discuss' | 'arbitrator' | 'author_contact' | 'unresolved';

export type ExtractionConsensusSource =
  'reviewer1' | 'reviewer2' | 'ai' | 'typed';

// Source report + page/table/figure for a value (non-neg #6). Free-form but
// structured; `null`/absent fields render as a designed dashed provenance, never
// a blank claim of provenance.
export interface ProvenanceDTO {
  reportId?: string | null;
  page?: string | null;
  locator?: string | null;
}

// One included study to extract from (non-blinded — sourced from `studies`).
export interface ExtractionStudyDTO {
  id: string;
  refId: string;
  title: string;
  authors: string | null;
  journal: string | null;
  year: number | null;
  doi: string | null;
}

// ── Phase 1 (independent) — the caller's OWN entry for a field. There is
// deliberately no `reviewerId`, no partner value, no AI value here. ────────────
export interface OwnEntryDTO {
  studyId: string;
  fieldId: string;
  value: string | null;
  state: ExtractionState;
  derived: boolean;
  derivedFormula: string | null;
  provenance: ProvenanceDTO | null;
  /** True once the reviewer has locked (finished) their extraction. */
  locked: boolean;
}

// ── Phase 2 (reconcile) — one input to a field, shown at EQUAL weight. Used for
// both human reviewers and (labeled) the AI. ──────────────────────────────────
export interface ReconcileEntryDTO {
  /** Positional label within the study: 'reviewer1' | 'reviewer2' | 'ai'. */
  slot: ExtractionConsensusSource;
  reviewerName: string | null;
  isAi: boolean;
  value: string | null;
  state: ExtractionState;
  derived: boolean;
  derivedFormula: string | null;
  provenance: ProvenanceDTO | null;
  /** The AI's source passage — the reveal that unlocks the AI value (non-neg #5). */
  sourceQuote: string | null;
}

// The recorded ladder + consensus for a field (present once a human has acted).
export interface FieldConsensusDTO {
  source: ExtractionConsensusSource;
  value: string | null;
  state: ExtractionState;
  derived: boolean;
  derivedFormula: string | null;
  resolutionMethod: ExtractionResolutionMethod;
  arbitratorName: string | null;
  authorContacted: boolean;
  authorContactNote: string | null;
  resolvedByName: string | null;
}

// One field in the reconcile grid — both reviewers + the labeled AI, the Final
// cell (empty until a human picks), and any recorded consensus/ladder.
export interface ReconcileFieldDTO {
  fieldId: string;
  label: string;
  section: string;
  critical: boolean;
  reviewer1: ReconcileEntryDTO | null;
  reviewer2: ReconcileEntryDTO | null;
  ai: ReconcileEntryDTO | null;
  final: FinalCell;
  agreed: boolean;
  conflict: boolean;
  /** Agreed critical field sampled for a QC re-check (non-neg #9). */
  qcFlagged: boolean;
  consensus: FieldConsensusDTO | null;
}

export interface ReconcileStudyDTO {
  study: ExtractionStudyDTO;
  fields: ReconcileFieldDTO[];
  /** Fields still needing human attention (open conflicts + QC-flagged agreed). */
  fieldsToVerify: number;
}

export interface ExtractionProgressDTO {
  finishedReviewers: number;
  totalReviewers: number;
}

export interface EligibleArbitratorDTO {
  userId: string;
  name: string | null;
}

interface ExtractionViewBase {
  reviewId: string;
  reviewTitle: string;
  reviewType: string;
  /** Caller's live role can extract (reviewer / collaborator). */
  canExtract: boolean;
  /** Caller can trigger the one-way unblind (owner only). */
  canUnblind: boolean;
  sections: ExtractionSectionDef[];
  progress: ExtractionProgressDTO;
}

// Phase 1 — independent extraction. Carries ONLY the caller's own entries.
export interface IndependentExtractionViewDTO extends ExtractionViewBase {
  phase: 'independent';
  studies: ExtractionStudyDTO[];
  ownEntries: OwnEntryDTO[];
  /** The caller has locked their extraction. */
  finished: boolean;
}

// Phase 2 — reconciliation. Both reviewers + labeled AI, at reconcile only.
export interface ReconcileExtractionViewDTO extends ExtractionViewBase {
  phase: 'reconcile';
  qcSampleRate: number;
  studies: ReconcileStudyDTO[];
  fieldsToVerify: number;
  canResolve: boolean;
  eligibleArbitrators: EligibleArbitratorDTO[];
}

export type ExtractionViewDTO =
  IndependentExtractionViewDTO | ReconcileExtractionViewDTO;

// ── The untrusted payloads the server actions receive from the client. ────────
export interface SaveEntryInput {
  studyId: string;
  fieldId: string;
  value?: string | null;
  state: ExtractionState;
  derived?: boolean;
  derivedFormula?: string | null;
  provenance?: ProvenanceDTO | null;
}

// The ladder method (discuss vs arbitrator) is derived SERVER-SIDE from the
// actor's live role — an arbitrator resolving a field records it as arbitration
// (independence asserted); anyone else records a discussion. The client never
// asserts which rung it is.
export interface ResolveFieldInput {
  studyId: string;
  fieldId: string;
  source: ExtractionConsensusSource;
  value?: string | null;
  state: ExtractionState;
  derived?: boolean;
  derivedFormula?: string | null;
  provenance?: ProvenanceDTO | null;
}

export interface LogAuthorContactInput {
  studyId: string;
  fieldId: string;
  contacted: boolean;
  note: string;
}

export interface LeaveUnresolvedInput {
  studyId: string;
  fieldId: string;
  authorContacted: boolean;
  rationale: string;
}

export type ExtractionActionResult =
  { ok: true } | { ok: false; message: string; code: string };
