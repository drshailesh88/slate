import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { requiredHumanReviewers } from '@/lib/sr/ai/coverage';
import {
  cohensKappa,
  deriveScreeningConflicts,
  type KappaReadout,
  type ScreeningConflict,
} from '@/lib/sr/conflicts/derive';
import {
  derivePrismaFlow,
  type PrismaFlow,
  type PrismaResolutionRow,
  type PrismaStudyRow,
} from '@/lib/sr/prisma/derive';
import {
  deriveRobOutcomes,
  deriveScreeningOutcomes,
  type OutcomeResolutionRow,
  type RobOutcomes,
  type ScreeningOutcomes,
} from '@/lib/sr/report/outcomes';
import type { ReviewMode } from '@/lib/sr/review-modes';
import { isRobInstrument, type RobInstrument } from '@/lib/sr/rob/domains';
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

// The set of screening conflicts + inter-rater agreement for a stage. Both are
// aggregates over EVERY reviewer's calls, so this is refused during `independent`
// for every role (and always for `viewer`, who reads derived consensus, not raw
// conflicts) — it only resolves once the surface is in `reconcile` and the caller
// may see all rows. This is the server-side gate the Conflicts screen (T13) reads
// through: the opposing calls physically do not leave the chokepoint pre-unblind.
export type ScreeningConflicts = {
  conflicts: ScreeningConflict[];
  kappa: KappaReadout;
};

export async function getScreeningConflicts(
  ctx: BlindedContext,
  stage: string,
): Promise<ScreeningConflicts> {
  const phase = await fetchPhase(ctx.reviewId, 'screening');
  if (resolveAggregateVisibility(ctx.role, phase) !== 'all') {
    throw new BlindedAccessError('screening', ctx.role, phase, 'aggregate');
  }
  const rows = await fetchScreeningRows(ctx.reviewId);
  return {
    conflicts: deriveScreeningConflicts(rows, stage),
    kappa: cohensKappa(rows.filter((r) => r.stage === stage)),
  };
}

// ── The PRISMA 2020 flow (T17) — an aggregate over every reviewer's calls. ────
//
// PRISMA stage counts (screened / excluded / assessed / included, and the
// per-reason full-text exclusions — Item 16b) are derived from the blinded
// screening rows, so the WHOLE flow is blinded data and is computed HERE:
// refused during `independent` for every role, and always for `viewer` (same
// gate as getScreeningConflicts). The page shows only the non-blinded
// Identification block (from `studies`) plus getSafeProgress until the owner
// unblinds screening. The pure math lives in @/lib/sr/prisma/derive — this is
// its only call site with real rows.
export async function getPrismaFlow(ctx: BlindedContext): Promise<PrismaFlow> {
  const review = await getDb().execute<{ phase: Phase; mode: ReviewMode }>(
    sql`select screening_phase as phase, review_mode as mode
        from reviews where id = ${ctx.reviewId}`,
  );
  const row = review.rows[0];
  if (!row) {
    throw new Error(
      `Cannot resolve blinding phase: review ${ctx.reviewId} not found. ` +
        `The authorization layer must reject unknown reviews (404) before calling the chokepoint.`,
    );
  }
  if (resolveAggregateVisibility(ctx.role, row.phase) !== 'all') {
    throw new BlindedAccessError('screening', ctx.role, row.phase, 'aggregate');
  }

  const decisions = await fetchScreeningRows(ctx.reviewId);
  const studies = await fetchPrismaStudies(ctx.reviewId);
  const resolutions = await fetchPrismaResolutions(ctx.reviewId);

  return derivePrismaFlow({
    studies,
    decisions,
    resolutions,
    requiredHumans: requiredHumanReviewers(row.mode),
  });
}

// The visible study pool + recorded resolutions the flow reconciles over. Both
// are non-blinded tables, read here so the ENTIRE flow derives from one
// snapshot inside the gate — a caller never assembles PRISMA numbers itself.
async function fetchPrismaStudies(reviewId: string): Promise<PrismaStudyRow[]> {
  const result = await getDb().execute<{
    id: string;
    source: string | null;
    dupe_status: string;
  }>(
    sql`select id, source, dupe_status from studies
        where review_id = ${reviewId}`,
  );
  return result.rows.map((r) => ({
    id: r.id,
    source: r.source,
    dupeStatus: r.dupe_status,
  }));
}

async function fetchPrismaResolutions(
  reviewId: string,
): Promise<PrismaResolutionRow[]> {
  const result = await getDb().execute<{
    study_id: string;
    stage: string;
    method: string;
    decision: string | null;
  }>(
    sql`select study_id, stage, method, decision
        from screening_conflict_resolutions
        where review_id = ${reviewId}`,
  );
  return result.rows.map((r) => ({
    studyId: r.study_id,
    stage: r.stage,
    method: r.method,
    decision: r.decision,
  }));
}

// ── Report outcome aggregates (T18) — reconcile-gated, computed HERE. ─────────
// The report's included/excluded/RoB numbers are aggregates over EVERY
// reviewer's blinded rows, so — like getScreeningConflicts — the derivation is
// pure math in src/lib/sr/report/outcomes.ts and its ONLY call sites are these
// two gated functions. During `independent` they throw BlindedAccessError and
// the report renders "withheld"; no number leaves early.

