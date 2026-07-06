import { notFound } from 'next/navigation';
import { inArray } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { isSrAuthzError, requireMember } from '@/lib/sr/authz/require-member';
import { DrizzleProtocolStore } from '@/lib/sr/protocol/drizzle-store';
import { loadProtocol, toDTO } from '@/lib/sr/protocol/service';
import { isProtocolEditor } from '@/lib/sr/protocol/roles';
import type { ProtocolView } from '@/lib/sr/protocol/types';
import { ProtocolScreen } from '@/components/sr/protocol/protocol-screen';

// The Protocol / eligibility-criteria screen (SR1). The route group's layout
// already flag-gates and proves membership; this server component re-authorizes
// (defense in depth), loads the protocol version ledger through the Drizzle
// store, and hands the client screen a serialized view + the caller's edit right.

interface ProtocolPageProps {
  params: Promise<{ reviewId: string }>;
}

export default async function ProtocolPage({ params }: ProtocolPageProps) {
  const { reviewId } = await params;

  let role;
  try {
    const ctx = await requireMember(reviewId);
    role = ctx.member.role;
  } catch (error) {
    if (isSrAuthzError(error)) {
      notFound();
    }
    throw error;
  }

  const view = await loadProtocol(new DrizzleProtocolStore(), reviewId);
  const authorNames = await resolveAuthorNames(view);

  return (
    <ProtocolScreen
      dto={toDTO(view)}
      canEdit={isProtocolEditor(role)}
      authorNames={authorNames}
    />
  );
}

// Map each amendment author (locked_by) to a display name for the history list.
// A best-effort enrichment — an unresolved id simply shows no name.
async function resolveAuthorNames(
  view: ProtocolView,
): Promise<Record<string, string>> {
  const ids = [
    ...new Set(
      view.versions
        .map((v) => v.lockedBy)
        .filter((id): id is string => id !== null),
    ),
  ];
  if (ids.length === 0) {
    return {};
  }

  const rows = await getDb()
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, ids));

  return Object.fromEntries(
    rows.filter((r) => r.name).map((r) => [r.id, r.name as string]),
  );
}
