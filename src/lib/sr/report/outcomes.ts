import {
  rollUpOverall,
  type RobInstrument,
  type RobJudgement,
} from '@/lib/sr/rob/domains';
import type { RobOverallOutcome } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Report outcome derivations — PURE (no DB, no React, no I/O).
//
// These are aggregates over EVERY reviewer's blinded rows, so — like the T13
// conflict math — the functions take minimal structural row types (they name no
// blinded table symbol) and their ONLY call sites are the reconcile-gated
// chokepoint functions in src/lib/sr/authz/blinded-read.ts. The math is pure so
// it is exhaustively unit-testable with plain objects; the phase gate lives
// where the rows live.
// ─────────────────────────────────────────────────────────────────────────────

// A screening call as the chokepoint returns it (post-unblind). Structurally
// assignable from ScreeningDecisionView without a cast.
export interface OutcomeDecisionRow {
  studyId: string;
  reviewerId: string;
  stage: string;
  decision: string;
  isAi: boolean;
  excludeReasonCode: string | null;
}

// A recorded human resolution (visible table screening_conflict_resolutions).
export interface OutcomeResolutionRow {
  studyId: string;
  stage: string;
  method: string;
  decision: string | null;
  arbitratorId: string | null;
}

export interface ScreeningOutcomes {
  stage: string;
  includedStudyIds: string[];
  excludedStudyIds: string[];
  /** Per-reason exclusion counts (PRISMA Item 16b shape). */
  excludeReasonCounts: Array<{ code: string | null; count: number }>;
  /** Opposing calls with no recorded resolution (incl. pending arbitration). */
  conflictPending: number;
  /** Studies not yet carrying the required dual coverage. */
  inProgress: number;
}

export interface DeriveScreeningOutcomesInput {
  decisions: readonly OutcomeDecisionRow[];
  resolutions: readonly OutcomeResolutionRow[];
  /** The non-removed study pool — unscreened studies count as in-progress. */
  studyIds: readonly string[];
  stage: string;
  /** 'ai_co_reviewer' lets the validated AI's call complete dual coverage. */
  reviewMode: 'two_reviewer' | 'ai_co_reviewer';
}

type StudyStatus = 'included' | 'excluded' | 'conflict' | 'in_progress';

const DUAL_COVERAGE = 2;

function requiredHumanVoters(mode: DeriveScreeningOutcomesInput['reviewMode']) {
  return mode === 'ai_co_reviewer' ? 1 : 2;
}

function decideStudy(
  votes: readonly OutcomeDecisionRow[],
  resolution: OutcomeResolutionRow | undefined,
  decisionsByReviewer: ReadonlyMap<string, OutcomeDecisionRow>,
  mode: DeriveScreeningOutcomesInput['reviewMode'],
): { status: StudyStatus; excludeReason: string | null } {
  // A recorded human resolution settles the study.
  if (resolution) {
    if (resolution.method === 'align_on_one' && resolution.decision) {
      return resolution.decision === 'include'
        ? { status: 'included', excludeReason: null }
        : { status: 'excluded', excludeReason: excludeReasonOf(votes) };
    }
    if (resolution.method === 'send_to_arbitrator') {
      const arbitratorCall = resolution.arbitratorId
        ? decisionsByReviewer.get(resolution.arbitratorId)
        : undefined;
      if (arbitratorCall?.decision === 'include') {
        return { status: 'included', excludeReason: null };
      }
      if (arbitratorCall?.decision === 'exclude') {
        return {
          status: 'excluded',
          excludeReason:
            arbitratorCall.excludeReasonCode ?? excludeReasonOf(votes),
        };
      }
      // Sent to an arbitrator who has not decided yet — still a pending conflict.
      return { status: 'conflict', excludeReason: null };
    }
  }

  // In two_reviewer mode the AI's call is one more opinion — it never counts
  // toward coverage or an outcome. In ai_co_reviewer mode the validated AI IS
  // the second reviewer, so its call counts (a human still resolves conflicts).
  const counting =
    mode === 'ai_co_reviewer' ? votes : votes.filter((v) => !v.isAi);

  const includes = counting.filter((v) => v.decision === 'include');
  const excludes = counting.filter((v) => v.decision === 'exclude');
  const humanIncludes = includes.filter((v) => !v.isAi).length;
  const humanExcludes = excludes.filter((v) => !v.isAi).length;
  const requiredHumans = requiredHumanVoters(mode);

  if (includes.length > 0 && excludes.length > 0) {
    return { status: 'conflict', excludeReason: null };
  }
  if (includes.length >= DUAL_COVERAGE && humanIncludes >= requiredHumans) {
    return { status: 'included', excludeReason: null };
  }
  if (excludes.length >= DUAL_COVERAGE && humanExcludes >= requiredHumans) {
    return { status: 'excluded', excludeReason: excludeReasonOf(votes) };
  }
  return { status: 'in_progress', excludeReason: null };
}

