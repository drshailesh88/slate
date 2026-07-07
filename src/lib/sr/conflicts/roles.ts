import type { ReviewRole } from '@/lib/sr/authz/policy';

// Who may adjudicate a screening conflict at reconcile. The working roles that
// see all rows at reconcile (owner, collaborator, reviewer, arbitrator) may
// record a resolution; a viewer reads derived consensus only and can never
// resolve. Enforced server-side in the resolve action (the UI also hides the
// controls). Note this is distinct from arbitrator INDEPENDENCE, which is a
// per-study check enforced separately when sending a study to an arbitrator.
export const CONFLICT_RESOLVER_ROLES: readonly ReviewRole[] = [
  'owner',
  'collaborator',
  'reviewer',
  'arbitrator',
];

export function canResolveConflict(role: ReviewRole): boolean {
  return CONFLICT_RESOLVER_ROLES.includes(role);
}
