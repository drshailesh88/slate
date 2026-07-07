import { notFound } from 'next/navigation';
import {
  isSrAuthzError,
  requireMember,
  type MemberContext,
} from '@/lib/sr/authz/require-member';
import { buildPrismaView } from '@/lib/sr/prisma/load';
import { PrismaScreen } from '@/components/sr/prisma/prisma-screen';

// The PRISMA 2020 flow screen (T17). Renders inside the review-context layout,
// which already flag-gated + proved membership. This re-authorizes (defense in
// depth), then assembles the flow via the data seam: every blinded-derived
// count comes from the blinding chokepoint (getPrismaFlow), which withholds the
// whole flow unless screening is at `reconcile` AND the caller may see all
// rows. Pre-unblind the screen shows only the non-blinded Identification block
// plus safe completion counts.
interface PrismaPageProps {
  params: Promise<{ reviewId: string }>;
}

export default async function PrismaPage({ params }: PrismaPageProps) {
  const { reviewId } = await params;

  let ctx: MemberContext;
  try {
    ctx = await requireMember(reviewId);
  } catch (error) {
    if (isSrAuthzError(error)) notFound();
    throw error;
  }

  const dto = await buildPrismaView(reviewId, ctx);
  return <PrismaScreen dto={dto} />;
}
