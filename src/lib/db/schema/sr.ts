import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { users } from '../schema';
// Type-only imports are erased by esbuild before drizzle-kit resolves modules,
// so this stays relative-safe for the drizzle-kit bundler (no `@/` alias).
import type {
  Pico as ProtocolPico,
  EligibilityCriterion as ProtocolCriterion,
} from '../../sr/protocol/types';
import {
  conflictResolutionMethodEnum,
  dupeStatusEnum,
  extractionConsensusSourceEnum,
  extractionResolutionMethodEnum,
  extractionStateEnum,
  importTargetEnum,
  invitationStatusEnum,
  memberStatusEnum,
  reviewModeEnum,
  reviewRoleEnum,
  screeningDecisionEnum,
  screeningStageEnum,
  phaseEnum,
} from './sr-enums';

// ─────────────────────────────────────────────────────────────────────────────
// Systematic-Review foundation schema (visible tables).
//
// The THREE blinded base tables live in ./sr-blinded and are re-exported at the
// bottom of this file. The Postgres runtime role has NO SELECT on those three;
// see drizzle/0001b_sr_privilege_wall.sql. Do NOT import the blinded table
// symbols outside src/lib/sr/authz/** (ESLint + CI grep + CODEOWNERS enforce it).
//
// users stays as Slate's existing internal-uuid PK + workos_user_id unique
// (founder-locked). review_members.userId FKs users.id (the uuid).
// ─────────────────────────────────────────────────────────────────────────────

// Mirror of a WorkOS Organization (institution / lab). PK is the WorkOS org id.
export const organizations = pgTable('organizations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id')
    .notNull()
    .references(() => organizations.id),
  title: text('title').notNull(),
  reviewType: text('review_type').notNull(),
  reviewMode: reviewModeEnum('review_mode').notNull(),
  screeningStage: screeningStageEnum('screening_stage')
    .notNull()
    .default('title_abstract'),
  // Three independent firewall gates — an owner unblinds one surface at a time.
  screeningPhase: phaseEnum('screening_phase').notNull().default('independent'),
  extractionPhase: phaseEnum('extraction_phase')
    .notNull()
    .default('independent'),
  robPhase: phaseEnum('rob_phase').notNull().default('independent'),
  // QC sampling rate for AGREED critical extraction fields (T15, non-neg #9):
  // the fraction of agreed critical fields a reviewer re-verifies to catch shared
  // misreads. A per-review setting (default 20%), framed as "N fields to verify",
  // never "drive conflicts to 0".
  extractionQcSampleRate: real('extraction_qc_sample_rate')
    .notNull()
    .default(0.2),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const reviewMembers = pgTable(
  'review_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    role: reviewRoleEnum('role').notNull(),
    status: memberStatusEnum('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('review_members_review_user_unique').on(t.reviewId, t.userId),
    index('review_members_review_user_idx').on(t.reviewId, t.userId),
  ],
);

export const reviewInvitations = pgTable(
  'review_invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id),
    // Normalized (lower-cased, trimmed) invited email — bound to the token.
    email: text('email').notNull(),
    role: reviewRoleEnum('role').notNull(),
    // Only the HASH of the single-use token is stored, never the token.
    tokenHash: text('token_hash').notNull().unique(),
    entropyBits: integer('entropy_bits').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    // Correlates to a managed WorkOS org invitation when the invitee is new.
    workosInvitationId: text('workos_invitation_id'),
    status: invitationStatusEnum('status').notNull().default('pending'),
    invitedBy: uuid('invited_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('review_invitations_review_email_idx').on(t.reviewId, t.email)],
);

// A reversible import batch — one row per import action (T9). `undoneAt` marks
// the batch as undone WITHOUT deleting its studies (undo is reversible; never a
// silent drop). Counts (refs / duplicates) are derived from the studies rows.
export const importBatches = pgTable(
  'import_batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id),
    // Human label of where the references came from (e.g. "PubMed", "RIS file").
    source: text('source').notNull(),
    target: importTargetEnum('target').notNull().default('screen'),
    // Batch came from AI discovery rather than a file.
    ai: boolean('ai').notNull().default(false),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Set when the batch is undone; cleared to restore. Reversible, non-destructive.
    undoneAt: timestamp('undone_at', { withTimezone: true }),
  },
  (t) => [index('import_batches_review_idx').on(t.reviewId)],
);