// The reason attached to an exclusion — a human's structured code first.
function excludeReasonOf(votes: readonly OutcomeDecisionRow[]): string | null {
  const humanReason = votes.find(
    (v) => !v.isAi && v.decision === 'exclude' && v.excludeReasonCode,
  );
  if (humanReason) return humanReason.excludeReasonCode;
  const anyReason = votes.find(
    (v) => v.decision === 'exclude' && v.excludeReasonCode,
  );
  return anyReason?.excludeReasonCode ?? null;
}

export function deriveScreeningOutcomes(
  input: DeriveScreeningOutcomesInput,
): ScreeningOutcomes {
  const stageDecisions = input.decisions.filter((d) => d.stage === input.stage);
  const stageResolutions = input.resolutions.filter(
    (r) => r.stage === input.stage,
  );

  const votesByStudy = new Map<string, OutcomeDecisionRow[]>();
  for (const row of stageDecisions) {
    const list = votesByStudy.get(row.studyId) ?? [];
    votesByStudy.set(row.studyId, [...list, row]);
  }
  const resolutionByStudy = new Map(
    stageResolutions.map((r) => [r.studyId, r]),
  );

  const includedStudyIds: string[] = [];
  const excludedStudyIds: string[] = [];
  const reasonCounts = new Map<string | null, number>();
  let conflictPending = 0;
  let inProgress = 0;

  for (const studyId of input.studyIds) {
    const votes = votesByStudy.get(studyId) ?? [];
    const byReviewer = new Map(votes.map((v) => [v.reviewerId, v]));
    const { status, excludeReason } = decideStudy(
      votes,
      resolutionByStudy.get(studyId),
      byReviewer,
      input.reviewMode,
    );
    if (status === 'included') includedStudyIds.push(studyId);
    else if (status === 'excluded') {
      excludedStudyIds.push(studyId);
      reasonCounts.set(
        excludeReason,
        (reasonCounts.get(excludeReason) ?? 0) + 1,
      );
    } else if (status === 'conflict') conflictPending += 1;
    else inProgress += 1;
  }

  return {
    stage: input.stage,
    includedStudyIds,
    excludedStudyIds,
    excludeReasonCounts: [...reasonCounts.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count),
    conflictPending,
    inProgress,
  };
}

// ── Risk-of-bias roll-up over every reviewer's judgements ────────────────────

// A RoB judgement row as the chokepoint returns it (post-unblind). Structurally
// assignable from RobAssessmentView.
export interface OutcomeRobRow {
  studyId: string;
  reviewerId: string;
  domain: string;
  judgement: string;
  isAi: boolean;
}

export interface RobOutcomes {
  perStudy: Array<{ studyId: string; overall: RobOverallOutcome }>;
  distribution: Record<RobOverallOutcome, number>;
}

function isJudgement(value: string): value is RobJudgement {
  return value === 'low' || value === 'some' || value === 'high';
}

/**
 * The report never fakes a consensus: a study's overall is a judgement only
 * when EVERY human appraiser's instrument roll-up agrees; disagreement is
 * reported as `mixed` (still to be reconciled), no appraisal as `unassessed`.
 * AI suggestion rows never contribute — they are labeled inputs, not appraisals.
 */
export function deriveRobOutcomes(
  rows: readonly OutcomeRobRow[],
  instrumentByStudy: ReadonlyMap<string, RobInstrument>,
  studyIds: readonly string[],
): RobOutcomes {
  const humanRows = rows.filter((r) => !r.isAi && isJudgement(r.judgement));

  const perStudy = studyIds.map((studyId) => {
    const instrument = instrumentByStudy.get(studyId) ?? 'rob2';
    const byReviewer = new Map<string, Map<string, RobJudgement>>();
    for (const row of humanRows) {
      if (row.studyId !== studyId) continue;
      const domains = byReviewer.get(row.reviewerId) ?? new Map();
      domains.set(row.domain, row.judgement as RobJudgement);
      byReviewer.set(row.reviewerId, domains);
    }

    if (byReviewer.size === 0) {
      return { studyId, overall: 'unassessed' as RobOverallOutcome };
    }
    const overalls = [...byReviewer.values()].map((domains) =>
      rollUpOverall(instrument, domains),
    );
    const agreed = overalls.every((o) => o === overalls[0]);
    return {
      studyId,
      overall: (agreed ? overalls[0] : 'mixed') as RobOverallOutcome,
    };
  });

  const distribution: Record<RobOverallOutcome, number> = {
    low: 0,
    some: 0,
    high: 0,
    mixed: 0,
    unassessed: 0,
  };
  for (const entry of perStudy) distribution[entry.overall] += 1;

  return { perStudy, distribution };
}
