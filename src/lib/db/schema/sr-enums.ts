import { pgEnum } from 'drizzle-orm/pg-core';

// Systematic-Review enum types. Kept in one file so both the visible tables
// (sr.ts) and the blinded base tables (sr-blinded.ts) can share them without a
// table-level import cycle.

export const reviewModeEnum = pgEnum('sr_review_mode', [
  'two_reviewer',
  'ai_co_reviewer',
]);

// Full-text is its OWN screening stage (PRISMA Item 16b).
export const screeningStageEnum = pgEnum('sr_screening_stage', [
  'title_abstract',
  'full_text',
]);

// The independent -> reconcile firewall gate. Per-surface (screening,
// extraction, RoB) so an owner can unblind one surface at a time.
export const phaseEnum = pgEnum('sr_phase', ['independent', 'reconcile']);

export const memberStatusEnum = pgEnum('sr_member_status', [
  'pending',
  'active',
  'inactive',
]);

export const invitationStatusEnum = pgEnum('sr_invitation_status', [
  'pending',
  'accepted',
  'revoked',
  'expired',
]);

// Per-review roles (ours, never trusted from the JWT).
export const reviewRoleEnum = pgEnum('sr_review_role', [
  'owner',
  'collaborator',
  'reviewer',
  'arbitrator',
  'viewer',
]);

export const screeningDecisionEnum = pgEnum('sr_screening_decision', [
  'include',
  'exclude',
  'maybe',
]);

// Four DISTINCT explicit states — "not reported" is never a zero (MECIR).
export const extractionStateEnum = pgEnum('sr_extraction_state', [
  'reported',
  'not_reported',
  'na',
  'unclear',
]);

export const robJudgementEnum = pgEnum('sr_rob_judgement', [
  'low',
  'some',
  'high',
]);

// Which input a human explicitly PICKED as the reconciled extraction value
// (T15). `ai` here means a human chose the AI-suggested value — the AI is never
// the system of record on its own; nothing here is ever auto-selected.
export const extractionConsensusSourceEnum = pgEnum(
  'sr_extraction_consensus_source',
  ['reviewer1', 'reviewer2', 'ai', 'typed'],
);

// The escalation-ladder rung that settled (or parked) an extraction field (T15,
// Cochrane §5.5.3 / MECIR C49). `discuss` = the two extractors agreed a value;
// `arbitrator` = an independent third reviewer decided; `author_contact` = a
// value settled after contacting the study authors; `unresolved` = left
// unresolved, allowed ONLY after the ladder is recorded (author-contacted y/n +
// rationale). Recorded per field for PRISMA reporting.
export const extractionResolutionMethodEnum = pgEnum(
  'sr_extraction_resolution_method',
  ['discuss', 'arbitrator', 'author_contact', 'unresolved'],
);

// The appraisal instrument a study is assessed with: RoB 2 for randomised trials
// (default — ScholarSync ships RoB 2 first-class), ROBINS-I for non-randomised
// studies of interventions. Per-study because one review can mix designs.
export const robInstrumentEnum = pgEnum('sr_rob_instrument', [
  'rob2',
  'robins_i',
]);

// How a screening conflict was resolved (T13). `align_on_one` = a human
// explicitly picked include or exclude (never an auto-vote / majority);
// `send_to_arbitrator` = handed to an independent arbitrator (≠ the study's
// reviewers). The method is recorded per conflict — there is no auto-resolve.
export const conflictResolutionMethodEnum = pgEnum(
  'sr_conflict_resolution_method',
  ['align_on_one', 'send_to_arbitrator'],
);

// The stage a batch of references is imported into (Covidence: import into a
// named stage). Mirrors the precursor `ImportBatch.target`.
export const importTargetEnum = pgEnum('sr_import_target', [
  'screen',
  'full_text',
]);

// Per-study duplicate-detection state (Covidence model: match on title · year ·
// authors · identifiers). `unique` = matcher found no duplicate. `auto_merged` =
// high-confidence duplicate, removed from the pool automatically. `needs_review`
// = uncertain pair queued for a human, kept IN the pool until decided. `merged`
// = human-confirmed duplicate (removed). `kept` = human said not-a-duplicate
// (stays). No state ever deletes the row — removal is reversible (never a silent
// drop).
export const dupeStatusEnum = pgEnum('sr_dupe_status', [
  'unique',
  'auto_merged',
  'needs_review',
  'merged',
  'kept',
]);
