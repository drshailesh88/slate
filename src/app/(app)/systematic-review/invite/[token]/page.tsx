import { notFound } from 'next/navigation';
import { isSrEnabled } from '@/lib/sr/flag';
import { getSessionUser } from '@/lib/auth/session';
import { AcceptInvite } from './accept-invite';

// The invite-accept landing page. It sits OUTSIDE the [reviewId] review-context
// layout on purpose: the invitee is not a member yet, so there is no review
// context to load. The token is redeemed via POST /api/sr/invitations/accept,
// which enforces the single-use / email-bound / expiry / audit guarantees.
export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  if (!isSrEnabled()) {
    notFound();
  }
  const { token } = await params;
  const session = await getSessionUser();

  return <AcceptInvite token={token} signedInAs={session.email} />;
}
