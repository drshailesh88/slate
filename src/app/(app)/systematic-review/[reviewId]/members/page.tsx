import { notFound } from 'next/navigation';
import {
  isSrAuthzError,
  requireMember,
  type MemberContext,
} from '@/lib/sr/authz/require-member';
import { getReviewTeam } from '@/lib/sr/members/service';
import { MembersScreen } from './members-screen';

// The Members/Team screen. It renders inside the review-context layout, which
// has already flag-gated the group and required membership; we re-resolve here
// (defense in depth) to get the caller's live role and to authorize the team
// read. Any authz failure becomes a 404 with no existence leak.
export default async function MembersPage({
  params,
}: {
  params: Promise<{ reviewId: string }>;
}) {
  const { reviewId } = await params;

  let ctx: MemberContext;
  try {
    ctx = await requireMember(reviewId);
  } catch (error) {
    if (isSrAuthzError(error)) {
      notFound();
    }
    throw error;
  }

  const team = await getReviewTeam(reviewId, ctx.userId);

  return (
    <MembersScreen
      reviewId={reviewId}
      team={team}
      canManage={ctx.member.role === 'owner'}
    />
  );
}
