import { describe, expect, it } from 'vitest';
import type { Event } from '@workos-inc/node';
import { normalizeEvent } from './workos';

// normalizeEvent maps verified WorkOS events onto the SDK-free shapes the sync
// core consumes. These fixtures mirror @workos-inc/node@10.7.0 event payloads
// (discriminant is `event.event`; user/org data camelCased).
const asEvent = (e: unknown) => e as Event;

describe('normalizeEvent', () => {
  it('maps user.created to the user mirror shape (deriving name)', () => {
    const result = normalizeEvent(
      asEvent({
        id: 'evt_1',
        event: 'user.created',
        data: {
          id: 'user_1',
          email: 'a@x.test',
          name: null,
          firstName: 'Ada',
          lastName: 'Lovelace',
        },
      }),
    );

    expect(result).toEqual({
      id: 'evt_1',
      type: 'user.created',
      data: { workosUserId: 'user_1', email: 'a@x.test', name: 'Ada Lovelace' },
    });
  });

  it('maps user.deleted to just the workos user id', () => {
    const result = normalizeEvent(
      asEvent({ id: 'evt_2', event: 'user.deleted', data: { id: 'user_1' } }),
    );

    expect(result).toEqual({
      id: 'evt_2',
      type: 'user.deleted',
      data: { workosUserId: 'user_1' },
    });
  });

  it('maps organization.updated to the org mirror shape', () => {
    const result = normalizeEvent(
      asEvent({
        id: 'evt_3',
        event: 'organization.updated',
        data: { id: 'org_1', name: 'Lab' },
      }),
    );

    expect(result).toEqual({
      id: 'evt_3',
      type: 'organization.updated',
      data: { organizationId: 'org_1', name: 'Lab' },
    });
  });

  it('maps organization_membership.deleted to org + user ids', () => {
    const result = normalizeEvent(
      asEvent({
        id: 'evt_4',
        event: 'organization_membership.deleted',
        data: { id: 'om_1', organizationId: 'org_1', userId: 'user_1' },
      }),
    );

    expect(result).toEqual({
      id: 'evt_4',
      type: 'organization_membership.deleted',
      data: { organizationId: 'org_1', workosUserId: 'user_1' },
    });
  });

  it('collapses role.* (never trusted from WorkOS) to an ignored event', () => {
    const result = normalizeEvent(
      asEvent({
        id: 'evt_5',
        event: 'role.created',
        data: { object: 'role', slug: 'admin' },
      }),
    );

    expect(result).toEqual({ id: 'evt_5', type: 'ignored', data: null });
  });
});
