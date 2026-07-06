import type { SyncStore } from './store';
import type { NormalizedEvent, SyncResult } from './types';

// The idempotent event-ledger + dispatch core of the WorkOS → Neon sync.
//
// Guarantees (FOUNDATION-auth-tenancy.md §4):
//   • Dedup — an eventId that has already been processed is a no-op.
//   • No-resurrect — a stale `user.updated` arriving after `user.deleted` does
//     NOT re-create the mirror row.
//   • user.deleted tombstones the mirror; scientific records are never touched.
//   • Org-membership removal inactivates review access; it never grants it.
//
// Every mirror write is idempotent, so re-processing after a mid-flight failure
// (at-least-once delivery) converges rather than corrupting state.

export async function processWorkOsEvent(
  event: NormalizedEvent,
  store: SyncStore,
): Promise<SyncResult> {
  const state = await store.getEventState(event.id);
  if (state?.processedAt) {
    return 'duplicate';
  }

  // Record receipt before dispatch. If dispatch throws, the receipt row stays
  // with a null processedAt so a WorkOS retry re-runs it (not seen as done).
  await store.recordEventReceipt(event.id, event.type);

  const result = await dispatch(event, store);

  await store.markEventProcessed(event.id);
  return result;
}

async function dispatch(
  event: NormalizedEvent,
  store: SyncStore,
): Promise<SyncResult> {
  switch (event.type) {
    case 'user.created':
    case 'user.updated':
      return mirrorUser(event.data.workosUserId, event.data, store);

    case 'user.deleted':
      await store.tombstoneUser(event.data.workosUserId);
      return 'processed';

    case 'organization.created':
    case 'organization.updated':
      await store.upsertOrganization(event.data);
      return 'processed';

    case 'organization.deleted':
      // The org mirror row is retained: reviews.orgId references it, and org
      // deletion never cascades to a review's scientific records. Ledgered only.
      return 'ignored';

    case 'organization_membership.created':
    case 'organization_membership.updated':
      // Org membership NEVER auto-grants review access (§4/§7). Ledgered only.
      return 'ignored';

    case 'organization_membership.deleted':
      await store.inactivateOrgReviewAccess(event.data);
      return 'processed';

    case 'ignored':
      return 'ignored';

    default:
      return assertNever(event);
  }
}

// No-resurrect guard at the application layer (the DB upsert's WHERE clause is
// the defense-in-depth backstop): once a user is tombstoned, later updates are
// stale by definition — WorkOS never un-deletes a user.
async function mirrorUser(
  workosUserId: string,
  data: { workosUserId: string; email: string; name: string | null },
  store: SyncStore,
): Promise<SyncResult> {
  const existing = await store.getUserByWorkosId(workosUserId);
  if (existing?.deletedAt) {
    return 'ignored';
  }
  await store.mirrorUser(data);
  return 'processed';
}

function assertNever(event: never): never {
  throw new Error(
    `Unhandled WorkOS event in SR sync dispatch: ${JSON.stringify(event)}`,
  );
}
