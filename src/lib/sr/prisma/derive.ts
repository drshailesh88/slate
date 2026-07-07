// ─────────────────────────────────────────────────────────────────────────────
// PRISMA 2020 flow derivation — PURE (no DB, no React, no I/O).
//
// Ported from the ScholarSync precursor (src/lib/sr/prisma.ts::derivePrismaCounts
// + deriveExclusionReasonCounts) and RELOCATED to Slate's server model: the
// precursor derived these counts in the browser from a client store holding all
// votes (the structural blinding hole). Here the math is pure and structural —
// it names no blinded table symbol — and its ONLY call site for blinded inputs
// is the chokepoint (src/lib/sr/authz/blinded-read.ts::getPrismaFlow), which is
// the only place allowed to fetch screening rows and the only phase gate. Same
// split as conflicts/derive.ts (the §2.2 rule for all blinded aggregates).
//
// The auditable-record invariant: EVERY imported record lands in exactly one
// terminal bucket, so the flow reconciles at every stage (in = out + excluded)
// and a record never silently disappears:
//
//   identified = duplicatesRemoved + screened
//   screened   = taExcluded + taInProgress + advanced
//   advanced   = ftExcluded + included + ftInProgress
//   ftExcluded = Σ per-reason counts (a reason-less exclusion is an explicit
//                "not recorded" bucket, never a dropped record — the precursor
//                silently skipped those)
// ─────────────────────────────────────────────────────────────────────────────

// A study row from the VISIBLE `studies` table (non-blinded). The pool follows
// the screening screen's definition exactly (screening/load.ts): confidently
// removed duplicates (`auto_merged`/`merged`) leave; `needs_review`/`kept`/
// `unique` stay — so PRISMA reconciles with what reviewers actually screened.
export interface PrismaStudyRow {
  id: string;
  source: string | null;
  dupeStatus: string;
}

// One screening call, structurally identical to the chokepoint's
// ScreeningDecisionView (widened strings, so a View is assignable without a cast).
export interface PrismaDecisionRow {
  studyId: string;
  reviewerId: string;
  stage: string;
  decision: string;
  isAi: boolean;
  excludeReasonCode: string | null;
}

// A recorded conflict resolution (screening_conflict_resolutions — visible,
// rows only exist at reconcile). `decision` is null while a study sits with an
// arbitrator: pending arbitration is IN PROGRESS, never a guessed outcome.
export interface PrismaResolutionRow {
  studyId: string;
  stage: string;
  method: string;
  decision: string | null;
}

export interface PrismaSourceCount {
  source: string | null;
  count: number;
  studyIds: string[];
}

export interface PrismaReasonCount {
  /** null = the exclusion carries no recorded reason (shown, never dropped). */
  code: string | null;
  count: number;
  studyIds: string[];
}

export type PrismaBucketKey =
  | 'duplicates'
  | 'taExcluded'
  | 'taInProgress'
  | 'ftExcluded'
  | 'ftInProgress'
  | 'included';

export interface PrismaIdentification {
  identified: number;
  perSource: PrismaSourceCount[];
  duplicatesRemoved: number;
  /** The removed duplicates' ids — drill-down data (non-blinded). */
  duplicateStudyIds: string[];
  screened: number;
}

export interface PrismaFlow {
  identification: PrismaIdentification;
  screening: {
    screened: number;
    excluded: number;
    inProgress: number;
    advanced: number;
  };
  eligibility: {
    assessed: number;
    excluded: number;
    exclusionReasons: PrismaReasonCount[];
    inProgress: number;
  };
  included: {
    /** Included studies. One imported record = one report in this model, */
    studies: number;
    /** so reports of included studies equals the study count. */
    reports: number;
  };
  /** Every pool record's terminal bucket — the drill-down study-id lists. */
  buckets: Record<PrismaBucketKey, string[]>;
}

const REMOVED_DUPE_STATUSES = new Set(['auto_merged', 'merged']);

// null (no recorded source / reason) sorts after every named entry.
function compareNullsLast(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b);
}

function isRemovedDuplicate(study: PrismaStudyRow): boolean {
  return REMOVED_DUPE_STATUSES.has(study.dupeStatus);
}

/**
 * The Identification block alone. Derived purely from the visible `studies`
 * rows, so it is NOT blinded data — the PRISMA page shows it even while
 * screening is independent (when the rest of the flow is withheld).
 */
export function derivePrismaIdentification(
  studies: readonly PrismaStudyRow[],
): PrismaIdentification {
  const bySource = new Map<string | null, string[]>();
  for (const study of studies) {
    const key = study.source ?? null;
    const ids = bySource.get(key);
    if (ids) ids.push(study.id);
    else bySource.set(key, [study.id]);
  }

  const perSource = [...bySource.entries()]
    .map(([source, studyIds]) => ({ source, count: studyIds.length, studyIds }))
    .sort((a, b) => b.count - a.count || compareNullsLast(a.source, b.source));

  const duplicateStudyIds = studies
    .filter(isRemovedDuplicate)
    .map((study) => study.id);

  return {
    identified: studies.length,
    perSource,
    duplicatesRemoved: duplicateStudyIds.length,
    duplicateStudyIds,
    screened: studies.length - duplicateStudyIds.length,
  };
}

type StageOutcome = 'advanced' | 'excluded' | 'in_progress';

// Include and Maybe both collapse to "positive" at title & abstract (a Maybe
// advances to full text — Covidence model, mirrors the precursor's isPositive).
function isPositive(decision: string): boolean {
  return decision === 'include' || decision === 'maybe';
}

interface StageInput {
  stage: string;
  calls: readonly PrismaDecisionRow[];
  resolution: PrismaResolutionRow | undefined;
  requiredHumans: number;
}

