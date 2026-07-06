import type { ReviewRole } from '@/lib/sr/authz/policy';

// Who may edit, lock, or amend the protocol. The review owner and collaborators
// own the methodology; reviewers, arbitrators, and viewers see it read-only.
// Enforced server-side in every write action (the UI also hides the controls).
export const PROTOCOL_EDITOR_ROLES: readonly ReviewRole[] = [
  'owner',
  'collaborator',
];

export function isProtocolEditor(role: ReviewRole): boolean {
  return PROTOCOL_EDITOR_ROLES.includes(role);
}
