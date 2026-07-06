import { beforeEach, describe, expect, it } from 'vitest';
import { processWorkOsEvent } from './process-event';
import type { LedgerState, MirroredUser, SyncStore } from './store';
import type {
  MembershipData,
  NormalizedEvent,
  OrgData,
  UserData,
} from './types';

// In-memory SyncStore that faithfully models the semantics the real Drizzle
// store enforces in SQL: the ledger, and the no-resurrect guard (mirrorUser
// refuses to touch a tombstoned row — the DB backstop for the application-level
// check in process-event.ts).
class FakeSyncStore implements SyncStore {
  ledger = new Map<string, { type: string; processedAt: Date | null }>();
  users = new Map<
    string,
    { email: string; name: string | null; deletedAt: Date | null }
  >();

  calls = {
    mirrorUser: [] as UserData[],
    tombstoneUser: [] as string[],
    upsertOrganization: [] as OrgData[],
    inactivateOrgReviewAccess: [] as MembershipData[],
  };

  seedActiveUser(workosUserId: string) {
    this.users.set(workosUserId, {
      email: `${workosUserId}@seed.test`,
      name: 'Seed',
      deletedAt: null,
    });
  }

  async getEventState(eventId: string): Promise<LedgerState> {
    const row = this.ledger.get(eventId);
    return row ? { processedAt: row.processedAt } : null;
  }

  async recordEventReceipt(eventId: string, type: string): Promise<void> {
    if (!this.ledger.has(eventId)) {
      this.ledger.set(eventId, { type, processedAt: null });
    }
  }

  async markEventProcessed(eventId: string): Promise<void> {
    const row = this.ledger.get(eventId);
    if (row) row.processedAt = new Date();
  }

  async getUserByWorkosId(workosUserId: string): Promise<MirroredUser> {
    const row = this.users.get(workosUserId);
    return row ? { deletedAt: row.deletedAt } : null;
  }

  async upsertOrganization(org: OrgData): Promise<void> {
    this.calls.upsertOrganization.push(org);
  }

  async mirrorUser(user: UserData): Promise<void> {
    this.calls.mirrorUser.push(user);
    const existing = this.users.get(user.workosUserId);
    // DB backstop: never un-tombstone.
    if (existing?.deletedAt) return;
    this.users.set(user.workosUserId, {
      email: user.email,
      name: user.name,
      deletedAt: null,
    });
  }

  async tombstoneUser(workosUserId: string): Promise<void> {
    this.calls.tombstoneUser.push(workosUserId);
    const existing = this.users.get(workosUserId);
    if (existing && !existing.deletedAt) {
      existing.email = '';
      existing.name = null;
      existing.deletedAt = new Date();
    }
  }

  async inactivateOrgReviewAccess(membership: MembershipData): Promise<void> {
    this.calls.inactivateOrgReviewAccess.push(membership);
  }
}

const userEvent = (
  id: string,
  type: 'user.created' | 'user.updated',
  data: UserData,
): NormalizedEvent => ({ id, type, data });

describe('processWorkOsEvent — ledger dedup', () => {
  let store: FakeSyncStore;
  beforeEach(() => {
    store = new FakeSyncStore();
  });

  it('processes a fresh event and marks it processed', async () => {
    const result = await processWorkOsEvent(
      userEvent('evt_1', 'user.created', {
        workosUserId: 'user_a',
        email: 'a@x.test',
        name: 'A',
      }),
      store,
    );

    expect(result).toBe('processed');
    expect(store.calls.mirrorUser).toHaveLength(1);
    expect(store.ledger.get('evt_1')?.processedAt).toBeInstanceOf(Date);
  });

  it('treats a replayed eventId as a no-op', async () => {
    const event = userEvent('evt_dup', 'user.created', {
      workosUserId: 'user_a',
      email: 'a@x.test',
      name: 'A',
    });

    await processWorkOsEvent(event, store);
    const second = await processWorkOsEvent(event, store);

    expect(second).toBe('duplicate');
    // Handler ran exactly once despite two deliveries of the same eventId.
    expect(store.calls.mirrorUser).toHaveLength(1);
  });
});

