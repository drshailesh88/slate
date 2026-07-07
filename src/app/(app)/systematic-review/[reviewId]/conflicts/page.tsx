import { notFound } from 'next/navigation';
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { reviewMembers, reviews, studies } from '@/lib/db/schema/sr';
import {
  isSrAuthzError,
  requireMember,
  type MemberContext,
} from '@/lib/sr/authz/require-member';
import {
  BlindedAccessError,
  getScreeningConflicts,
} from '@/lib/sr/authz/blinded-read';
import { DrizzleConflictStore } from '@/lib/sr/conflicts/drizzle-store';
import { assembleConflicts, type StudyMeta } from '@/lib/sr/conflicts/service';
import { canResolveConflict } from '@/lib/sr/conflicts/roles';
import type {
  ConflictItemDTO,
  ConflictsViewDTO,
  EligibleArbitratorDTO,
} from '@/lib/sr/conflicts/types';
import type { ScreeningConflict } from '@/lib/sr/conflicts/derive';
import { ConflictsScreen } from '@/components/sr/conflicts/conflicts-screen';

// The Conflicts / adjudication screen (T13). Renders inside the review-context
// layout, which already flag-gated + proved membership. This re-authorizes
// (defense in depth), then reads the opposing screening calls THROUGH the
// blinding chokepoint — which withholds them entirely unless screening is at
// `reconcile` AND the caller may see all rows. Pre-unblind (or for a viewer) the
// data never leaves the chokepoint: the screen renders a blinded "withheld"
// state carrying no conflict rows or κ.
interface ConflictsPageProps {
  params: Promise<{ reviewId: string }>;
}

export default async function ConflictsPage({ params }: ConflictsPageProps) {
  const { reviewId } = await params;

  let ctx: MemberContext;
  try {
    ctx = await requireMember(reviewId);
  } catch (error) {
    if (isSrAuthzError(error)) notFound();
    throw error;
  }

  const db = getDb();
  const [review] = await db
    .select({ screeningStage: reviews.screeningStage })
    .from(reviews)
    .where(eq(reviews.id, reviewId))
    .limit(1);
  if (!review) notFound();

  const stage = review.screeningStage;
  const role = ctx.member.role;

  let conflicts: ScreeningConflict[] | null = null;
  let kappa: { value: number | null; label: string } = {
    value: null,
    label: '—',
  };
  try {
    const result = await getScreeningConflicts(
      { reviewId, requesterId: ctx.userId, role },
      stage,
    );
    conflicts = result.conflicts;
    kappa = result.kappa;
  } catch (error) {
    // Withheld: still blinded, or a viewer. Anything else is infra → surface it.
    if (!(error instanceof BlindedAccessError)) throw error;
  }

  if (conflicts === null) {
    const withheld: ConflictsViewDTO = {
      reviewId,
      stage,
      state: 'withheld',
      kappa: { value: null, label: '—' },
      conflicts: [],
      eligibleArbitrators: [],
      canResolve: false,
    };
    return <ConflictsScreen dto={withheld} />;
  }

  const items = await enrichConflicts(reviewId, stage, conflicts);
  const eligibleArbitrators = await loadEligibleArbitrators(reviewId);

  const dto: ConflictsViewDTO = {
    reviewId,
    stage,
    state: 'reconcile',
    kappa,
    conflicts: items,
    eligibleArbitrators,
    canResolve: canResolveConflict(role),
  };

  return <ConflictsScreen dto={dto} />;
}

// Enrich the chokepoint conflicts with VISIBLE study + member metadata and any
// recorded resolutions. Study/member reads are reviewId-scoped (never a blinded
// table). All post-unblind, so co-reviewer names are legitimately visible.
async function enrichConflicts(
  reviewId: string,
  stage: string,
  conflicts: ScreeningConflict[],
): Promise<ConflictItemDTO[]> {
  const db = getDb();
  const store = new DrizzleConflictStore(db);
  const resolutions = (await store.listResolutions(reviewId)).filter(
    (r) => r.stage === stage,
  );

  const studyIds = [...new Set(conflicts.map((c) => c.studyId))];
  const studyMeta = new Map<string, StudyMeta>();
  if (studyIds.length > 0) {
    const rows = await db
      .select({
        id: studies.id,
        title: studies.title,
        authors: studies.authors,
        journal: studies.journal,
        year: studies.year,
      })
      .from(studies)
      .where(
        and(eq(studies.reviewId, reviewId), inArray(studies.id, studyIds)),
      );
    for (const r of rows) {
      studyMeta.set(r.id, {
        title: r.title,
        authors: r.authors,
        journal: r.journal,
        year: r.year,
      });
    }
  }

  const nameIds = [
    ...new Set([
      ...conflicts.flatMap((c) => c.decisions.map((d) => d.reviewerId)),
      ...resolutions.map((r) => r.resolvedBy),
      ...resolutions
        .map((r) => r.arbitratorId)
        .filter((id): id is string => id !== null),
    ]),
  ];
  const names = await resolveNames(nameIds);

  return assembleConflicts({
    conflicts,
    resolutions,
    studies: studyMeta,
    names,
  });
}

async function loadEligibleArbitrators(
  reviewId: string,
): Promise<EligibleArbitratorDTO[]> {
  const rows = await getDb()
    .select({ userId: reviewMembers.userId, name: users.name })
    .from(reviewMembers)
    .innerJoin(users, eq(users.id, reviewMembers.userId))
    .where(
      and(
        eq(reviewMembers.reviewId, reviewId),
        eq(reviewMembers.status, 'active'),
        eq(reviewMembers.role, 'arbitrator'),
      ),
    );
  return rows.map((r) => ({ userId: r.userId, name: r.name }));
}

async function resolveNames(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await getDb()
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, ids));
  const map = new Map<string, string>();
  for (const r of rows) if (r.name) map.set(r.id, r.name);
  return map;
}
