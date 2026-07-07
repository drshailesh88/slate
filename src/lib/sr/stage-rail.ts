// ─────────────────────────────────────────────────────────────────────────────
// The SR stage rail — the funnel spine every review screen renders beside.
//
// Ported and adapted from the ScholarSync precursor's stage-rail. Two changes
// for the Slate re-home:
//   1. The rail is grouped: a "Review" group (setup/meta screens) plus the
//      "Funnel" group (Import → Export), matching docs/design/reference/
//      systematic-review.html.
//   2. `BUILT_STAGES` lives in-file (replacing the precursor's enabled-stages
//      module). Only the M2 screens are built; M3+ funnel stages render as
//      disabled "coming soon" rows until their tasks land.
//
// This module is PURE (no DB, no React) so the built-vs-coming-soon and href
// logic is exhaustively unit-testable.
// ─────────────────────────────────────────────────────────────────────────────

export type SrStageId =
  | 'summary'
  | 'members'
  | 'protocol'
  | 'import'
  | 'screening'
  | 'conflicts'
  | 'fulltext'
  | 'rob'
  | 'extraction'
  | 'prisma'
  | 'report'
  | 'export';

// The stages that exist as routes today (M2). Everything else renders locked.
// A simple in-file list — kept here so the rail and its tests share one source
// of truth. Grow this as M3+ funnel screens land.
export const BUILT_STAGES: readonly SrStageId[] = [
  'summary',
  'members',
  'protocol',
  'import',
  'screening',
  'conflicts',
  'rob',
  'extraction',
];

export type StageRailGroupId = 'review' | 'funnel';

export interface StageRailItem {
  id: SrStageId;
  label: string;
  /** Funnel position (1–9); absent for the Review-group entries. */
  n?: number;
  /** Small mono count shown on the right (e.g. imported study count). */
  count?: string;
  /** True while the stage is the one currently open. */
  active: boolean;
  /** True while the stage has no route yet — rendered disabled. */
  comingSoon: boolean;
  /** Present iff the stage is built; the row links here. */
  href?: string;
}

export interface StageRailGroup {
  id: StageRailGroupId;
  label: string;
  items: StageRailItem[];
}

export interface StageRailInput {
  reviewId: string;
  activeStage: SrStageId;
  /** Number of imported studies — the one safe (non-blinded) rail count. */
  studyCount?: number;
}

// Path segment appended after /systematic-review/{reviewId}. The summary is the
// review index (no segment); every other stage owns a child segment.
const STAGE_SEGMENT: Record<Exclude<SrStageId, 'summary'>, string> = {
  members: 'members',
  protocol: 'protocol',
  import: 'import',
  screening: 'screening',
  conflicts: 'conflicts',
  fulltext: 'full-text',
  rob: 'risk-of-bias',
  extraction: 'extraction',
  prisma: 'prisma',
  report: 'report',
  export: 'export',
};

export function stageHref(reviewId: string, stage: SrStageId): string {
  const base = `/systematic-review/${reviewId}`;
  return stage === 'summary' ? base : `${base}/${STAGE_SEGMENT[stage]}`;
}

export function isStageBuilt(stage: SrStageId): boolean {
  return BUILT_STAGES.includes(stage);
}

type StageBlueprint = { id: SrStageId; label: string; n?: number };

const REVIEW_STAGES: StageBlueprint[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'members', label: 'Team' },
  { id: 'protocol', label: 'Protocol' },
];

const FUNNEL_STAGES: StageBlueprint[] = [
  { id: 'import', label: 'Import', n: 1 },
  { id: 'screening', label: 'Title & abstract', n: 2 },
  { id: 'conflicts', label: 'Resolve conflicts', n: 3 },
  { id: 'fulltext', label: 'Full-text review', n: 4 },
  { id: 'rob', label: 'Risk of bias', n: 5 },
  { id: 'extraction', label: 'Data extraction', n: 6 },
  { id: 'prisma', label: 'PRISMA', n: 7 },
  { id: 'report', label: 'Report', n: 8 },
  { id: 'export', label: 'Export', n: 9 },
];

function toItem(
  blueprint: StageBlueprint,
  input: StageRailInput,
): StageRailItem {
  const built = isStageBuilt(blueprint.id);
  const count =
    blueprint.id === 'import' &&
    input.studyCount !== undefined &&
    input.studyCount > 0
      ? String(input.studyCount)
      : undefined;

  return {
    id: blueprint.id,
    label: blueprint.label,
    n: blueprint.n,
    count,
    active: blueprint.id === input.activeStage,
    comingSoon: !built,
    href: built ? stageHref(input.reviewId, blueprint.id) : undefined,
  };
}

export function buildStageRail(input: StageRailInput): StageRailGroup[] {
  return [
    {
      id: 'review',
      label: 'Review',
      items: REVIEW_STAGES.map((stage) => toItem(stage, input)),
    },
    {
      id: 'funnel',
      label: 'The funnel',
      items: FUNNEL_STAGES.map((stage) => toItem(stage, input)),
    },
  ];
}

const ALL_STAGES: SrStageId[] = [...REVIEW_STAGES, ...FUNNEL_STAGES].map(
  (s) => s.id,
);

// Resolve which stage a pathname is on, so the rail can highlight it. Falls back
// to the summary (the review index) when no child segment matches.
export function activeStageFromPath(
  pathname: string,
  reviewId: string,
): SrStageId {
  const match = ALL_STAGES.find(
    (stage) =>
      stage !== 'summary' && pathname.startsWith(stageHref(reviewId, stage)),
  );
  return match ?? 'summary';
}
