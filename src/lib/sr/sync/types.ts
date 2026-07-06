// Normalized WorkOS event shapes for the SR mirror sync.
//
// The WorkOS SDK's event payloads are normalized into these small, stable
// shapes at the SDK boundary (./workos.ts) so the ledger + dispatch logic
// (./process-event.ts) and the mirror writes (./store.ts) never depend on the
// SDK. That keeps the sync core unit-testable without the SDK or the network.

export type UserData = {
  workosUserId: string;
  email: string;
  name: string | null;
};

export type UserDeletedData = {
  workosUserId: string;
};

export type OrgData = {
  organizationId: string;
  name: string;
};

export type OrgDeletedData = {
  organizationId: string;
};

export type MembershipData = {
  organizationId: string;
  workosUserId: string;
};

// A WorkOS event we recognize but deliberately do not mirror (e.g. `role.*`
// org-level role definitions — per-review roles are NEVER trusted from WorkOS).
export type IgnoredData = null;

export type NormalizedEvent =
  | { id: string; type: 'user.created'; data: UserData }
  | { id: string; type: 'user.updated'; data: UserData }
  | { id: string; type: 'user.deleted'; data: UserDeletedData }
  | { id: string; type: 'organization.created'; data: OrgData }
  | { id: string; type: 'organization.updated'; data: OrgData }
  | { id: string; type: 'organization.deleted'; data: OrgDeletedData }
  | {
      id: string;
      type: 'organization_membership.created';
      data: MembershipData;
    }
  | {
      id: string;
      type: 'organization_membership.updated';
      data: MembershipData;
    }
  | {
      id: string;
      type: 'organization_membership.deleted';
      data: MembershipData;
    }
  | { id: string; type: 'ignored'; data: IgnoredData };

// Outcome of feeding one event through the ledger + dispatch.
//   processed — the mirror was updated (or the event was an intentional no-op).
//   duplicate — this eventId was already processed; nothing happened.
//   ignored   — a recognized-but-unmirrored event, or an unknown type.
export type SyncResult = 'processed' | 'duplicate' | 'ignored';
