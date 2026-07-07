import type { ReviewRole } from '@/lib/sr/authz/policy';

// ─────────────────────────────────────────────────────────────────────────────
// Who may do what on the extraction surface. Pure predicates over the LIVE
// review_members role (resolved server-side, never a JWT claim). These gate the
// server actions; the UI mirrors them but the server is authoritative.
// ─────────────────────────────────────────────────────────────────────────────

// The roles that produce independent extraction entries — the same denominator
// the chokepoint uses for safe progress (reviewer + collaborator). Owner
// configures, arbitrator adjudicates, viewer is read-only.
const EXTRACTOR_ROLES: readonly ReviewRole[] = ['reviewer', 'collaborator'];

export function canExtract(role: ReviewRole): boolean {
  return EXTRACTOR_ROLES.includes(role);
}

// Only the owner triggers the one-way unblind (independent → reconcile).
export function canUnblindExtraction(role: ReviewRole): boolean {
  return role === 'owner';
}

// Who may record a reconciliation (align on a value, send to arbitrator, log an
// author contact, or park a field). The working roles that see all rows at
// reconcile may reconcile; a viewer reads the derived consensus only.
const RECONCILER_ROLES: readonly ReviewRole[] = [
  'owner',
  'collaborator',
  'reviewer',
  'arbitrator',
];

export function canReconcile(role: ReviewRole): boolean {
  return RECONCILER_ROLES.includes(role);
}

// A viewer sees nothing on the blinded surface (resolveRowVisibility → 'none').
// Every other role at least resolves to their own rows during independent, so the
// read seam can ask the chokepoint for their entries without tripping a deny.
export function canReadOwnEntries(role: ReviewRole): boolean {
  return role !== 'viewer';
}
