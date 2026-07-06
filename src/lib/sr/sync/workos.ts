import { WorkOS, type Event } from '@workos-inc/node';
import type { NormalizedEvent } from './types';

// The WorkOS SDK boundary for webhook verification + event normalization.
//
// Verified against @workos-inc/node@10.7.0: signature verification is
// `workos.webhooks.constructEvent({ payload, sigHeader, secret })` — note the
// param is `sigHeader`, not `signature` — which throws
// `SignatureVerificationException` on a bad/expired signature. The verified
// event's discriminant is `event.event` (e.g. 'user.created').

let client: WorkOS | null = null;

function getWorkOsClient(): WorkOS {
  if (client) return client;

  const apiKey = process.env.WORKOS_API_KEY;
  if (!apiKey) {
    throw new Error(
      'WORKOS_API_KEY is not set. It is required to construct the WorkOS client that verifies webhook signatures. Add it to your environment (see .env.example).',
    );
  }
  client = new WorkOS(apiKey);
  return client;
}

export function getWebhookSecret(): string {
  const secret = process.env.WORKOS_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error(
      'WORKOS_WEBHOOK_SECRET is not set. It is the signing secret from the WorkOS dashboard webhook endpoint, used to verify inbound webhook signatures. Add it to your environment (see .env.example).',
    );
  }
  return secret;
}

// Verifies the signature and deserializes the payload. Throws on an invalid
// signature (the route maps that to 401).
export async function constructWorkOsEvent(
  payload: string,
  sigHeader: string,
): Promise<Event> {
  return getWorkOsClient().webhooks.constructEvent({
    payload,
    sigHeader,
    secret: getWebhookSecret(),
  });
}

function fullName(
  name: string | null,
  first: string | null,
  last: string | null,
) {
  return name ?? ([first, last].filter(Boolean).join(' ') || null);
}

// Maps a verified WorkOS event onto the small, SDK-free shapes the sync core
// consumes. Any event we do not mirror collapses to a ledger-only 'ignored'.
export function normalizeEvent(event: Event): NormalizedEvent {
  switch (event.event) {
    case 'user.created':
    case 'user.updated':
      return {
        id: event.id,
        type: event.event,
        data: {
          workosUserId: event.data.id,
          email: event.data.email,
          name: fullName(
            event.data.name,
            event.data.firstName,
            event.data.lastName,
          ),
        },
      };

    case 'user.deleted':
      return {
        id: event.id,
        type: 'user.deleted',
        data: { workosUserId: event.data.id },
      };

    case 'organization.created':
    case 'organization.updated':
      return {
        id: event.id,
        type: event.event,
        data: { organizationId: event.data.id, name: event.data.name },
      };

    case 'organization.deleted':
      return {
        id: event.id,
        type: 'organization.deleted',
        data: { organizationId: event.data.id },
      };

    case 'organization_membership.created':
    case 'organization_membership.updated':
    case 'organization_membership.deleted':
      return {
        id: event.id,
        type: event.event,
        data: {
          organizationId: event.data.organizationId,
          workosUserId: event.data.userId,
        },
      };

    default:
      // Recognized-but-unmirrored (`role.*` and everything else): per-review
      // roles are never trusted from WorkOS, so there is nothing to mirror.
      return { id: event.id, type: 'ignored', data: null };
  }
}
