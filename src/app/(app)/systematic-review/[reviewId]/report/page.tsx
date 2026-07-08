import { notFound } from 'next/navigation';
import {
  isSrAuthzError,
  requireMember,
  type MemberContext,
} from '@/lib/sr/authz/require-member';
import { buildReportView } from '@/lib/sr/report/load';
import { ReportScreen } from '@/components/sr/report/report-screen';
import { draftReportAction } from './actions';

// ─────────────────────────────────────────────────────────────────────────────
// The Report screen (T18). Renders inside the review-context layout, which
// already gated the flag + membership. This re-resolves membership (defense in
// depth), then assembles a GROUNDED view through the seam:
//   • every number is computed server-side — visible-table counts here,
//     blinded-derived aggregates only through the reconcile-gated chokepoint;
//   • while a surface is still `independent` its section arrives as `withheld`
//     (a marker with zero numbers), so the screen cannot render a blinded count;
//   • the Methods · data-collection block is auto-assembled from recorded
//     metadata (PRISMA Items 8/9/10), never free-typed.
// ─────────────────────────────────────────────────────────────────────────────

interface ReportPageProps {
  params: Promise<{ reviewId: string }>;
}

export default async function ReportPage({ params }: ReportPageProps) {
  const { reviewId } = await params;

  let ctx: MemberContext;
  try {
    ctx = await requireMember(reviewId);
  } catch (error) {
    if (isSrAuthzError(error)) notFound();
    throw error;
  }

  const view = await buildReportView(ctx, reviewId);
  if (!view) notFound();

  return <ReportScreen view={view} draftAction={draftReportAction} />;
}