// Every studyId is ALWAYS joined through studies.reviewId = reviewId (IDOR kill).
export const studies = pgTable(
  'studies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id),
    title: text('title').notNull(),
    abstract: text('abstract'),
    authors: text('authors'),
    journal: text('journal'),
    year: integer('year'),
    doi: text('doi'),
    // Identifier from the import source (PubMed PMID, RIS id, etc).
    externalId: text('external_id'),
    source: text('source'),
    // The reversible import batch this study entered on (T9). Nullable: rows
    // predating T9 (e.g. the dev seed) carry no batch.
    batchId: uuid('batch_id').references(() => importBatches.id),
    // Duplicate-detection state (T9). Defaults `unique` so pre-T9 rows stay in
    // the pool. Removal (auto_merged / merged) is reversible, never a delete.
    dupeStatus: dupeStatusEnum('dupe_status').notNull().default('unique'),
    // The study this one appears to duplicate (self-reference; the kept original).
    dupeOfStudyId: uuid('dupe_of_study_id').references(
      (): AnyPgColumn => studies.id,
    ),
    // Which fields matched, e.g. ["title", "year", "first author"].
    dupeMatchedOn: jsonb('dupe_matched_on').$type<string[]>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('studies_review_idx').on(t.reviewId),
    index('studies_batch_idx').on(t.batchId),
  ],
);

// ── Protocol / eligibility criteria (SR1) ────────────────────────────────────
//
// The review protocol (PICO + inclusion/exclusion criteria) as an append-only
// version ledger — the methodological audit trail. Exactly ONE mutable draft row
// per review carries `version = NULL`; it is edited freely until the protocol is
// LOCKED. Locking stamps that row as version 1 (immutable). Every later edit is a
// dated AMENDMENT: a fresh row with the next version, a required `reason`, its
// author, and a timestamp — never a silent overwrite. Locked rows are never
// updated, so the full history (v1 baseline + every reasoned amendment) is
// preserved. `pico`/`criteria` are typed JSONB (structural types owned by the
// protocol module; erased type-only imports keep drizzle-kit relative-safe).
export const protocolVersions = pgTable(
  'protocol_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id),
    // NULL = the single working draft; 1..N = immutable locked versions.
    version: integer('version'),
    researchQuestion: text('research_question').notNull().default(''),
    pico: jsonb('pico').$type<ProtocolPico>().notNull(),
    criteria: jsonb('criteria').$type<ProtocolCriterion[]>().notNull(),
    // The amendment reason. NULL for the draft and the v1 baseline lock; required
    // (non-empty) for every amendment (v2+) — enforced in the service layer.
    reason: text('reason'),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockedBy: uuid('locked_by').references(() => users.id),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // Locked versions are unique per review. NULLs don't collide, so the single
    // draft coexists; the partial index below caps drafts at one per review.
    unique('protocol_versions_review_version_unique').on(t.reviewId, t.version),
    uniqueIndex('protocol_versions_one_draft_idx')
      .on(t.reviewId)
      .where(sql`${t.version} is null`),
    index('protocol_versions_review_idx').on(t.reviewId, t.version),
  ],
);

// ── Screening conflict resolutions (T13) ─────────────────────────────────────
//
// The record of HOW an opposing screening conflict was reconciled after unblind
// — the human adjudication trail. A conflict is resolved ONLY by an explicit
// human action (there is no auto-resolve / majority path): `align_on_one` stamps
// the explicit include/exclude the reconciler picked; `send_to_arbitrator` hands
// the study to an independent arbitrator (server-enforced ≠ the study's
// reviewers). `resolvedBy` is never null — nothing writes a final screening
// status without an actor. One active resolution per (review, study, stage); a
// re-resolution upserts, and every change is also appended to `audit_log`.
// Non-blinded: rows only exist at reconcile, so the runtime role reads + writes it.
export const screeningConflictResolutions = pgTable(
  'screening_conflict_resolutions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id),
    studyId: uuid('study_id')
      .notNull()
      .references(() => studies.id),
    stage: screeningStageEnum('stage').notNull(),
    method: conflictResolutionMethodEnum('method').notNull(),
    // The picked call for `align_on_one`; NULL when sent to an arbitrator.
    decision: screeningDecisionEnum('decision'),
    // The independent arbitrator for `send_to_arbitrator`; NULL otherwise.
    arbitratorId: uuid('arbitrator_id').references(() => users.id),
    note: text('note'),
    // The human who recorded the resolution — never null (no auto-resolve).
    resolvedBy: uuid('resolved_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('screening_conflict_resolutions_review_study_stage_unique').on(
      t.reviewId,
      t.studyId,
      t.stage,
    ),
    index('screening_conflict_resolutions_review_idx').on(t.reviewId),
  ],
);

