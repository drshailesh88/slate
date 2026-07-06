'use server';

import { revalidatePath } from 'next/cache';
import { isSrAuthzError, requireMember } from '@/lib/sr/authz/require-member';
import { DrizzleProtocolStore } from './drizzle-store';
import { amendProtocol, lockProtocol, saveDraft, toDTO } from './service';
import { ProtocolForbiddenError, isProtocolError } from './errors';
import { isProtocolEditor } from './roles';
import { sanitizeProtocolContent, sanitizeReason } from './validate';
import type { ProtocolActionResult, ProtocolView } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Protocol mutation server actions. Each one re-authorizes (defense in depth —
// never trusts the client), gates on the live review role, sanitizes the
// untrusted payload, then runs the pure versioning service against the Drizzle
// store. Domain failures return `{ ok: false }` with an actionable message;
// unexpected/infra errors reject (→ 500). Timestamps come from the server clock.
// ─────────────────────────────────────────────────────────────────────────────

async function requireProtocolEditor(reviewId: string): Promise<string> {
  const ctx = await requireMember(reviewId);
  if (!isProtocolEditor(ctx.member.role)) {
    throw new ProtocolForbiddenError();
  }
  return ctx.userId;
}

function toFailure(error: unknown): ProtocolActionResult {
  if (isProtocolError(error)) {
    return { ok: false, message: error.message, code: error.code };
  }
  // A revoked-mid-session member: neutral, non-leaking message (no existence tell).
  if (isSrAuthzError(error)) {
    return {
      ok: false,
      message: 'You no longer have access to this review.',
      code: error.code,
    };
  }
  // Unexpected (DB/infra): don't swallow — reject so it surfaces as a 500.
  throw error;
}

function succeed(reviewId: string, view: ProtocolView): ProtocolActionResult {
  revalidatePath(`/systematic-review/${reviewId}/protocol`);
  return { ok: true, view: toDTO(view) };
}

export async function saveDraftAction(
  reviewId: string,
  rawContent: unknown,
): Promise<ProtocolActionResult> {
  try {
    const actorId = await requireProtocolEditor(reviewId);
    const view = await saveDraft(
      new DrizzleProtocolStore(),
      { reviewId, actorId, content: sanitizeProtocolContent(rawContent) },
      new Date(),
    );
    return succeed(reviewId, view);
  } catch (error) {
    return toFailure(error);
  }
}

export async function lockProtocolAction(
  reviewId: string,
  rawContent: unknown,
): Promise<ProtocolActionResult> {
  try {
    const actorId = await requireProtocolEditor(reviewId);
    const view = await lockProtocol(
      new DrizzleProtocolStore(),
      { reviewId, actorId, content: sanitizeProtocolContent(rawContent) },
      new Date(),
    );
    return succeed(reviewId, view);
  } catch (error) {
    return toFailure(error);
  }
}

export async function amendProtocolAction(
  reviewId: string,
  rawContent: unknown,
  rawReason: unknown,
): Promise<ProtocolActionResult> {
  try {
    const actorId = await requireProtocolEditor(reviewId);
    const view = await amendProtocol(
      new DrizzleProtocolStore(),
      {
        reviewId,
        actorId,
        content: sanitizeProtocolContent(rawContent),
        reason: sanitizeReason(rawReason),
      },
      new Date(),
    );
    return succeed(reviewId, view);
  } catch (error) {
    return toFailure(error);
  }
}
