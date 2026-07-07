import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from '../schema';
import { reviews, studies } from './sr';
import {
  extractionStateEnum,
  robJudgementEnum,
  screeningDecisionEnum,
  screeningStageEnum,
} from './sr-enums';

// ─────────────────────────────────────────────────────────────────────────────
// THE THREE BLINDED BASE TABLES.
//
// The Postgres RUNTIME role has NO SELECT on any table in this file (see
// drizzle/0002_sr_privilege_wall.sql). Every read flows through the audited
// SECURITY DEFINER functions the blinding chokepoint calls; a stray Drizzle
// SELECT from anywhere else fails at the database with `permission denied`.
//
// Do NOT import `screeningDecisions`, `extractionEntries`, or `robAssessments`
// outside src/lib/sr/authz/**. This is enforced three ways:
//   1. ESLint no-restricted-imports (eslint.config.mjs)
//   2. CI grep (scripts/check-blinded-wall.mjs + .github/workflows/blinded-wall.yml)
//   3. CODEOWNERS reserves this file + src/lib/sr/authz/**
// ─────────────────────────────────────────────────────────────────────────────

export const screeningDecisions = pgTable(
  'screening_decisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id),
    studyId: uuid('study_id')
      .notNull()
      .references(() => studies.id),
    reviewerId: uuid('reviewer_id')
      .notNull()
      .references(() => users.id),
    stage: screeningStageEnum('stage').notNull(),
    decision: screeningDecisionEnum('decision').notNull(),
    // Structured full-text exclusion reason → PRISMA Item 16b per-reason counts.
    excludeReasonCode: text('exclude_reason_code'),
    excludeReasonDetail: text('exclude_reason_detail'),
    isAi: boolean('is_ai').notNull().default(false),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('screening_decisions_review_study_idx').on(t.reviewId, t.studyId),
    // One decision per (reviewer, study, stage). Makes the authz write chokepoint
    // an atomic, race-free upsert — a reviewer revises their OWN call rather than
    // stacking duplicate rows. Full-text is its own stage, so a study can carry a
    // distinct title/abstract and full-text decision from the same reviewer.
    uniqueIndex('screening_decisions_reviewer_study_stage_idx').on(
      t.reviewId,
      t.studyId,
      t.reviewerId,
      t.stage,
    ),
  ],
);

export const extractionEntries = pgTable(
  'extraction_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id),
    studyId: uuid('study_id')
      .notNull()
      .references(() => studies.id),
    fieldId: text('field_id').notNull(),
    reviewerId: uuid('reviewer_id')
      .notNull()
      .references(() => users.id),
    // Null when state is not_reported / na / unclear — a blank is never a zero.
    value: text('value'),
    state: extractionStateEnum('state').notNull(),
    // A calculated/imputed value (e.g. SD from CI) is tagged derived with its
    // formula, kept separate from as-reported (MECIR C47).
    derived: boolean('derived').notNull().default(false),
    derivedFormula: text('derived_formula'),
    // Source report + page/table/figure. { reportId, page, locator, ... }.
    provenance: jsonb('provenance'),
    isAi: boolean('is_ai').notNull().default(false),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('extraction_entries_review_study_idx').on(t.reviewId, t.studyId),
    // One entry per (reviewer, study, field). Makes the T15 extraction write
    // chokepoint an atomic, race-free upsert — a reviewer revises their OWN
    // field value rather than stacking duplicate rows. The AI reviewer carries a
    // distinct synthetic reviewer id, so its blinded row coexists on the same
    // (study, field) without colliding with a human's.
    uniqueIndex('extraction_entries_reviewer_study_field_idx').on(
      t.reviewId,
      t.studyId,
      t.reviewerId,
      t.fieldId,
    ),
  ],
);

export const robAssessments = pgTable(
  'rob_assessments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id),
    studyId: uuid('study_id')
      .notNull()
      .references(() => studies.id),
    reviewerId: uuid('reviewer_id')
      .notNull()
      .references(() => users.id),
    domain: text('domain').notNull(),
    judgement: robJudgementEnum('judgement').notNull(),
    supportQuote: text('support_quote'),
    isAi: boolean('is_ai').notNull().default(false),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('rob_assessments_review_study_idx').on(t.reviewId, t.studyId)],
);

export type ScreeningDecision = typeof screeningDecisions.$inferSelect;
export type NewScreeningDecision = typeof screeningDecisions.$inferInsert;
export type ExtractionEntry = typeof extractionEntries.$inferSelect;
export type NewExtractionEntry = typeof extractionEntries.$inferInsert;
export type RobAssessment = typeof robAssessments.$inferSelect;
export type NewRobAssessment = typeof robAssessments.$inferInsert;
