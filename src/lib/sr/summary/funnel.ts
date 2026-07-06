import {
  buildStageRail,
  type SrStageId,
  type StageRailItem,
} from '@/lib/sr/stage-rail';
import type { SafeProgress, SurfaceProgress } from '@/lib/sr/authz/policy';

// ─────────────────────────────────────────────────────────────────────────────
// Review Summary — the pure funnel-home view derivation (no DB, no React).
//
// Ported from the ScholarSync precursor's `funnel.ts`, but the *call site* is
// relocated: the precursor derived counts from a monolithic client store that
// held every reviewer's votes (the structural blinding hole). Here the ONLY
// inputs are values the blinding chokepoint already deemed safe:
//   - `studyCount`  — the non-blinded imported total (from `studies`).
//   - `safeProgress` — completion counts only, from `getSafeProgress` (the T2
//     chokepoint). Never a decision distribution, conflict count, or per-partner
//     status. See sr-build-plan-p4/report.md §2.2 + §4 (row 0).
//
// This module is deliberately side-effect-free so the "nothing but safe counts
// ever reaches the view" invariant is provable in unit tests. It cannot emit a
// distribution because it is never handed one.
// ─────────────────────────────────────────────────────────────────────────────

// The three blinded surfaces map onto three funnel stages. Their safe progress
// is the only per-surface number the summary shows during `independent`.
export type BlindedSurfaceId = 'screening' | 'extraction' | 'rob';

export interface SurfaceProgressView {
  id: BlindedSurfaceId;
  label: string;
  finishedReviewers: number;
  totalReviewers: number;
  /** Completion fraction 0..1 for the safe progress bar (0 when nobody is expected). */
  fraction: number;
  /** Safe, human-readable completion line — completion counts only. */
  caption: string;
}

export interface FunnelStageView {
  id: SrStageId;
  label: string;
  /** Funnel position (1–9); absent for the Review-group stages (unused here). */
  n?: number;
  /** True while the stage has a route today; false → coming soon. */
  built: boolean;
  /** The stage route, present iff `built`. */
  href: string | null;
  /** A safe meta line (imported total or completion counts); null when none is safe. */
  meta: string | null;
  /** Blinded-surface completion progress, attached to screening/extraction/rob. */
  surface: SurfaceProgressView | null;
}

export interface FunnelSummaryModel {
  reviewId: string;
  /** Non-blinded imported study total (from `studies`). */
  imported: number;
  /** First-run state: no references imported yet. */
  isEmpty: boolean;
  /** The funnel-group stages, Import → Export, in shell-rail order. */
  stages: FunnelStageView[];
  /** Safe completion progress for the three blinded surfaces. */
  surfaces: SurfaceProgressView[];
}

export interface FunnelSummaryInput {
  reviewId: string;
  /** Imported study total — non-blinded, from `studies`. */
  studyCount: number;
  /** Completion-count-only progress from the chokepoint (`getSafeProgress`). */
  safeProgress: SafeProgress;
}

const SURFACE_LABEL: Record<BlindedSurfaceId, string> = {
  screening: 'Title & abstract screening',
  extraction: 'Data extraction',
  rob: 'Risk of bias',
};

// The funnel stage that carries each blinded surface's safe progress.
const SURFACE_STAGE: Record<BlindedSurfaceId, SrStageId> = {
  screening: 'screening',
  extraction: 'extraction',
  rob: 'rob',
};

const SURFACE_ORDER: readonly BlindedSurfaceId[] = [
  'screening',
  'rob',
  'extraction',
];

function completionCaption(finished: number, total: number): string {
  if (total === 0) return 'Awaiting reviewers';
  const reviewers = total === 1 ? 'reviewer' : 'reviewers';
  return `${finished} of ${total} ${reviewers} finished`;
}

function toSurfaceView(
  id: BlindedSurfaceId,
  progress: SurfaceProgress,
): SurfaceProgressView {
  const { finishedReviewers, totalReviewers } = progress;
  return {
    id,
    label: SURFACE_LABEL[id],
    finishedReviewers,
    totalReviewers,
    fraction: totalReviewers === 0 ? 0 : finishedReviewers / totalReviewers,
    caption: completionCaption(finishedReviewers, totalReviewers),
  };
}

function stageMeta(
  stageId: SrStageId,
  studyCount: number,
  surface: SurfaceProgressView | null,
): string | null {
  if (stageId === 'import') {
    return studyCount > 0 ? `${studyCount} imported` : 'No references yet';
  }
  // Every other safe number is a completion count carried by its surface.
  return surface ? surface.caption : null;
}

function toStageView(
  item: StageRailItem,
  studyCount: number,
  surfacesByStage: Map<SrStageId, SurfaceProgressView>,
): FunnelStageView {
  const built = !item.comingSoon;
  const surface = surfacesByStage.get(item.id) ?? null;
  return {
    id: item.id,
    label: item.label,
    n: item.n,
    built,
    href: item.href ?? null,
    meta: stageMeta(item.id, studyCount, surface),
    surface,
  };
}

/**
 * Compile the funnel-home view model from chokepoint-safe inputs. The output can
 * only ever carry the imported total and completion counts — there is no code
 * path that surfaces a co-reviewer's decision, because none is ever passed in.
 */
export function buildFunnelSummary(
  input: FunnelSummaryInput,
): FunnelSummaryModel {
  const { reviewId, studyCount, safeProgress } = input;

  const surfaces = SURFACE_ORDER.map((id) =>
    toSurfaceView(id, safeProgress[id]),
  );

  const surfacesByStage = new Map<SrStageId, SurfaceProgressView>(
    surfaces.map((surface) => [SURFACE_STAGE[surface.id], surface]),
  );

  const rail = buildStageRail({
    reviewId,
    activeStage: 'summary',
    studyCount,
  });
  const funnel = rail.find((group) => group.id === 'funnel');
  const stages = (funnel?.items ?? []).map((item) =>
    toStageView(item, studyCount, surfacesByStage),
  );

  return {
    reviewId,
    imported: studyCount,
    isEmpty: studyCount === 0,
    stages,
    surfaces,
  };
}
