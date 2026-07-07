import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { studies } from '@/lib/db/schema/sr';
import {
  getRobAssessments,
  getSafeProgress,
  type RobAssessmentView,
} from '@/lib/sr/authz/blinded-read';
import type { MemberContext } from '@/lib/sr/authz/require-member';
import {
  domainsForInstrument,
  isRobInstrument,
  ROB_INSTRUMENTS,
  rollUpOverall,
  type RobInstrument,
  type RobJudgement,
} from './domains';
import { getOwnRobJudgements, hasFinishedRob } from './own-assessments';
import { loadRobFacts } from './phase';
import { assembleReconciliation } from './reconcile';
import {
  canAppraiseRob,
  canReadRob,
  canReconcileRob,
  canUnblindRob,
} from './roles';
import type { OwnDomainJudgementDTO, RobStudyDTO, RobViewDTO } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// The Risk-of-Bias data SEAM — assembles the RobViewDTO the client renders.
// It reads:
//   • the authoritative phase from `reviews.rob_phase` (server-side, never client);
//   • the non-blinded study pool from `studies` (removed duplicates excluded),
//     each carrying its RoB instrument (RoB 2 / ROBINS-I);
//   • the caller's OWN domain judgements through the blinding chokepoint (never a
//     blinded table, and re-filtered to own + non-AI — see own-assessments.ts);
//   • at reconcile, ALL judgements through the chokepoint (every reviewer + the
//     AI's labeled suggestion) for the reveal;
//   • blinding-safe completion counts from the chokepoint (getSafeProgress).
//
// The per-study `overall` roll-up is computed over the CALLER'S OWN judgements —
// during independent that is provably their own data (the chokepoint hands back
// nothing else), so no aggregate over another reviewer ever escapes the firewall.
// ─────────────────────────────────────────────────────────────────────────────

// Duplicates the importer confidently removed are out of the appraisal pool.
const REMOVED_DUPE_STATUSES = ['auto_merged', 'merged'] as const;

interface AppraisableStudy {
  id: string;
  refId: string;
  title: string;
  authors: string | null;
  journal: string | null;
  year: number | null;
  doi: string | null;
  instrument: RobInstrument;
}

export async function loadAppraisableStudies(
  reviewId: string,
): Promise<AppraisableStudy[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: studies.id,
      title: studies.title,
      authors: studies.authors,
      journal: studies.journal,
      year: studies.year,
      doi: studies.doi,
      externalId: studies.externalId,
      robInstrument: studies.robInstrument,
    })
    .from(studies)
    .where(
      and(
        eq(studies.reviewId, reviewId),
        notInArray(studies.dupeStatus, [...REMOVED_DUPE_STATUSES]),
      ),
    )
    .orderBy(studies.createdAt);

  return rows.map((row, index) => ({
    id: row.id,
    refId: row.externalId ?? `#${index + 1}`,
    title: row.title,
    authors: row.authors,
    journal: row.journal,
    year: row.year,
    doi: row.doi,
    instrument: isRobInstrument(row.robInstrument) ? row.robInstrument : 'rob2',
  }));
}

// Group the caller's own judgements into studyId → (domainId → judgement) for the
// roll-up, plus a flat list for the client.
function indexOwnJudgements(
  judgements: readonly OwnDomainJudgementDTO[],
): Map<string, Map<string, RobJudgement>> {
  const byStudy = new Map<string, Map<string, RobJudgement>>();
  for (const j of judgements) {
    const domains = byStudy.get(j.studyId) ?? new Map<string, RobJudgement>();
    domains.set(j.domainId, j.judgement);
    byStudy.set(j.studyId, domains);
  }
  return byStudy;
}

function toStudyDto(
  study: AppraisableStudy,
  ownByDomain: ReadonlyMap<string, RobJudgement> | undefined,
): RobStudyDTO {
  const domains = domainsForInstrument(study.instrument);
  return {
    id: study.id,
    refId: study.refId,
    title: study.title,
    authors: study.authors,
    journal: study.journal,
    year: study.year,
    doi: study.doi,
    instrument: study.instrument,
    instrumentLabel: ROB_INSTRUMENTS[study.instrument].label,
    domains: domains.map((d) => ({
      id: d.id,
      name: d.name,
      signalling: [...d.signalling],
    })),
    overall: rollUpOverall(study.instrument, ownByDomain ?? new Map()),
  };
}

// Resolve display labels for the non-AI reviewer ids present in the reconcile
// rows (a visible `users` read — never the blinded table).
async function resolveReviewerLabels(
  reviewerIds: readonly string[],
): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  if (reviewerIds.length === 0) return labels;
  const db = getDb();
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(inArray(users.id, [...reviewerIds]));
  for (const row of rows) {
    labels.set(row.id, row.name ?? row.email ?? 'Reviewer');
  }
  return labels;
}

export async function buildRobView(
  ctx: MemberContext,
  reviewId: string,
): Promise<RobViewDTO | null> {
  const facts = await loadRobFacts(reviewId);
  if (!facts) return null;

  const role = ctx.member.role;
  const pool = await loadAppraisableStudies(reviewId);
  const progress = (await getSafeProgress(reviewId)).rob;

  const blindedCtx = { reviewId, requesterId: ctx.userId, role };
  const ownJudgements = canReadRob(role)
    ? await getOwnRobJudgements(blindedCtx)
    : [];
  const ownByStudy = indexOwnJudgements(ownJudgements);

  const studyDtos = pool.map((study) =>
    toStudyDto(study, ownByStudy.get(study.id)),
  );

  const base = {
    reviewId,
    reviewTitle: facts.title,
    reviewType: facts.reviewType,
    canAppraise: canAppraiseRob(role),
    canReconcile: canReconcileRob(role),
    canUnblind: canUnblindRob(role),
    finished: hasFinishedRob(ownJudgements),
    studies: studyDtos,
    progress,
  };

  if (facts.phase === 'independent') {
    return {
      ...base,
      phase: 'independent',
      judgements: ownJudgements,
      reconciliation: [],
    };
  }

  // ── Reconcile: the reveal. The chokepoint returns ALL rows now (visibility is
  // 'all' post-flip); the assembler groups them per (study, domain) with the AI
  // labeled and the reconciler's own row split out as the consensus.
  const allRows: RobAssessmentView[] = canReadRob(role)
    ? await getRobAssessments(blindedCtx)
    : [];

  const humanIds = Array.from(
    new Set(allRows.filter((r) => !r.isAi).map((r) => r.reviewerId)),
  );
  const labels = await resolveReviewerLabels(humanIds);
  const domainNameByStudy = new Map(
    pool.map((s) => [
      s.id,
      domainsForInstrument(s.instrument).map((d) => ({
        id: d.id,
        name: d.name,
      })),
    ]),
  );

  const reconciliation = assembleReconciliation(allRows, {
    consensusAuthorId: canReconcileRob(role) ? ctx.userId : null,
    labelFor: (reviewerId, isAi) =>
      isAi ? 'AI reviewer' : (labels.get(reviewerId) ?? 'Reviewer'),
    domainsFor: (studyId) => domainNameByStudy.get(studyId) ?? [],
    studyIds: pool.map((s) => s.id),
  });

  return {
    ...base,
    phase: 'reconcile',
    judgements: [],
    reconciliation,
  };
}
