import type { ScreeningConflict } from './derive';
import { ConflictResolutionInvalidError } from './errors';
import type { ConflictStore, ResolutionRow } from './store';
import type {
  AlignDecision,
  ConflictItemDTO,
  ConflictResolutionDTO,
  ResolutionMethod,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Conflict adjudication — the NO-AUTO-RESOLVE state machine (pure, port-backed).
//
// A screening conflict transitions to resolved ONLY through an explicit human
// action carrying an actor id. There is deliberately no function anywhere that
// derives a resolution from the votes (no majority, no "resolve to consensus"):
//   • align_on_one     → a human picked include OR exclude, recorded verbatim.
//   • send_to_arbitrator → handed to an independent arbitrator (its independence
//                          is asserted by the caller before this runs).
// Every resolution records who + when + how, and also writes an audit_log row.
// ─────────────────────────────────────────────────────────────────────────────

export interface ResolveConflictArgs {
  reviewId: string;
  studyId: string;
  stage: string;
  method: ResolutionMethod;
  decision: AlignDecision | null;
  arbitratorId: string | null;
  note: string | null;
  // The human recording the resolution — never empty (guarded below).
  actorId: string;
}

export async function resolveConflict(
  store: ConflictStore,
  args: ResolveConflictArgs,
  now: Date,
): Promise<void> {
  // No actor → no resolution. Nothing writes a final screening status without a
  // human. This is the backstop behind the action's authorization.
  if (!args.actorId) {
    throw new ConflictResolutionInvalidError(
      'A conflict resolution must be attributed to a human actor.',
    );
  }

  let decision: string | null;
  let arbitratorId: string | null;

  if (args.method === 'align_on_one') {
    // Must be an explicit include/exclude the human picked — never inferred.
    if (args.decision !== 'include' && args.decision !== 'exclude') {
      throw new ConflictResolutionInvalidError();
    }
    decision = args.decision;
    arbitratorId = null;
  } else if (args.method === 'send_to_arbitrator') {
    if (!args.arbitratorId) {
      throw new ConflictResolutionInvalidError(
        'Sending a conflict to arbitration requires an independent arbitrator.',
      );
    }
    decision = null;
    arbitratorId = args.arbitratorId;
  } else {
    throw new ConflictResolutionInvalidError('Unknown resolution method.');
  }

  const note =
    args.note && args.note.trim().length > 0 ? args.note.trim() : null;

  await store.recordResolution(
    {
      reviewId: args.reviewId,
      studyId: args.studyId,
      stage: args.stage,
      method: args.method,
      decision,
      arbitratorId,
      note,
      resolvedBy: args.actorId,
    },
    now,
  );

  await store.appendAudit({
    reviewId: args.reviewId,
    actorId: args.actorId,
    action: 'conflict.resolve',
    target: `conflict:${args.reviewId}:${args.studyId}:${args.stage}`,
    before: null,
    after: { method: args.method, decision, arbitratorId, note },
  });
}

// ── Pure view assembly (RSC → client) ────────────────────────────────────────

export interface StudyMeta {
  title: string;
  authors: string | null;
  journal: string | null;
  year: number | null;
}

function resolutionToDTO(
  row: ResolutionRow,
  names: ReadonlyMap<string, string>,
): ConflictResolutionDTO {
  return {
    studyId: row.studyId,
    method: row.method,
    decision: row.decision,
    arbitratorId: row.arbitratorId,
    arbitratorName: row.arbitratorId
      ? (names.get(row.arbitratorId) ?? null)
      : null,
    note: row.note,
    resolvedBy: row.resolvedBy,
    resolvedByName: names.get(row.resolvedBy) ?? null,
    resolvedAt: row.resolvedAt.toISOString(),
  };
}

// Merge the chokepoint's conflict list with visible study/member metadata and
// any recorded resolutions into serializable items. Every opposing call is kept
// (equal weight) in the order the chokepoint produced; resolutions are matched
// per study/stage. Pure so the DTO shape is unit-tested without a DB.
export function assembleConflicts(args: {
  conflicts: readonly ScreeningConflict[];
  resolutions: readonly ResolutionRow[];
  studies: ReadonlyMap<string, StudyMeta>;
  names: ReadonlyMap<string, string>;
}): ConflictItemDTO[] {
  const { conflicts, resolutions, studies, names } = args;

  return conflicts.map((conflict) => {
    const meta = studies.get(conflict.studyId);
    const resolution = resolutions.find(
      (r) => r.studyId === conflict.studyId && r.stage === conflict.stage,
    );

    return {
      studyId: conflict.studyId,
      title: meta?.title ?? 'Untitled study',
      authors: meta?.authors ?? null,
      journal: meta?.journal ?? null,
      year: meta?.year ?? null,
      decisions: conflict.decisions.map((d) => ({
        reviewerId: d.reviewerId,
        reviewerName: names.get(d.reviewerId) ?? null,
        decision: d.decision,
        isAi: d.isAi,
        excludeReasonDetail: d.excludeReasonDetail,
      })),
      resolution: resolution ? resolutionToDTO(resolution, names) : null,
    };
  });
}
