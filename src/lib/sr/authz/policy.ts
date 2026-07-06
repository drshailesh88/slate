import type { phaseEnum, reviewRoleEnum } from '@/lib/db/schema/sr-enums';

// ─────────────────────────────────────────────────────────────────────────────
// BLINDING POLICY — the pure decision brain (no DB, no I/O).
//
// This is deliberately side-effect-free so the entire `role × phase × table`
// matrix can be proven exhaustively in unit tests without a database. The
// DB-touching chokepoint (./blinded-read) composes these functions; it never
// re-decides policy itself.
//
// The science invariant these functions guarantee:
//   During the `independent` phase, NO role can retrieve a row authored by
//   another reviewer — through raw reads, aggregates, or progress. A leak here
//   silently invalidates the review (correlated errors) and is a data breach.
//   See FOUNDATION-auth-tenancy.md §6 and sr-build-plan-p4/report.md §2.2.
// ─────────────────────────────────────────────────────────────────────────────

// Single-source-of-truth: derive the unions from the schema enums so a new
// role or phase in the schema forces a policy update (exhaustive switches).
export type ReviewRole = (typeof reviewRoleEnum.enumValues)[number];
export type Phase = (typeof phaseEnum.enumValues)[number];

// The three blinded surfaces, one per blinded base table.
export type BlindedSurface = 'screening' | 'extraction' | 'rob';

// How much of a blinded table a caller may see.
//   'none' — denied. Refuse the read (deny-by-default).
//   'own'  — only rows the caller authored (reviewerId === requesterId).
//   'all'  — every row for the review.
export type Visibility = 'none' | 'own' | 'all';

/**
 * The core matrix. Deny-by-default: only the explicit combinations below grant
 * anything; every other (role, phase) pair — including unknown enum values that
 * slip past the type system at runtime — resolves to `none`.
 *
 * - `independent`: a caller sees ONLY their own authored rows, whatever their
 *   role. Co-reviewer rows are NEVER returned — owner/arbitrator get no peek,
 *   viewer sees nothing. `own` filtered to the requester is the universal
 *   guarantee that no other reviewer's data escapes during independent work.
 * - `reconcile` (owner-triggered, one-way): working roles see all rows so
 *   conflicts can be resolved. `viewer` still sees no raw individual rows — it
 *   reads finished consensus, which is derived data outside these tables.
 */
export function resolveRowVisibility(
  role: ReviewRole,
  phase: Phase,
): Visibility {
  switch (phase) {
    case 'independent':
      switch (role) {
        case 'owner':
        case 'collaborator':
        case 'reviewer':
        case 'arbitrator':
          return 'own';
        case 'viewer':
          return 'none';
        default:
          return 'none';
      }
    case 'reconcile':
      switch (role) {
        case 'owner':
        case 'collaborator':
        case 'reviewer':
        case 'arbitrator':
          return 'all';
        case 'viewer':
          return 'none';
        default:
          return 'none';
      }
    default:
      return 'none';
  }
}

/**
 * Aggregates (decision distributions, conflict counts, PRISMA tallies) ARE
 * blinded data: a count over other reviewers' rows leaks their decisions just
 * as surely as the rows themselves. An aggregate is therefore only permitted
 * when the caller may already see every row — i.e. never during `independent`.
 * The safe completion-count surface (`getSafeProgress`) is the sole exception
 * and does not go through this function.
 */
export function resolveAggregateVisibility(
  role: ReviewRole,
  phase: Phase,
): Extract<Visibility, 'none' | 'all'> {
  return resolveRowVisibility(role, phase) === 'all' ? 'all' : 'none';
}

/**
 * Thrown when the chokepoint refuses a read. Deny-by-default surfaces as a
 * throw, not an empty result, so a denied caller can never be confused with a
 * legitimately-empty one.
 */
export class BlindedAccessError extends Error {
  readonly surface: BlindedSurface;
  readonly role: ReviewRole;
  readonly phase: Phase;
  readonly kind: 'rows' | 'aggregate';

  constructor(
    surface: BlindedSurface,
    role: ReviewRole,
    phase: Phase,
    kind: 'rows' | 'aggregate' = 'rows',
  ) {
    super(
      `Blinding chokepoint denied ${kind} access to "${surface}" for role="${role}" ` +
        `during phase="${phase}". Co-reviewer data is never revealed while independent ` +
        `(deny-by-default). See FOUNDATION-auth-tenancy.md §6.`,
    );
    this.name = 'BlindedAccessError';
    this.surface = surface;
    this.role = role;
    this.phase = phase;
    this.kind = kind;
  }
}

/**
 * Filter a row set to what `visibility` permits. `none` yields nothing; callers
 * should have thrown before reaching here, but this stays defensive so a policy
 * bug can never widen a result.
 */
export function applyRowVisibility<T extends { reviewerId: string }>(
  rows: readonly T[],
  visibility: Visibility,
  requesterId: string,
): T[] {
  switch (visibility) {
    case 'all':
      return [...rows];
    case 'own':
      return rows.filter((row) => row.reviewerId === requesterId);
    case 'none':
      return [];
    default:
      return [];
  }
}

// ── Safe progress (the ONLY progress surface during independent) ──────────────

// Completion counts ONLY. No decision distribution, no conflict count, no
// per-study or per-partner status — nothing that could reveal what another
// reviewer decided. This shape is the contract; do not add fields to it.
export type SurfaceProgress = {
  finishedReviewers: number;
  totalReviewers: number;
};

export type SafeProgress = {
  screening: SurfaceProgress;
  extraction: SurfaceProgress;
  rob: SurfaceProgress;
};

type ProgressRow = { reviewerId: string; lockedAt: Date | string | null };

/**
 * Compute completion counts for one surface without exposing any decision data.
 * A reviewer counts as "finished" when they have authored at least one row and
 * every row they authored is locked. The denominator is the set of members
 * expected to contribute (resolved by the caller from `review_members`), so a
 * reviewer who has not started still counts toward the total ("2 of 3").
 *
 * The output is integers only — by construction it cannot carry a distribution.
 */
export function computeSurfaceProgress(
  rows: readonly ProgressRow[],
  reviewingMemberIds: readonly string[],
): SurfaceProgress {
  const expected = new Set(reviewingMemberIds);

  const perReviewer = new Map<
    string,
    { hasRows: boolean; allLocked: boolean }
  >();
  for (const row of rows) {
    const prev = perReviewer.get(row.reviewerId) ?? {
      hasRows: false,
      allLocked: true,
    };
    perReviewer.set(row.reviewerId, {
      hasRows: true,
      allLocked: prev.allLocked && row.lockedAt != null,
    });
  }

  let finished = 0;
  for (const memberId of expected) {
    const agg = perReviewer.get(memberId);
    if (agg?.hasRows && agg.allLocked) finished += 1;
  }

  return { finishedReviewers: finished, totalReviewers: expected.size };
}
