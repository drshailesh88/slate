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
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from '../schema';
import {
  invitationStatusEnum,
  memberStatusEnum,
  reviewModeEnum,
  reviewRoleEnum,
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
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('studies_review_idx').on(t.reviewId)],
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
export type Study = typeof studies.$inferSelect;
export type NewStudy = typeof studies.$inferInsert;
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
