import type {
  OwnDecisionDTO,
  ScreeningDecisionKind,
  ScreeningStudyDTO,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Screening queue — PURE (no DB, no React). Derives the ordered work list and
// the caller's own progress from the study pool + the caller's OWN decisions.
//
// Blinding note: every input here is already the caller's own (decisions come
// from the chokepoint filtered to the requester). There is no co-reviewer or AI
// input, so nothing in this module can leak — it is structurally own-only.
// ─────────────────────────────────────────────────────────────────────────────

export interface OwnQueue {
  /** Study ids in display order (default = import order, or AI order when on). */
  order: string[];
  /** Study ids with no decision from the caller yet — the real "to screen". */
  pending: string[];
  /** Study ids the caller has already decided (revisable until they finish). */
  decided: string[];
  decidedCount: number;
  totalCount: number;
}

// Order the pool. Default is the given (import) order. When `useAiOrder` is on
// AND a non-blinded ranking is supplied, the ranking leads and any study missing
// from it keeps its original relative order at the tail — so the queue is always
// a full, stable permutation (no study is ever dropped by reordering).
export function orderStudyIds(
  studies: readonly ScreeningStudyDTO[],
  options: { aiRanking?: readonly string[] | null; useAiOrder?: boolean } = {},
): string[] {
  const ids = studies.map((s) => s.id);
  const { aiRanking, useAiOrder } = options;
  if (!useAiOrder || !aiRanking || aiRanking.length === 0) {
    return ids;
  }

  const known = new Set(ids);
  const ranked = aiRanking.filter((id) => known.has(id));
  const rankedSet = new Set(ranked);
  const tail = ids.filter((id) => !rankedSet.has(id));
  return [...ranked, ...tail];
}

export function buildOwnQueue(
  studies: readonly ScreeningStudyDTO[],
  decisions: readonly OwnDecisionDTO[],
  options: { aiRanking?: readonly string[] | null; useAiOrder?: boolean } = {},
): OwnQueue {
  const order = orderStudyIds(studies, options);
  const decidedIds = new Set(decisions.map((d) => d.studyId));

  const pending = order.filter((id) => !decidedIds.has(id));
  const decided = order.filter((id) => decidedIds.has(id));

  return {
    order,
    pending,
    decided,
    decidedCount: decided.length,
    totalCount: order.length,
  };
}

// Index a decision set by study id for O(1) lookup in the UI.
export function decisionsByStudy(
  decisions: readonly OwnDecisionDTO[],
): Map<string, OwnDecisionDTO> {
  return new Map(decisions.map((d) => [d.studyId, d]));
}

// The next study the caller still has to screen, starting from `fromIndex`
// (exclusive) and wrapping once. Returns -1 when nothing is left to screen.
export function nextPendingIndex(
  order: readonly string[],
  decided: ReadonlySet<string>,
  fromIndex: number,
): number {
  const n = order.length;
  if (n === 0) return -1;
  for (let step = 1; step <= n; step += 1) {
    const idx = (fromIndex + step) % n;
    if (!decided.has(order[idx])) return idx;
  }
  return -1;
}

const DECISION_KINDS: readonly ScreeningDecisionKind[] = [
  'include',
  'maybe',
  'exclude',
];

export function isDecisionKind(value: string): value is ScreeningDecisionKind {
  return (DECISION_KINDS as readonly string[]).includes(value);
}
