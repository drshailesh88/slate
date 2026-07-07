import { notFound } from 'next/navigation';
import {
  isSrAuthzError,
  requireMember,
  type MemberContext,
} from '@/lib/sr/authz/require-member';
import { buildRobView } from '@/lib/sr/rob/load';
import { RobScreen } from '@/components/sr/rob/rob-screen';

// ─────────────────────────────────────────────────────────────────────────────
// The Risk-of-Bias screen (T16). Renders inside the review-context layout, which
// already gated the flag + membership. This re-resolves membership (defense in
// depth), then assembles the view through the seam:
//   • the authoritative RoB phase is read SERVER-SIDE from `reviews.rob_phase`;
//   • the caller's OWN domain judgements come through the blinding chokepoint
//     (never a blinded table; own-only + non-AI during independent);
//   • the included study pool + instruments come from the visible tables.
// The DTO cannot carry a co-reviewer's judgement or the AI's suggestion during
// independent, so the screen literally cannot render one.
// ─────────────────────────────────────────────────────────────────────────────

interface RobPageProps {
  params: Promise<{ reviewId: string }>;
}

export default async function RiskOfBiasPage({ params }: RobPageProps) {
  const { reviewId } = await params;

  let ctx: MemberContext;
  try {
    ctx = await requireMember(reviewId);
  } catch (error) {
    if (isSrAuthzError(error)) notFound();
    throw error;
  }

  const view = await buildRobView(ctx, reviewId);
  if (!view) notFound();

  return <RobScreen view={view} />;
}
