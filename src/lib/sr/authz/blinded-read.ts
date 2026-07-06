import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import {
  applyRowVisibility,
  BlindedAccessError,
  computeSurfaceProgress,
  resolveAggregateVisibility,
  resolveRowVisibility,
  type BlindedSurface,
  type Phase,
  type ReviewRole,
  type SafeProgress,
} from './policy';

// ─────────────────────────────────────────────────────────────────────────────
// THE BLINDING CHOKEPOINT — the ONLY module that reads the three blinded base
// tables (screening_decisions, extraction_entries, rob_assessments).
//
// Defense in depth (FOUNDATION-auth-tenancy.md §6):
//   1. Postgres wall — the runtime role has NO SELECT on the blinded tables;
//      the only read path is the audited SECURITY DEFINER functions
//      public.sr_read_{screening_decisions,extraction_entries,rob_assessments}
//      (drizzle/0002_sr_privilege_wall.sql). A stray SELECT fails at the DB.
//   2. This module — the app-layer policy brain. It calls those functions, then
//      applies deny-by-default `role × phase × table` policy (./policy) before
//      returning anything.
//   3. Guards — ESLint no-restricted-imports + CI grep + CODEOWNERS keep the
//      blinded table symbols out of every file except this directory.
//
// Aggregates are blinded data: every count / distribution / PRISMA number over
// these tables is computed HERE. No COUNT(*) on them lives anywhere else.
// ─────────────────────────────────────────────────────────────────────────────

// Who is asking, for which review, in what per-review role. `role` is the LIVE
// review_members role (resolved by the authorization layer, T3) — never a JWT
// claim. `requesterId` is the internal users.id (uuid) of the caller.
export type BlindedContext = {
  reviewId: string;
  requesterId: string;
  role: ReviewRole;
};

// ── View types (camelCase) returned to callers. Mapped from the snake-cased
// rows the SECURITY DEFINER functions return. Kept local so no blinded schema
// symbol leaks out of this module through a re-exported type. ──────────────────

export type ScreeningDecisionView = {
  id: string;
  reviewId: string;
  studyId: string;
  reviewerId: string;
  stage: string;
  decision: string;
  excludeReasonCode: string | null;
  excludeReasonDetail: string | null;
  isAi: boolean;
  lockedAt: Date | null;
};

export type ExtractionEntryView = {
  id: string;
  reviewId: string;
  studyId: string;
  fieldId: string;
  reviewerId: string;
  value: string | null;
  state: string;
  derived: boolean;
  derivedFormula: string | null;
  provenance: unknown;
  isAi: boolean;
  lockedAt: Date | null;
};

export type RobAssessmentView = {
  id: string;
  reviewId: string;
  studyId: string;
  reviewerId: string;
  domain: string;
  judgement: string;
  supportQuote: string | null;
  isAi: boolean;
  lockedAt: Date | null;
};

// ── Raw row shapes (what the definer functions return, SETOF the base table). ──

type RawScreeningRow = {
  id: string;
  review_id: string;
  study_id: string;
  reviewer_id: string;
  stage: string;
  decision: string;
  exclude_reason_code: string | null;
  exclude_reason_detail: string | null;
  is_ai: boolean;
  locked_at: string | Date | null;
};

type RawExtractionRow = {
  id: string;
  review_id: string;
  study_id: string;
  field_id: string;
  reviewer_id: string;
  value: string | null;
  state: string;
  derived: boolean;
  derived_formula: string | null;
  provenance: unknown;
  is_ai: boolean;
  locked_at: string | Date | null;
};

type RawRobRow = {
  id: string;
  review_id: string;
  study_id: string;
  reviewer_id: string;
  domain: string;
  judgement: string;
  support_quote: string | null;
  is_ai: boolean;
  locked_at: string | Date | null;
};

function toDate(value: string | Date | null): Date | null {
  if (value == null) return null;
  return value instanceof Date ? value : new Date(value);
}

function mapScreening(r: RawScreeningRow): ScreeningDecisionView {
  return {
    id: r.id,
    reviewId: r.review_id,
    studyId: r.study_id,
    reviewerId: r.reviewer_id,
    stage: r.stage,
    decision: r.decision,
    excludeReasonCode: r.exclude_reason_code,
    excludeReasonDetail: r.exclude_reason_detail,
    isAi: r.is_ai,
    lockedAt: toDate(r.locked_at),
  };
}

function mapExtraction(r: RawExtractionRow): ExtractionEntryView {
  return {
    id: r.id,
    reviewId: r.review_id,
    studyId: r.study_id,
    fieldId: r.field_id,
    reviewerId: r.reviewer_id,
    value: r.value,
    state: r.state,
    derived: r.derived,
    derivedFormula: r.derived_formula,
    provenance: r.provenance,
    isAi: r.is_ai,
    lockedAt: toDate(r.locked_at),
  };
}

function mapRob(r: RawRobRow): RobAssessmentView {
  return {
    id: r.id,
    reviewId: r.review_id,
    studyId: r.study_id,
    reviewerId: r.reviewer_id,
    domain: r.domain,
    judgement: r.judgement,
    supportQuote: r.support_quote,
    isAi: r.is_ai,
    lockedAt: toDate(r.locked_at),
  };
}

// ── Low-level readers: the ONLY calls to the audited SECURITY DEFINER functions.
// reviewId is always parameterized (injection-safe). ──────────────────────────

async function fetchScreeningRows(
  reviewId: string,
): Promise<ScreeningDecisionView[]> {
  const result = await getDb().execute<RawScreeningRow>(
    sql`select * from public.sr_read_screening_decisions(${reviewId})`,
  );
  return result.rows.map(mapScreening);
}

