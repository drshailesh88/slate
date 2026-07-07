// ─────────────────────────────────────────────────────────────────────────────
// Protocol (SR1) domain types — the PICO + eligibility-criteria shapes.
//
// Ported near-verbatim from the ScholarSync precursor (src/lib/sr/types.ts). This
// module is PURE TYPES with no runtime imports, so the DB schema can reference
// the JSONB payload shapes through an erased `import type` without a cycle.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Elicit's "column-as-a-question" output shape. Eligibility criteria are
 * `yes_no_maybe`; extraction columns may be free text or a controlled list.
 */
export type AnswerStructure = 'any' | 'specified' | 'yes_no_maybe';

/** One eligibility criterion — a screening question the AI evaluates. */
export interface EligibilityCriterion {
  id: string;
  kind: 'include' | 'exclude';
  label: string;
  /** Natural-language instruction the AI screens against (Elicit primitive). */
  instruction: string;
  answerStructure: AnswerStructure;
}

/** The five PICO(S) fields, AI-drafted from the research question. */
export interface Pico {
  population: string;
  intervention: string;
  comparator: string;
  outcome: string;
  studyDesign: string;
}

/** The editable body of a protocol: research question + PICO + criteria. */
export interface ProtocolContent {
  researchQuestion: string;
  pico: Pico;
  criteria: EligibilityCriterion[];
}

// ── View types (what the screen renders) ─────────────────────────────────────

/** empty = nothing saved · draft = editable · locked = frozen (v1+, amendable). */
export type ProtocolStatus = 'empty' | 'draft' | 'locked';

/** One immutable, dated entry in the amendment ledger (v1 baseline + amendments). */
export interface ProtocolVersion {
  version: number;
  content: ProtocolContent;
  /** Amendment reason. null for the v1 baseline lock; required for v2+. */
  reason: string | null;
  lockedAt: Date;
  lockedBy: string | null;
}

/** The full protocol as the server resolves it for a review. */
export interface ProtocolView {
  reviewId: string;
  status: ProtocolStatus;
  /** null while never locked; otherwise the latest (highest) version number. */
  currentVersion: number | null;
  /** The content the editor shows: latest locked version, else the draft. */
  content: ProtocolContent;
  /** The locked history, oldest → newest (v1 … vN). Empty while unlocked. */
  versions: ProtocolVersion[];
  lockedAt: Date | null;
  lockedBy: string | null;
}

// ── DTO types (serialized across the RSC → client boundary) ──────────────────

export interface ProtocolVersionDTO {
  version: number;
  content: ProtocolContent;
  reason: string | null;
  /** ISO-8601 timestamp — Dates are re-serialized as strings for the client. */
  lockedAt: string;
  lockedBy: string | null;
}

export interface ProtocolViewDTO {
  reviewId: string;
  status: ProtocolStatus;
  currentVersion: number | null;
  content: ProtocolContent;
  versions: ProtocolVersionDTO[];
  lockedAt: string | null;
  lockedBy: string | null;
}

/** The result a protocol server action returns to the client. Domain failures
 *  (locked, reason-required, incomplete, forbidden) come back as `ok: false`
 *  with an actionable message; unexpected/infra errors reject the action. */
export type ProtocolActionResult =
  | { ok: true; view: ProtocolViewDTO }
  | { ok: false; message: string; code: string };
