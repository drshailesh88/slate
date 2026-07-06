import { SignatureVerificationException } from '@workos-inc/node';
import { NextResponse } from 'next/server';
import { DrizzleSyncStore } from '@/lib/sr/sync/drizzle-store';
import { processWorkOsEvent } from '@/lib/sr/sync/process-event';
import { constructWorkOsEvent, normalizeEvent } from '@/lib/sr/sync/workos';

// WorkOS → Neon mirror webhook. Lives in SR's own API namespace (NOT under the
// reserved /api/search/**). Verifies the signature first, before any DB work,
// so an unauthenticated request can never reach the mirror. Handled events:
// user.*, organization.*, organization_membership.*, role.* (role.* ledger-only).
// Contract: FOUNDATION-auth-tenancy.md §4.

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<NextResponse> {
  const sigHeader = request.headers.get('workos-signature');
  if (!sigHeader) {
    return NextResponse.json(
      { error: 'Missing WorkOS-Signature header' },
      { status: 401 },
    );
  }

  const payload = await request.text();

  let event;
  try {
    event = await constructWorkOsEvent(payload, sigHeader);
  } catch (error) {
    if (error instanceof SignatureVerificationException) {
      return NextResponse.json(
        { error: 'Invalid webhook signature' },
        { status: 401 },
      );
    }
    // Config error (missing secret/API key) or other failure — WorkOS retries.
    console.error('WorkOS webhook verification unavailable:', error);
    return NextResponse.json(
      { error: 'Webhook verification unavailable' },
      { status: 500 },
    );
  }

  try {
    const result = await processWorkOsEvent(
      normalizeEvent(event),
      new DrizzleSyncStore(),
    );
    return NextResponse.json({ received: true, result }, { status: 200 });
  } catch (error) {
    // Return 500 so WorkOS retries; every mirror write is idempotent.
    console.error('WorkOS webhook processing failed:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 },
    );
  }
}