async function fetchExtractionRows(
  reviewId: string,
): Promise<ExtractionEntryView[]> {
  const result = await getDb().execute<RawExtractionRow>(
    sql`select * from public.sr_read_extraction_entries(${reviewId})`,
  );
  return result.rows.map(mapExtraction);
}

async function fetchRobRows(reviewId: string): Promise<RobAssessmentView[]> {
  const result = await getDb().execute<RawRobRow>(
    sql`select * from public.sr_read_rob_assessments(${reviewId})`,
  );
  return result.rows.map(mapRob);
}

// The per-surface phase lives on `reviews`; reading it here keeps phase
// authoritative — a caller can never spoof "we're in reconcile".
const PHASE_COLUMN: Record<BlindedSurface, string> = {
  screening: 'screening_phase',
  extraction: 'extraction_phase',
  rob: 'rob_phase',
};

async function fetchPhase(
  reviewId: string,
  surface: BlindedSurface,
): Promise<Phase> {
  const column = PHASE_COLUMN[surface];
  const result = await getDb().execute<{ phase: Phase }>(
    sql`select ${sql.raw(column)} as phase from reviews where id = ${reviewId}`,
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(
      `Cannot resolve blinding phase: review ${reviewId} not found. ` +
        `The authorization layer must reject unknown reviews (404) before calling the chokepoint.`,
    );
  }
  return row.phase;
}

// The denominator for safe progress: active members expected to author blinded
// rows. Roles that produce independent work are reviewer + collaborator.
async function fetchReviewingMemberIds(reviewId: string): Promise<string[]> {
  const result = await getDb().execute<{ user_id: string }>(
    sql`select user_id from review_members
        where review_id = ${reviewId}
          and status = 'active'
          and role in ('reviewer', 'collaborator')`,
  );
  return result.rows.map((r) => r.user_id);
}

// ── Public API: policy-enforced reads. ────────────────────────────────────────

export async function getScreeningDecisions(
  ctx: BlindedContext,
): Promise<ScreeningDecisionView[]> {
  const phase = await fetchPhase(ctx.reviewId, 'screening');
  const visibility = resolveRowVisibility(ctx.role, phase);
  if (visibility === 'none') {
    throw new BlindedAccessError('screening', ctx.role, phase);
  }
  const rows = await fetchScreeningRows(ctx.reviewId);
  return applyRowVisibility(rows, visibility, ctx.requesterId);
}

export async function getExtractionEntries(
  ctx: BlindedContext,
): Promise<ExtractionEntryView[]> {
  const phase = await fetchPhase(ctx.reviewId, 'extraction');
  const visibility = resolveRowVisibility(ctx.role, phase);
  if (visibility === 'none') {
    throw new BlindedAccessError('extraction', ctx.role, phase);
  }
  const rows = await fetchExtractionRows(ctx.reviewId);
  return applyRowVisibility(rows, visibility, ctx.requesterId);
}

export async function getRobAssessments(
  ctx: BlindedContext,
): Promise<RobAssessmentView[]> {
  const phase = await fetchPhase(ctx.reviewId, 'rob');
  const visibility = resolveRowVisibility(ctx.role, phase);
  if (visibility === 'none') {
    throw new BlindedAccessError('rob', ctx.role, phase);
  }
  const rows = await fetchRobRows(ctx.reviewId);
  return applyRowVisibility(rows, visibility, ctx.requesterId);
}

// ── Aggregates are blinded data — computed here, gated to full visibility. ────

// Decision distribution across ALL reviewers. This is an aggregate over other
// reviewers' calls, so it is refused during `independent` for every role — it
// only resolves once the surface is in `reconcile` and the caller may see all
// rows. Demonstrates the rule for every future aggregate (PRISMA, conflicts).
export type ScreeningTally = {
  include: number;
  exclude: number;
  maybe: number;
  total: number;
};

export async function getScreeningTally(
  ctx: BlindedContext,
): Promise<ScreeningTally> {
  const phase = await fetchPhase(ctx.reviewId, 'screening');
  if (resolveAggregateVisibility(ctx.role, phase) !== 'all') {
    throw new BlindedAccessError('screening', ctx.role, phase, 'aggregate');
  }
  const rows = await fetchScreeningRows(ctx.reviewId);
  const tally: ScreeningTally = { include: 0, exclude: 0, maybe: 0, total: 0 };
  for (const row of rows) {
    tally.total += 1;
    if (row.decision === 'include') tally.include += 1;
    else if (row.decision === 'exclude') tally.exclude += 1;
    else if (row.decision === 'maybe') tally.maybe += 1;
  }
  return tally;
}

// ── Safe progress — the ONLY progress surface during `independent`. ───────────

/**
 * Completion counts ONLY: "N of M reviewers finished" per surface. It reads the
 * blinded rows internally (that is exactly why it lives in the chokepoint) but
 * emits nothing beyond integer tallies — no decision distribution, no conflict
 * count, no per-study or per-partner status. It is phase-independent and safe by
 * construction, so it takes no role. See FOUNDATION-auth-tenancy.md §6.
 */
export async function getSafeProgress(reviewId: string): Promise<SafeProgress> {
  const memberIds = await fetchReviewingMemberIds(reviewId);
  const [screening, extraction, rob] = await Promise.all([
    fetchScreeningRows(reviewId),
    fetchExtractionRows(reviewId),
    fetchRobRows(reviewId),
  ]);
  return {
    screening: computeSurfaceProgress(screening, memberIds),
    extraction: computeSurfaceProgress(extraction, memberIds),
    rob: computeSurfaceProgress(rob, memberIds),
  };
}

export { BlindedAccessError } from './policy';
export type {
  BlindedSurface,
  Phase,
  ReviewRole,
  SafeProgress,
  SurfaceProgress,
  Visibility,
} from './policy';
