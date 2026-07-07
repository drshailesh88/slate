import { notFound } from 'next/navigation';
import {
  isSrAuthzError,
  requireMember,
  type MemberContext,
} from '@/lib/sr/authz/require-member';
import { canManageImport } from '@/lib/sr/import';
import { DrizzleImportStore } from '@/lib/sr/import-drizzle-store';
import { getImportState } from '@/lib/sr/import-service';
import { ImportScreen } from '@/components/sr/import/import-screen';

// The Import + dedup screen (T9). Renders inside the review-context layout,
// which already gated the flag + membership. This re-resolves membership
// (defense in depth) to gate mutations on role, and loads the reversible import
// ledger + dedup queue from the visible tables — never a blinded table.
interface ImportPageProps {
  params: Promise<{ reviewId: string }>;
}

export default async function ImportPage({ params }: ImportPageProps) {
  const { reviewId } = await params;

  let ctx: MemberContext;
  try {
    ctx = await requireMember(reviewId);
  } catch (error) {
    if (isSrAuthzError(error)) notFound();
    throw error;
  }

  const state = await getImportState(new DrizzleImportStore(), reviewId);

  return (
    <ImportScreen
      reviewId={reviewId}
      canManage={canManageImport(ctx.member.role)}
      state={state}
    />
  );
}
