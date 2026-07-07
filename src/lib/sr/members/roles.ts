import type { ReviewRole } from '@/lib/sr/authz/policy';

// ─────────────────────────────────────────────────────────────────────────────
// Per-review role metadata for the Members/Team screen. Pure (no DB, no React)
// so the label/capability/order logic is unit-testable and shared by the server
// (assignable-role validation) and the client (role picker, capability lines).
//
// The five per-review roles and their one-line capabilities come verbatim from
// FOUNDATION-auth-tenancy.md §1. These are NEVER trusted from the JWT — they are
// what the server writes to and reads from `review_members.role`.
// ─────────────────────────────────────────────────────────────────────────────

export const ROLE_ORDER: readonly ReviewRole[] = [
  'owner',
  'collaborator',
  'reviewer',
  'arbitrator',
  'viewer',
];

export const ROLE_LABELS: Record<ReviewRole, string> = {
  owner: 'Owner',
  collaborator: 'Collaborator',
  reviewer: 'Reviewer',
  arbitrator: 'Arbitrator',
  viewer: 'Viewer',
};

// Short capability one-liners (FOUNDATION §1) — shown next to the role picker so
// an owner understands what each role can do before assigning it.
export const ROLE_CAPABILITY: Record<ReviewRole, string> = {
  owner: 'Configures the review, invites, triggers unblind, exports.',
  collaborator: 'Working member — import, extraction, risk of bias, PRISMA.',
  reviewer: 'Blinded independent screener, extractor, and appraiser.',
  arbitrator: 'Resolves conflicts — never a reviewer of the same study.',
  viewer: 'Read-only access to the finished consensus.',
};

// Every role can be assigned to a human member via invite / add / change-role.
// (Demoting the last owner is refused at the service layer, not here.)
export const ASSIGNABLE_ROLES: readonly ReviewRole[] = ROLE_ORDER;

export function isAssignableRole(value: string): value is ReviewRole {
  return (ASSIGNABLE_ROLES as readonly string[]).includes(value);
}

export function isOwnerRole(role: ReviewRole): boolean {
  return role === 'owner';
}

export function roleLabel(role: ReviewRole): string {
  return ROLE_LABELS[role] ?? role;
}

// Sort members by role priority (owner first) then name — a stable display order
// for the members table.
export function compareByRoleThenName(
  a: { role: ReviewRole; name: string },
  b: { role: ReviewRole; name: string },
): number {
  const byRole = ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role);
  return byRole !== 0 ? byRole : a.name.localeCompare(b.name);
}