// ── Extraction consensus (T15) — the reconciled value, kept SEPARATE ─────────
//
// The human-reconciled value for one extraction field after both reviewers
// locked and the owner unblinded. It is deliberately its OWN table: the two
// reviewers' as-extracted `extraction_entries` rows are NEVER overwritten by the
// consensus (non-neg #8 — as-extracted kept forever, queryable/exportable for the
// reliability-of-coding audit). One active consensus row per (review, study,
// field); a re-resolution upserts, and every change is also appended to
// `audit_log`.
//
// The science invariants this table encodes:
//   • Consensus starts EMPTY — a row only exists once a human explicitly acts
//     (non-neg #3/#4). There is no auto-resolve path anywhere.
//   • `source` records which input the human PICKED (reviewer1/reviewer2/ai/typed)
//     — the AI is a labeled third input, never the system of record (non-neg #5/#10).
//   • `state` is one of the four distinct states; a blank is never a zero (#8).
//   • `derived` + `derivedFormula` keep a calculated value separate from
//     as-reported (#10). `provenance` keeps source report + page/table/figure (#6).
//   • The resolution LADDER (`resolutionMethod`, `arbitratorId`, `authorContacted`,
//     `authorContactNote`) is recorded per field; leaving a field `unresolved` is
//     allowed ONLY after the ladder is recorded (#9). Author-contact is an in-app
//     LOG (attempt + response) — the app never auto-sends email.
// Non-blinded: rows only ever exist at reconcile, so the runtime role reads + writes it.
export const extractionConsensus = pgTable(
  'extraction_consensus',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id),
    studyId: uuid('study_id')
      .notNull()
      .references(() => studies.id),
    fieldId: text('field_id').notNull(),
    // NULL for not_reported / na / unclear, or while recorded-unresolved. A blank
    // is never a zero.
    value: text('value'),
    state: extractionStateEnum('state').notNull(),
    source: extractionConsensusSourceEnum('source').notNull(),
    derived: boolean('derived').notNull().default(false),
    derivedFormula: text('derived_formula'),
    provenance: jsonb('provenance'),
    resolutionMethod: extractionResolutionMethodEnum('resolution_method')
      .notNull()
      .default('discuss'),
    // The independent arbitrator when the field was adjudicated by one; NULL
    // otherwise. Server-enforced ≠ the study's extractors.
    arbitratorId: uuid('arbitrator_id').references(() => users.id),
    // Author-contact LOG: whether the study authors were contacted, and the
    // recorded attempt/response. Never an auto-send.
    authorContacted: boolean('author_contacted').notNull().default(false),
    authorContactNote: text('author_contact_note'),
    // The human who recorded it — never null (no auto-resolve).
    resolvedBy: uuid('resolved_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('extraction_consensus_review_study_field_unique').on(
      t.reviewId,
      t.studyId,
      t.fieldId,
    ),
    index('extraction_consensus_review_idx').on(t.reviewId),
  ],
);

// ── Support tables (NOT blinded) ─────────────────────────────────────────────

// Recall/sensitivity validation of an AI reviewer on this review's includes.
export const aiValidations = pgTable('ai_validations', {
  id: uuid('id').primaryKey().defaultRandom(),
  reviewId: uuid('review_id')
    .notNull()
    .references(() => reviews.id),
  model: text('model').notNull(),
  version: text('version').notNull(),
  prompt: text('prompt').notNull(),
  recallOnIncludes: real('recall_on_includes').notNull(),
  sampleSize: integer('sample_size').notNull(),
  passed: boolean('passed').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// WorkOS event idempotency ledger — dedup by eventId, process once, no-resurrect.
export const workosEvents = pgTable('workos_events', {
  eventId: text('event_id').primaryKey(),
  type: text('type').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
});

// Append-only who/what/when/before/after. Never updated, never cascade-deleted.
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reviewId: uuid('review_id').references(() => reviews.id),
    actorId: uuid('actor_id').references(() => users.id),
    action: text('action').notNull(),
    target: text('target').notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_log_review_at_idx').on(t.reviewId, t.at)],
);

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;
export type ReviewMember = typeof reviewMembers.$inferSelect;
export type NewReviewMember = typeof reviewMembers.$inferInsert;
export type ReviewInvitation = typeof reviewInvitations.$inferSelect;
export type NewReviewInvitation = typeof reviewInvitations.$inferInsert;
export type ImportBatch = typeof importBatches.$inferSelect;
export type NewImportBatch = typeof importBatches.$inferInsert;
export type Study = typeof studies.$inferSelect;
export type NewStudy = typeof studies.$inferInsert;
export type ProtocolVersionRow = typeof protocolVersions.$inferSelect;
export type NewProtocolVersionRow = typeof protocolVersions.$inferInsert;
export type ScreeningConflictResolution =
  typeof screeningConflictResolutions.$inferSelect;
export type NewScreeningConflictResolution =
  typeof screeningConflictResolutions.$inferInsert;
export type ExtractionConsensusRow = typeof extractionConsensus.$inferSelect;
export type NewExtractionConsensusRow = typeof extractionConsensus.$inferInsert;
export type AiValidation = typeof aiValidations.$inferSelect;
export type NewAiValidation = typeof aiValidations.$inferInsert;
export type WorkosEvent = typeof workosEvents.$inferSelect;
export type NewWorkosEvent = typeof workosEvents.$inferInsert;
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;

// Re-export the enums and the blinded base tables so the drizzle schema barrel
// (src/lib/db/schema.ts) discovers everything through a single line. This must
// stay LAST: sr-blinded imports `reviews`/`studies` (defined above) lazily.
export * from './sr-enums';
export * from './sr-blinded';
