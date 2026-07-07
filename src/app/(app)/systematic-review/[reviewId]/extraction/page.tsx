import { notFound } from 'next/navigation';
import {
  isSrAuthzError,
  requireMember,
  type MemberContext,
} from '@/lib/sr/authz/require-member';
import { buildExtractionView } from '@/lib/sr/extraction/load';
import { ExtractionScreen } from '@/components/sr/extraction/extraction-screen';

// ─────────────────────────────────────────────────────────────────────────────
// The two-phase extraction screen (T15 · ★ science-critical). Renders inside the
// review-context layout, which already gated the flag + membership. This
// re-resolves membership (defense in depth), then assembles the view through the
// seam:
//   • the authoritative extraction phase is read SERVER-SIDE from `reviews`;
//   • Phase 1 (independent): the caller's OWN entries come through the blinding
//     chokepoint (never a blinded table, always own-only + non-AI), so the screen
//     cannot render a co-reviewer's or the AI's value before both reviewers lock;
//   • Phase 2 (reconcile): both reviewers + the labeled AI are assembled into the
//     symmetric picker (consensus empty, AI revealed only after the source opens).
// ─────────────────────────────────────────────────────────────────────────────

interface ExtractionPageProps {
  params: Promise<{ reviewId: string }>;
}

export default async function ExtractionPage({ params }: ExtractionPageProps) {
  const { reviewId } = await params;

  let ctx: MemberContext;
  try {
    ctx = await requireMember(reviewId);
  } catch (error) {
    if (isSrAuthzError(error)) notFound();
    throw error;
  }

  const view = await buildExtractionView(ctx, reviewId);
  if (!view) notFound();

  return <ExtractionScreen view={view} />;
}
