// ─────────────────────────────────────────────────────────────────────────────
// Conflict derivation + Cohen's κ — PURE (no DB, no React, no I/O).
//
// This is the view-derivation layer for the Conflicts screen (T13). It runs over
// screening-decision rows that the caller has ALREADY obtained through the
// blinding chokepoint at `reconcile`. It deliberately takes a minimal structural
// row type (not the chokepoint's ScreeningDecisionView) so it names no blinded
// table symbol and can be unit-tested with plain objects — the aggregate math
// itself is executed inside the chokepoint (src/lib/sr/authz/blinded-read.ts),
// which is the only place allowed to fetch these rows and the only phase gate.
//
// The κ math is ported near-verbatim from the ScholarSync precursor
// (src/lib/sr/conflicts.ts); the conflict derivation is rebuilt for the
// server-fetched, post-unblind model (both opposing calls are shown at reconcile,
// at equal weight — not the precursor's client-side vote-strip).
// ─────────────────────────────────────────────────────────────────────────────

export type ScreeningDecisionValue = 'include' | 'exclude' | 'maybe';

// A single screening call on a study, as returned (post-unblind) by the
// chokepoint. `decision`/`stage` are widened to `string` on purpose: the
// chokepoint's ScreeningDecisionView carries them as `string` (the definer
// function returns text), so this row type is structurally assignable FROM a
// View without a cast. The values are DB-enum-constrained in practice.
export interface ScreeningDecisionRow {
  studyId: string;
  reviewerId: string;
  stage: string;
  decision: string;
  isAi: boolean;
  excludeReasonCode: string | null;
  excludeReasonDetail: string | null;
}

// One reviewer's call, kept whole so the UI can render every opposing decision
// at EQUAL visual weight (no "primary" call).
export interface ConflictDecision {
  reviewerId: string;
  decision: string;
  isAi: boolean;
  excludeReasonCode: string | null;
  excludeReasonDetail: string | null;
}

export interface ScreeningConflict {
  studyId: string;
  stage: string;
  // Every call on the study/stage — ordered deterministically, none preferred.
  decisions: ConflictDecision[];
}

export interface KappaReadout {
  value: number | null;
  label: string;
}

// Include and Maybe both collapse to "positive"; Exclude is "negative". This
// mirrors the precursor's isPositive — a Maybe is a lean-toward-include for the
// purpose of measuring agreement, but on its own it is NOT a decision conflict.
function isPositive(decision: string): boolean {
  return decision === 'include' || decision === 'maybe';
}

// Ported verbatim from the precursor (conflicts.ts) — the Landis & Koch bands.
function kappaLabel(value: number): string {
  if (value < 0.01) return 'Poor';
  if (value <= 0.2) return 'Slight';
  if (value <= 0.4) return 'Fair';
  if (value <= 0.6) return 'Moderate';
  if (value <= 0.8) return 'Substantial';
  return 'Almost perfect';
}

function byReviewerId(
  a: ScreeningDecisionRow,
  b: ScreeningDecisionRow,
): number {
  return a.reviewerId < b.reviewerId ? -1 : a.reviewerId > b.reviewerId ? 1 : 0;
}

function groupByStudy(
  rows: readonly ScreeningDecisionRow[],
): Map<string, ScreeningDecisionRow[]> {
  const groups = new Map<string, ScreeningDecisionRow[]>();
  for (const row of rows) {
    const list = groups.get(row.studyId);
    if (list) list.push(row);
    else groups.set(row.studyId, [row]);
  }
  return groups;
}

/**
 * Cohen's κ over the include/exclude collapse of the first two HUMAN calls on
 * each dual-reviewed study (Maybe and Include both count as positive). AI calls
 * are excluded — κ measures inter-HUMAN agreement. Ported from the precursor and
 * adapted to the server-fetched row model.
 */
export function cohensKappa(
  rows: readonly ScreeningDecisionRow[],
): KappaReadout {
  const pairs: Array<{ a: boolean; b: boolean }> = [];
  for (const group of groupByStudy(rows).values()) {
    const human = group.filter((row) => !row.isAi).sort(byReviewerId);
    if (human.length < 2) continue;
    pairs.push({
      a: isPositive(human[0].decision),
      b: isPositive(human[1].decision),
    });
  }

  const n = pairs.length;
  if (n === 0) return { value: null, label: 'Not enough data' };

  const agree = pairs.filter((pair) => pair.a === pair.b).length;
  const po = agree / n;

  const aPos = pairs.filter((pair) => pair.a).length / n;
  const bPos = pairs.filter((pair) => pair.b).length / n;
  const pe = aPos * bPos + (1 - aPos) * (1 - bPos);

  const value = pe === 1 ? 1 : (po - pe) / (1 - pe);
  return { value, label: kappaLabel(value) };
}

// A study is a decision conflict when its calls include BOTH an include and an
// exclude (a genuine opposing pair). A lone Maybe is tentative and never a
// conflict on its own (SCREEN-SPECS §4). AI calls count as one more reviewer to
// reconcile, so an AI-vs-human opposition surfaces here too.
function isConflict(decisions: readonly ConflictDecision[]): boolean {
  const hasInclude = decisions.some((d) => d.decision === 'include');
  const hasExclude = decisions.some((d) => d.decision === 'exclude');
  return hasInclude && hasExclude;
}

function toConflictDecision(row: ScreeningDecisionRow): ConflictDecision {
  return {
    reviewerId: row.reviewerId,
    decision: row.decision,
    isAi: row.isAi,
    excludeReasonCode: row.excludeReasonCode,
    excludeReasonDetail: row.excludeReasonDetail,
  };
}

/**
 * Derive the set of studies whose screening calls oppose, for a given stage.
 * Every conflict carries EVERY call at equal weight — no default "primary". The
 * output is ordered by studyId for a stable, testable queue.
 */
export function deriveScreeningConflicts(
  rows: readonly ScreeningDecisionRow[],
  stage: string,
): ScreeningConflict[] {
  const stageRows = rows.filter((row) => row.stage === stage);
  const conflicts: ScreeningConflict[] = [];

  for (const [studyId, group] of groupByStudy(stageRows)) {
    const decisions = [...group].sort(byReviewerId).map(toConflictDecision);
    if (isConflict(decisions)) {
      conflicts.push({ studyId, stage, decisions });
    }
  }

  return conflicts.sort((a, b) =>
    a.studyId < b.studyId ? -1 : a.studyId > b.studyId ? 1 : 0,
  );
}
