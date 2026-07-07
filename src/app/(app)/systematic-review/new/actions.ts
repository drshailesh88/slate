'use server';

import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { organizations } from '@/lib/db/schema';
import { upsertUserFromWorkOs } from '@/lib/db/users';
import { getSessionUser } from '@/lib/auth/session';
import { isDevAuthBypassActive } from '@/lib/auth/config';
import { isSrEnabled } from '@/lib/sr/flag';
import {
  getActiveOrgContext,
  isSrAuthzError,
  OrgScopeError,
} from '@/lib/sr/authz/require-member';
import {
  createReview,
  CreateReviewError,
  type CreateReviewInput,
} from '@/lib/sr/create-review';

// ─────────────────────────────────────────────────────────────────────────────
// Create-review server action. Owns the trust boundary the pure core does not:
// the flag gate, session → provisioned creator, and org scope (the creator must
// be an active member of a WorkOS org). On success it redirects to the review
// summary; on a validation / authz failure it returns an actionable message for
// the wizard to show. redirect() is called OUTSIDE the try so its control-flow
// throw is never mistaken for an error.
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateReviewActionState {
  error: string | null;
}

// Dev-bypass has no WorkOS org; a created review is attached to the same demo
// org the dev seed uses so it appears alongside seeded reviews in the shell.
const DEV_ORG = { id: 'org_dev_demo', name: 'Demo Institution' } as const;

async function resolveCreationContext(): Promise<{
  actorUserId: string;
  orgId: string;
}> {
  const session = await getSessionUser();
  const db = getDb();

  const org = await resolveOrg();
  await db
    .insert(organizations)
    .values({ id: org.id, name: org.name })
    .onConflictDoNothing({ target: organizations.id });

  // JIT-provision the creator (mirrors /auth/callback) so createdBy resolves.
  const user = await upsertUserFromWorkOs({
    workosUserId: session.workosUserId,
    email: session.email,
    name: session.name,
  });

  return { actorUserId: user.id, orgId: org.id };
}

async function resolveOrg(): Promise<{ id: string; name: string }> {
  if (isDevAuthBypassActive()) {
    return DEV_ORG;
  }

  const { organizationId } = await getActiveOrgContext();
  if (!organizationId) {
    throw new OrgScopeError();
  }
  // The real org name is mirrored by the WorkOS sync (T4); fall back to the id
  // so the FK is always satisfiable even before that event lands.
  return { id: organizationId, name: organizationId };
}

export async function createReviewAction(
  input: CreateReviewInput,
): Promise<CreateReviewActionState> {
  if (!isSrEnabled()) {
    return { error: 'Systematic review is not enabled.' };
  }

  let reviewId: string;
  try {
    const { actorUserId, orgId } = await resolveCreationContext();
    const result = await createReview(input, { actorUserId, orgId });
    reviewId = result.reviewId;
  } catch (error) {
    if (error instanceof CreateReviewError) {
      return { error: error.message };
    }
    if (isSrAuthzError(error)) {
      return {
        error:
          'You need to be an active member of an organization to create a review.',
      };
    }
    throw error;
  }

  redirect(`/systematic-review/${reviewId}`);
}
