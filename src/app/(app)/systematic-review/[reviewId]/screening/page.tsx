import { notFound } from 'next/navigation';
import {
  isSrAuthzError,
  requireMember,
  type MemberContext,
} from '@/lib/sr/authz/require-member';
import { buildScreeningView } from '@/lib/sr/screening/load';
import { ScreeningScreen } from '@/components/sr/screening/screening-screen';

// ─────────────────────────────────────────────────────────────────────────────
// The blind screening screen (T12). Renders inside the review-context layout,
// which already gated the flag + membership. This re-resolves membership
// (defense in depth), then assembles the view through the seam:
//   • the authoritative screening phase is read SERVER-SIDE from `reviews`;
//   • the caller's OWN decisions come through the blinding chokepoint (never a
//     blinded table, always own-only);
//   • the study pool + protocol criteria come from the visible tables.
// The DTO cannot carry a co-reviewer's vote or the AI's verdict/score, so the
// screen literally cannot render one during independent screening.
// ─────────────────────────────────────────────────────────────────────────────

interface ScreeningPageProps {
  params: Promise<{ reviewId: string }>;
}

export default async function ScreeningPage({ params }: ScreeningPageProps) {
  const { reviewId } = await params;

  let ctx: MemberContext;
  try {
    ctx = await requireMember(reviewId);
  } catch (error) {
    if (isSrAuthzError(error)) notFound();
    throw error;
  }

  const view = await buildScreeningView(ctx, reviewId);
  if (!view) notFound();

  return <ScreeningScreen view={view} />;
}
