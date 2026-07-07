import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { reviews, studies } from '@/lib/db/schema/sr';
import { castAiScreeningDecisions } from '@/lib/sr/authz/ai-screening-write';
import type { ReviewMode } from '@/lib/sr/review-modes';
import {
  getAiPhase1Mode,
  shouldAiRunDuringIndependent,
  type AiPhase1Mode,
} from './config';
import { AiNotValidatedError } from './errors';
import { hasPassingValidation } from './validation';
import type {
  AiScreeningInput,
  AiScreeningVerdict,
  ScreeningModel,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// THE AI SCREENING ORCHESTRATOR — where every safeguard is composed. It is the
// only path that turns model verdicts into blinded screening-decision rows, and
// it enforces, in order:
//
//   1. GATE (FOUNDATION §8): the AI cannot cast a single decision unless a
//      passing recall validation exists — else AiNotValidatedError.
//   2. PHASE-1 SWITCH (§ founder-deferred): during `independent` it runs only in
//      silent_hold (default); in defer_to_phase2 it is a clean no-op until
//      `reconcile`. This is the ONE switch; flipping it changes nothing else.
//   3. BLINDED like a human: verdicts are written with the AI's own reviewer id;
//      the chokepoint hides them from humans until reconcile (no code here reads
//      or reveals them). No score is ever produced or returned.
//   4. NEVER autonomous: it only casts blinded verdicts via the authz writer —
//      it never excludes/removes a study.
//   5. COVERAGE-preserving: the AI is a SYNTHETIC user, never a review_members
//      row, so it is never one of the required human reviewers.
//
// This module reads only VISIBLE tables (reviews, studies, users) and writes the
// blinded verdicts exclusively through src/lib/sr/authz/ai-screening-write.
// ─────────────────────────────────────────────────────────────────────────────

// A study is "out of the pool" when it was removed as a duplicate; the AI does
// not spend a screen on it.
const OUT_OF_POOL_DUPE = ['auto_merged', 'merged'] as const;

// Deterministic, review-scoped identity for the AI reviewer. It is never a
// WorkOS user and never a review_members row.
function aiReviewerWorkosId(reviewId: string): string {
  return `system:ai-reviewer:${reviewId}`;
}

// Upsert the synthetic AI reviewer user and return its internal users.id. This
// writes ONLY the users mirror — never review_members — so the AI can author
// blinded rows without ever counting as a human reviewer (coverage-preserving).
export async function ensureAiReviewerUser(reviewId: string): Promise<string> {
  const db = getDb();
  const [row] = await db
    .insert(users)
    .values({
      workosUserId: aiReviewerWorkosId(reviewId),
      email: `ai-reviewer+${reviewId}@system.slate`,
      name: 'AI reviewer',
    })
    .onConflictDoUpdate({
      target: users.workosUserId,
      set: { updatedAt: new Date() },
    })
    .returning({ id: users.id });
  return row.id;
}

interface ReviewScreeningState {
  reviewMode: ReviewMode;
  screeningPhase: 'independent' | 'reconcile';
  screeningStage: 'title_abstract' | 'full_text';
}

// The review_mode + per-surface phase + stage are read SERVER-SIDE (never from a
// client) — the caller cannot spoof "we're in reconcile" or change the mode.
async function loadReviewState(
  reviewId: string,
): Promise<ReviewScreeningState | null> {
  const db = getDb();
  const [row] = await db
    .select({
      reviewMode: reviews.reviewMode,
      screeningPhase: reviews.screeningPhase,
      screeningStage: reviews.screeningStage,
    })
    .from(reviews)
    .where(eq(reviews.id, reviewId))
    .limit(1);
  if (!row) return null;
  return {
    reviewMode: row.reviewMode as ReviewMode,
    screeningPhase: row.screeningPhase as 'independent' | 'reconcile',
    screeningStage: row.screeningStage as 'title_abstract' | 'full_text',
  };
}

interface PoolStudy {
  id: string;
  title: string;
  abstract: string | null;
  authors: string | null;
  journal: string | null;
  year: number | null;
}

async function loadPoolStudies(
  reviewId: string,
  studyIds?: readonly string[],
): Promise<PoolStudy[]> {
  const db = getDb();
  const filters = [
    eq(studies.reviewId, reviewId),
    notInArray(studies.dupeStatus, [...OUT_OF_POOL_DUPE]),
  ];
  if (studyIds && studyIds.length > 0) {
    filters.push(inArray(studies.id, [...studyIds]));
  }
  return db
    .select({
      id: studies.id,
      title: studies.title,
      abstract: studies.abstract,
      authors: studies.authors,
      journal: studies.journal,
      year: studies.year,
    })
    .from(studies)
    .where(and(...filters));
}

function toModelInput(
  study: PoolStudy,
  researchQuestion: string,
  criteria: readonly string[],
): AiScreeningInput {
  return {
    studyId: study.id,
    title: study.title,
    abstract: study.abstract,
    authors: study.authors,
    journal: study.journal,
    year: study.year,
    researchQuestion,
    criteria,
  };
}

// Map a verdict to the row the writer stores. Only an exclude carries a
// structured reason (PRISMA 16b semantics); include/maybe leave it null.
function verdictToRow(studyId: string, verdict: AiScreeningVerdict) {
  const isExclude = verdict.decision === 'exclude';
  return {
    studyId,
    decision: verdict.decision,
    excludeReasonCode: isExclude ? 'ai_ineligible' : null,
    excludeReasonDetail: isExclude ? verdict.reasoning : null,
  };
}

export type AiScreeningRunResult =
  | {
      ran: true;
      screened: number;
      stage: ReviewScreeningState['screeningStage'];
      phase: ReviewScreeningState['screeningPhase'];
      reviewMode: ReviewMode;
      aiReviewerId: string;
    }
  | { ran: false; reason: 'phase_deferred'; phase: 'independent' };

export interface RunAiScreeningArgs {
  reviewId: string;
  model: ScreeningModel;
  /** The protocol screening frame the model sees. */
  researchQuestion: string;
  criteria: readonly string[];
  /** Overrides the founder default; injectable for tests. */
  phase1Mode?: AiPhase1Mode;
  /** Screen only these studies (still review-scoped); default: the whole pool. */
  studyIds?: readonly string[];
  now?: Date;
}

export async function runAiScreening(
  args: RunAiScreeningArgs,
): Promise<AiScreeningRunResult> {
  const state = await loadReviewState(args.reviewId);
  if (!state) {
    throw new Error(
      `Cannot run AI screening: review ${args.reviewId} not found. The caller must authorize the review before invoking the AI reviewer.`,
    );
  }

  const mode = args.phase1Mode ?? getAiPhase1Mode();

  // PHASE-1 SWITCH — the clean early no-op. In defer_to_phase2 the AI does not
  // run (and casts nothing) until the surface reaches reconcile.
  if (
    state.screeningPhase === 'independent' &&
    !shouldAiRunDuringIndependent(mode)
  ) {
    return { ran: false, reason: 'phase_deferred', phase: 'independent' };
  }

  // THE GATE — no passing recall validation → the AI screens nothing.
  if (!(await hasPassingValidation(args.reviewId))) {
    throw new AiNotValidatedError();
  }

  const pool = await loadPoolStudies(args.reviewId, args.studyIds);
  if (pool.length === 0) {
    const aiReviewerId = await ensureAiReviewerUser(args.reviewId);
    return {
      ran: true,
      screened: 0,
      stage: state.screeningStage,
      phase: state.screeningPhase,
      reviewMode: state.reviewMode,
      aiReviewerId,
    };
  }

  const rows = [];
  for (const study of pool) {
    const verdict = await args.model.screen(
      toModelInput(study, args.researchQuestion, args.criteria),
    );
    rows.push(verdictToRow(study.id, verdict));
  }

  const aiReviewerId = await ensureAiReviewerUser(args.reviewId);
  await castAiScreeningDecisions({
    reviewId: args.reviewId,
    stage: state.screeningStage,
    aiReviewerId,
    rows,
    now: args.now,
  });

  // Completion count ONLY — never a distribution of the AI's own verdicts (that
  // would anchor humans during independent, defeating the blinding).
  return {
    ran: true,
    screened: rows.length,
    stage: state.screeningStage,
    phase: state.screeningPhase,
    reviewMode: state.reviewMode,
    aiReviewerId,
  };
}