// The per-study, per-stage outcome. A recorded resolution wins; otherwise the
// study is decided only when enough humans have called AND every call (human +
// AI — an AI opposition needs human reconciliation too) lands the same way.
// Anything else is IN PROGRESS: an unresolved conflict, a pending arbitration,
// or missing calls never silently become an exclusion.
function resolveStageOutcome(input: StageInput): StageOutcome {
  const { stage, calls, resolution, requiredHumans } = input;

  if (resolution) {
    if (resolution.decision === 'include') return 'advanced';
    if (resolution.decision === 'exclude') return 'excluded';
    return 'in_progress';
  }

  const humans = calls.filter((call) => !call.isAi);
  if (humans.length < requiredHumans) return 'in_progress';

  if (stage === 'title_abstract') {
    if (calls.every((call) => isPositive(call.decision))) return 'advanced';
    if (calls.every((call) => call.decision === 'exclude')) return 'excluded';
    return 'in_progress';
  }

  // Full text is strict: an inclusion is unanimous 'include'; a Maybe here is
  // still an open question, never an implicit advance.
  if (calls.every((call) => call.decision === 'include')) return 'advanced';
  if (calls.every((call) => call.decision === 'exclude')) return 'excluded';
  return 'in_progress';
}

function byReviewerId(a: PrismaDecisionRow, b: PrismaDecisionRow): number {
  return a.reviewerId < b.reviewerId ? -1 : a.reviewerId > b.reviewerId ? 1 : 0;
}

// The recorded reason for a full-text exclusion: the first human exclude call
// carrying a code (deterministic reviewer order), then the AI's. null = no
// reason recorded — bucketed explicitly, never dropped.
function fullTextExclusionReason(
  calls: readonly PrismaDecisionRow[],
): string | null {
  const excludes = calls
    .filter((call) => call.decision === 'exclude' && call.excludeReasonCode)
    .sort(byReviewerId);
  const human = excludes.find((call) => !call.isAi);
  return (human ?? excludes[0])?.excludeReasonCode ?? null;
}

function groupBy<T>(items: readonly T[], key: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = groups.get(k);
    if (list) list.push(item);
    else groups.set(k, [item]);
  }
  return groups;
}

export interface PrismaFlowInput {
  studies: readonly PrismaStudyRow[];
  decisions: readonly PrismaDecisionRow[];
  resolutions: readonly PrismaResolutionRow[];
  /** From requiredHumanReviewers(reviewMode) — 2 two_reviewer, 1 ai_co_reviewer. */
  requiredHumans: number;
}

/**
 * The full PRISMA 2020 flow. `decisions` are blinded data — the ONLY caller
 * that may supply real rows is the chokepoint (getPrismaFlow), post-gate.
 */
export function derivePrismaFlow(input: PrismaFlowInput): PrismaFlow {
  const { studies, decisions, resolutions, requiredHumans } = input;

  const identification = derivePrismaIdentification(studies);
  const decisionsByStudy = groupBy(decisions, (d) => d.studyId);
  const resolutionByStudyStage = new Map(
    resolutions.map((r) => [`${r.studyId} ${r.stage}`, r]),
  );

  const buckets: Record<PrismaBucketKey, string[]> = {
    duplicates: [],
    taExcluded: [],
    taInProgress: [],
    ftExcluded: [],
    ftInProgress: [],
    included: [],
  };
  const reasonByCode = new Map<string | null, string[]>();

  for (const study of studies) {
    if (isRemovedDuplicate(study)) {
      buckets.duplicates.push(study.id);
      continue;
    }

    const calls = decisionsByStudy.get(study.id) ?? [];
    const stageCalls = (stage: string) =>
      calls.filter((call) => call.stage === stage);
    const stageResolution = (stage: string) =>
      resolutionByStudyStage.get(`${study.id} ${stage}`);

    const ta = resolveStageOutcome({
      stage: 'title_abstract',
      calls: stageCalls('title_abstract'),
      resolution: stageResolution('title_abstract'),
      requiredHumans,
    });
    if (ta === 'excluded') {
      buckets.taExcluded.push(study.id);
      continue;
    }
    if (ta === 'in_progress') {
      buckets.taInProgress.push(study.id);
      continue;
    }

    const ftCalls = stageCalls('full_text');
    const ft = resolveStageOutcome({
      stage: 'full_text',
      calls: ftCalls,
      resolution: stageResolution('full_text'),
      requiredHumans,
    });
    if (ft === 'excluded') {
      buckets.ftExcluded.push(study.id);
      const code = fullTextExclusionReason(ftCalls);
      const ids = reasonByCode.get(code);
      if (ids) ids.push(study.id);
      else reasonByCode.set(code, [study.id]);
      continue;
    }
    if (ft === 'advanced') {
      buckets.included.push(study.id);
      continue;
    }
    buckets.ftInProgress.push(study.id);
  }

  const exclusionReasons = [...reasonByCode.entries()]
    .map(([code, studyIds]) => ({ code, count: studyIds.length, studyIds }))
    .sort((a, b) => b.count - a.count || compareNullsLast(a.code, b.code));

  const advanced =
    buckets.ftExcluded.length +
    buckets.included.length +
    buckets.ftInProgress.length;

  return {
    identification,
    screening: {
      screened: identification.screened,
      excluded: buckets.taExcluded.length,
      inProgress: buckets.taInProgress.length,
      advanced,
    },
    eligibility: {
      assessed: advanced,
      excluded: buckets.ftExcluded.length,
      exclusionReasons,
      inProgress: buckets.ftInProgress.length,
    },
    included: {
      studies: buckets.included.length,
      reports: buckets.included.length,
    },
    buckets,
  };
}
