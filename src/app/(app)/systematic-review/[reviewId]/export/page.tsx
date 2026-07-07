import { notFound } from 'next/navigation';
import {
  isSrAuthzError,
  requireMember,
  type MemberContext,
} from '@/lib/sr/authz/require-member';
import { buildExportBundle, toExportView } from '@/lib/sr/export/assemble';
import { ExportScreen } from '@/components/sr/export/export-screen';

// ─────────────────────────────────────────────────────────────────────────────
// The Export screen (T19) — the last funnel stage. Renders inside the
// review-context layout, which already gated the flag + membership. This
// re-resolves membership (defense in depth), then assembles the export view
// through the seam: blinded datasets flow only through the chokepoint's
// reconcile-gated ForExport readers, so a withheld dataset renders as an
// honest labeled state and the page can never show (or link to) a blinded
// per-reviewer row during `independent`. The client receives counts +
// availability only — the data itself leaves via the download route.
// ─────────────────────────────────────────────────────────────────────────────

interface ExportPageProps {
  params: Promise<{ reviewId: string }>;
}

export default async function ExportPage({ params }: ExportPageProps) {
  const { reviewId } = await params;

  let ctx: MemberContext;
  try {
    ctx = await requireMember(reviewId);
  } catch (error) {
    if (isSrAuthzError(error)) notFound();
    throw error;
  }

  const bundle = await buildExportBundle({
    reviewId,
    requesterId: ctx.userId,
    role: ctx.member.role,
  });
  if (!bundle) notFound();

  return <ExportScreen view={toExportView(bundle)} />;
}
