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
