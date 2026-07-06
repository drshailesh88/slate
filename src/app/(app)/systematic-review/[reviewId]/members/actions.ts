'use server';

import { revalidatePath } from 'next/cache';
import {
  isSrAuthzError,
  requireMember,
  type MemberContext,
} from '@/lib/sr/authz/require-member';
import { isMemberActionError } from '@/lib/sr/members/errors';
import { isAssignableRole } from '@/lib/sr/members/roles';
import {
  activateAiReviewer,
  addExistingMember,
  changeMemberRole,
  createEmailInvitation,
  revokeInvitation,
  revokeMember,
  validateAiReviewer,
} from '@/lib/sr/members/service';

// ─────────────────────────────────────────────────────────────────────────────
// Server actions — the write boundary for the Members screen. Each one:
//   1. re-resolves the caller with requireMember (defense in depth — never
//      trusts a client-sent role/actor),
//   2. delegates to the owner-gated, audited service,
//   3. revalidates the screen,
//   4. converts KNOWN action/authz errors (owner-required, arbitrator-refused,
//      rate-limited, …) into a serializable result the client surfaces as a
//      warning — unknown/infra errors still throw (500).
// ─────────────────────────────────────────────────────────────────────────────

export type ActionResult<T = undefined> =
  { ok: true; data: T } | { ok: false; error: string; status: number };

async function run<T>(
  reviewId: string,
  fn: (ctx: MemberContext) => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    const ctx = await requireMember(reviewId);
    const data = await fn(ctx);
    revalidatePath(`/systematic-review/${reviewId}/members`);
    return { ok: true, data };
  } catch (error) {
    if (isMemberActionError(error) || isSrAuthzError(error)) {
      return { ok: false, error: error.message, status: error.status };
    }
    throw error;
  }
}

function badRole(): ActionResult<never> {
  return { ok: false, error: 'That role is not valid.', status: 400 };
}

export interface InviteData {
  token: string;
  email: string;
  role: string;
  expiresAt: string;
}

export async function inviteByEmailAction(
  reviewId: string,
  email: string,
  role: string,
): Promise<ActionResult<InviteData>> {
  if (!isAssignableRole(role)) return badRole();
  return run(reviewId, async (ctx) => {
    const result = await createEmailInvitation({
      actor: ctx,
      reviewId,
      email,
      role,
    });
    return {
      token: result.token,
      email: result.email,
      role: result.role,
      expiresAt: result.expiresAt.toISOString(),
    };
  });
}

export async function addExistingMemberAction(
  reviewId: string,
  email: string,
  role: string,
): Promise<ActionResult<undefined>> {
  if (!isAssignableRole(role)) return badRole();
  return run(reviewId, async (ctx) => {
    await addExistingMember({ actor: ctx, reviewId, email, role });
    return undefined;
  });
}

export async function changeRoleAction(
  reviewId: string,
  targetUserId: string,
  role: string,
): Promise<ActionResult<undefined>> {
  if (!isAssignableRole(role)) return badRole();
  return run(reviewId, async (ctx) => {
    await changeMemberRole({ actor: ctx, reviewId, targetUserId, role });
    return undefined;
  });
}

export async function revokeMemberAction(
  reviewId: string,
  targetUserId: string,
): Promise<ActionResult<undefined>> {
  return run(reviewId, async (ctx) => {
    await revokeMember({ actor: ctx, reviewId, targetUserId });
    return undefined;
  });
}

export async function revokeInvitationAction(
  reviewId: string,
  invitationId: string,
): Promise<ActionResult<undefined>> {
  return run(reviewId, async (ctx) => {
    await revokeInvitation({ actor: ctx, reviewId, invitationId });
    return undefined;
  });
}

export async function activateAiAction(
  reviewId: string,
): Promise<ActionResult<{ status: 'validated' }>> {
  return run(reviewId, (ctx) => activateAiReviewer({ actor: ctx, reviewId }));
}

export async function validateAiAction(
  reviewId: string,
): Promise<ActionResult<{ pending: true; message: string }>> {
  return run(reviewId, (ctx) => validateAiReviewer({ actor: ctx, reviewId }));
}
