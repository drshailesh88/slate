import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { studies } from '@/lib/db/schema/sr';
import {
  BlindedAccessError,
  getPrismaFlow,
  getSafeProgress,
} from '@/lib/sr/authz/blinded-read';
import type { MemberContext } from '@/lib/sr/authz/require-member';
import { excludeReasonLabel } from '@/lib/sr/screening/exclude-reasons';
import { derivePrismaIdentification, type PrismaFlow } from './derive';
import type { PrismaFlowDTO, PrismaStudyRefDTO, PrismaViewDTO } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// The PRISMA data SEAM — assembles the PrismaViewDTO the client renders.
//
// Every blinded-derived number (stage counts, per-reason exclusions, drill-down
// bucket membership) comes from ONE chokepoint call (getPrismaFlow) — never a
// client store, never a COUNT on a blinded table. When the chokepoint withholds
// the flow (screening still independent, or the caller is a viewer), the DTO
// carries only the non-blinded Identification block (from `studies`) plus the
// safe completion counts (getSafeProgress) — the withheld state is honest, not
// a zeroed diagram.
// ─────────────────────────────────────────────────────────────────────────────

const NOT_RECORDED_LABEL = 'Reason not recorded';

export async function buildPrismaView(
  reviewId: string,
  ctx: MemberContext,
): Promise<PrismaViewDTO> {
  const pool = await loadStudyRefs(reviewId);

  let flow: PrismaFlow | null = null;
  try {
    flow = await getPrismaFlow({
      reviewId,
      requesterId: ctx.userId,
      role: ctx.member.role,
    });
  } catch (error) {
    // Withheld: still blinded, or a viewer. Anything else is infra → surface it.
    if (!(error instanceof BlindedAccessError)) throw error;
  }

  if (flow === null) {
    const progress = await getSafeProgress(reviewId);
    return {
      reviewId,
      state: 'independent',
      identification: derivePrismaIdentification(pool.rows),
      progress: progress.screening,
      flow: null,
      studies: pool.refs,
    };
  }

  return {
    reviewId,
    state: 'reconcile',
    // One snapshot: identification from the same chokepoint derivation, so the
    // rendered flow reconciles exactly.
    identification: flow.identification,
    progress: null,
    flow: toFlowDto(flow),
    studies: pool.refs,
  };
}

function toFlowDto(flow: PrismaFlow): PrismaFlowDTO {
  return {
    screening: flow.screening,
    eligibility: {
      assessed: flow.eligibility.assessed,
      excluded: flow.eligibility.excluded,
      inProgress: flow.eligibility.inProgress,
      reasons: flow.eligibility.exclusionReasons.map((reason) => ({
        code: reason.code,
        label: excludeReasonLabel(reason.code) ?? NOT_RECORDED_LABEL,
        count: reason.count,
        studyIds: reason.studyIds,
      })),
    },
    included: flow.included,
    buckets: flow.buckets,
  };
}

async function loadStudyRefs(reviewId: string) {
  const rows = await getDb()
    .select({
      id: studies.id,
      title: studies.title,
      authors: studies.authors,
      year: studies.year,
      source: studies.source,
      dupeStatus: studies.dupeStatus,
    })
    .from(studies)
    .where(eq(studies.reviewId, reviewId))
    .orderBy(studies.createdAt);

  const refs: Record<string, PrismaStudyRefDTO> = {};
  for (const row of rows) {
    refs[row.id] = {
      id: row.id,
      title: row.title,
      authors: row.authors,
      year: row.year,
    };
  }

  return {
    rows: rows.map((row) => ({
      id: row.id,
      source: row.source,
      dupeStatus: row.dupeStatus,
    })),
    refs,
  };
}
