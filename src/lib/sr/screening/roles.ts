import type { ReviewRole } from '@/lib/sr/authz/policy';

// ─────────────────────────────────────────────────────────────────────────────
// Who may do what on the screening surface. Pure predicates over the LIVE
// review_members role (resolved server-side, never a JWT claim). These gate the
// server actions; the UI mirrors them but the server is authoritative.
// ─────────────────────────────────────────────────────────────────────────────

// The roles that produce independent screening decisions. This matches the
// denominator the chokepoint uses for safe progress (reviewer + collaborator):
// owner configures, arbitrator resolves conflicts, viewer is read-only — none of
// them screen. FOUNDATION-auth-tenancy.md §1.
const SCREENING_ROLES: readonly ReviewRole[] = ['reviewer', 'collaborator'];

export function canCastScreeningDecision(role: ReviewRole): boolean {
  return SCREENING_ROLES.includes(role);
}

// Only the owner triggers the one-way unblind (independent → reconcile).
export function canUnblindScreening(role: ReviewRole): boolean {
  return role === 'owner';
}

// A viewer sees nothing on the blinded surface (resolveRowVisibility → 'none').
// Every other role at least resolves to their own rows, so the read seam can
// safely ask the chokepoint for their decisions without tripping a deny.
export function canReadOwnDecisions(role: ReviewRole): boolean {
  return role !== 'viewer';
}