describe('processWorkOsEvent — no-resurrect after user.deleted', () => {
  it('does not re-create a tombstoned user from a stale user.updated', async () => {
    const store = new FakeSyncStore();

    await processWorkOsEvent(
      userEvent('evt_create', 'user.created', {
        workosUserId: 'user_gone',
        email: 'gone@x.test',
        name: 'Gone',
      }),
      store,
    );

    await processWorkOsEvent(
      {
        id: 'evt_delete',
        type: 'user.deleted',
        data: { workosUserId: 'user_gone' },
      },
      store,
    );

    // A stale/out-of-order update arriving AFTER the delete (distinct eventId).
    const stale = await processWorkOsEvent(
      userEvent('evt_stale_update', 'user.updated', {
        workosUserId: 'user_gone',
        email: 'resurrected@x.test',
        name: 'Resurrected',
      }),
      store,
    );

    expect(stale).toBe('ignored');
    const user = store.users.get('user_gone');
    expect(user?.deletedAt).toBeInstanceOf(Date);
    // PII stayed anonymized — the stale update did NOT restore it.
    expect(user?.email).toBe('');
    expect(user?.name).toBeNull();
  });
});

describe('processWorkOsEvent — membership + org dispatch', () => {
  let store: FakeSyncStore;
  beforeEach(() => {
    store = new FakeSyncStore();
  });

  it('inactivates review access on organization_membership.deleted', async () => {
    const result = await processWorkOsEvent(
      {
        id: 'evt_m_del',
        type: 'organization_membership.deleted',
        data: { organizationId: 'org_1', workosUserId: 'user_a' },
      },
      store,
    );

    expect(result).toBe('processed');
    expect(store.calls.inactivateOrgReviewAccess).toEqual([
      { organizationId: 'org_1', workosUserId: 'user_a' },
    ]);
  });

  it('never auto-grants review access on membership.created', async () => {
    const result = await processWorkOsEvent(
      {
        id: 'evt_m_new',
        type: 'organization_membership.created',
        data: { organizationId: 'org_1', workosUserId: 'user_a' },
      },
      store,
    );

    expect(result).toBe('ignored');
    expect(store.calls.inactivateOrgReviewAccess).toHaveLength(0);
  });

  it('mirrors organizations on organization.updated', async () => {
    const result = await processWorkOsEvent(
      {
        id: 'evt_org',
        type: 'organization.updated',
        data: { organizationId: 'org_1', name: 'Lab' },
      },
      store,
    );

    expect(result).toBe('processed');
    expect(store.calls.upsertOrganization).toEqual([
      { organizationId: 'org_1', name: 'Lab' },
    ]);
  });

  it('ledgers role.* / unmirrored events without touching the mirror', async () => {
    const result = await processWorkOsEvent(
      { id: 'evt_role', type: 'ignored', data: null },
      store,
    );

    expect(result).toBe('ignored');
    expect(store.ledger.get('evt_role')?.processedAt).toBeInstanceOf(Date);
    expect(store.calls.mirrorUser).toHaveLength(0);
    expect(store.calls.upsertOrganization).toHaveLength(0);
  });
});

describe('processWorkOsEvent — user.deleted tombstone', () => {
  it('tombstones the mirror and preserves the row for FK integrity', async () => {
    const store = new FakeSyncStore();
    store.seedActiveUser('user_x');

    const result = await processWorkOsEvent(
      { id: 'evt_del', type: 'user.deleted', data: { workosUserId: 'user_x' } },
      store,
    );

    expect(result).toBe('processed');
    expect(store.calls.tombstoneUser).toEqual(['user_x']);
    // Row kept (scientific records reference users.id), PII cleared.
    expect(store.users.has('user_x')).toBe(true);
    expect(store.users.get('user_x')?.email).toBe('');
  });
});