// Visible-table support reads (screening_conflict_resolutions / reviews /
// studies) — the pool rule mirrors extraction: confidently removed duplicates
// are out.
async function fetchScreeningResolutions(
  reviewId: string,
): Promise<OutcomeResolutionRow[]> {
  const result = await getDb().execute<{
    study_id: string;
    stage: string;
    method: string;
    decision: string | null;
    arbitrator_id: string | null;
  }>(
    sql`select study_id, stage, method, decision, arbitrator_id
        from screening_conflict_resolutions where review_id = ${reviewId}`,
  );
  return result.rows.map((r) => ({
    studyId: r.study_id,
    stage: r.stage,
    method: r.method,
    decision: r.decision,
    arbitratorId: r.arbitrator_id,
  }));
}

async function fetchReviewMode(
  reviewId: string,
): Promise<'two_reviewer' | 'ai_co_reviewer'> {
  const result = await getDb().execute<{ review_mode: string }>(
    sql`select review_mode from reviews where id = ${reviewId}`,
  );
  return result.rows[0]?.review_mode === 'ai_co_reviewer'
    ? 'ai_co_reviewer'
    : 'two_reviewer';
}

async function fetchStudyPool(
  reviewId: string,
): Promise<Array<{ id: string; instrument: RobInstrument }>> {
  const result = await getDb().execute<{
    id: string;
    rob_instrument: string;
  }>(
    sql`select id, rob_instrument from studies
        where review_id = ${reviewId}
          and dupe_status not in ('auto_merged', 'merged')
        order by created_at`,
  );
  return result.rows.map((r) => ({
    id: r.id,
    instrument: isRobInstrument(r.rob_instrument) ? r.rob_instrument : 'rob2',
  }));
}

export async function getReportScreeningOutcomes(
  ctx: BlindedContext,
  stage: string,
): Promise<ScreeningOutcomes> {
  const phase = await fetchPhase(ctx.reviewId, 'screening');
  if (resolveAggregateVisibility(ctx.role, phase) !== 'all') {
    throw new BlindedAccessError('screening', ctx.role, phase, 'aggregate');
  }
  const [decisions, resolutions, pool, reviewMode] = await Promise.all([
    fetchScreeningRows(ctx.reviewId),
    fetchScreeningResolutions(ctx.reviewId),
    fetchStudyPool(ctx.reviewId),
    fetchReviewMode(ctx.reviewId),
  ]);
  return deriveScreeningOutcomes({
    decisions,
    resolutions,
    studyIds: pool.map((s) => s.id),
    stage,
    reviewMode,
  });
}

export async function getReportRobOutcomes(
  ctx: BlindedContext,
): Promise<RobOutcomes> {
  const phase = await fetchPhase(ctx.reviewId, 'rob');
  if (resolveAggregateVisibility(ctx.role, phase) !== 'all') {
    throw new BlindedAccessError('rob', ctx.role, phase, 'aggregate');
  }
  const [rows, pool] = await Promise.all([
    fetchRobRows(ctx.reviewId),
    fetchStudyPool(ctx.reviewId),
  ]);
  return deriveRobOutcomes(
    rows,
    new Map(pool.map((s) => [s.id, s.instrument])),
    pool.map((s) => s.id),
  );
}

// ── Export readers (T19) — the full-dataset reads an export artifact uses. ────
//
// An export leaves the app, so it is gated STRICTER than the row getters: like
// an aggregate, it resolves only when the surface is in `reconcile` and the
// caller may see all rows. During `independent` it refuses for EVERY role —
// even the caller's own blinded rows are not exportable pre-unblind (an export
// file can be shared; own-rows-in-a-file is still blinded data outside the
// firewall). `viewer` is refused always (it exports derived consensus + the
// non-blinded references, never raw rows). The phase is read HERE, from
// `reviews` — a spoofed or stale caller-side phase cannot unmask anything.

async function fetchExportPhaseOrThrow(
  ctx: BlindedContext,
  surface: BlindedSurface,
): Promise<void> {
  const phase = await fetchPhase(ctx.reviewId, surface);
  if (resolveAggregateVisibility(ctx.role, phase) !== 'all') {
    throw new BlindedAccessError(surface, ctx.role, phase, 'aggregate');
  }
}

export async function getScreeningDecisionsForExport(
  ctx: BlindedContext,
): Promise<ScreeningDecisionView[]> {
  await fetchExportPhaseOrThrow(ctx, 'screening');
  return fetchScreeningRows(ctx.reviewId);
}

export async function getExtractionEntriesForExport(
  ctx: BlindedContext,
): Promise<ExtractionEntryView[]> {
  await fetchExportPhaseOrThrow(ctx, 'extraction');
  return fetchExtractionRows(ctx.reviewId);
}

export async function getRobAssessmentsForExport(
  ctx: BlindedContext,
): Promise<RobAssessmentView[]> {
  await fetchExportPhaseOrThrow(ctx, 'rob');
  return fetchRobRows(ctx.reviewId);
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
