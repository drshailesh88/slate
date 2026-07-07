import type { ReviewRole } from '@/lib/sr/authz/policy';

// ─────────────────────────────────────────────────────────────────────────────
// Who may do what on the Risk-of-Bias surface. Pure predicates over the LIVE
// review_members role (resolved server-side, never a JWT claim). These gate the
// server actions; the UI mirrors them but the server is authoritative.
// ─────────────────────────────────────────────────────────────────────────────

// The roles that produce independent RoB appraisals. Matches the denominator the
// chokepoint uses for safe progress (reviewer + collaborator): owner configures,
// arbitrator reconciles, viewer is read-only — none appraise independently.
const APPRAISER_ROLES: readonly ReviewRole[] = ['reviewer', 'collaborator'];

export function canAppraiseRob(role: ReviewRole): boolean {
  return APPRAISER_ROLES.includes(role);
}

// Only the owner triggers the one-way unblind (independent → reconcile).
export function canUnblindRob(role: ReviewRole): boolean {
  return role === 'owner';
}

// Who records the reconciled (consensus) judgement AFTER unblind. Adjudication is
// an assigned role — the owner and the independent arbitrator. A reviewer's
// Phase-1 rows stay immutable ("as-appraised" preserved); the reconciled call is
// a distinct, human-authored row. The AI never writes it.
const RECONCILER_ROLES: readonly ReviewRole[] = ['owner', 'arbitrator'];

export function canReconcileRob(role: ReviewRole): boolean {
  return RECONCILER_ROLES.includes(role);
}

// A viewer sees nothing on the blinded surface (resolveRowVisibility → 'none').
// Every other role at least resolves to their own rows, so the read seam can
// safely ask the chokepoint without tripping a deny.
export function canReadRob(role: ReviewRole): boolean {
  return role !== 'viewer';
}
