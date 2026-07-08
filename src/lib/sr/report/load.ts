import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import {
  aiValidations,
  importBatches,
  reviewMembers,
  reviews,
  screeningConflictResolutions,
  studies,
} from '@/lib/db/schema/sr';
import {
  BlindedAccessError,
  getReportRobOutcomes,
  getReportScreeningOutcomes,
  getSafeProgress,
} from '@/lib/sr/authz/blinded-read';
import type { MemberContext } from '@/lib/sr/authz/require-member';
import { extractionSections } from '@/lib/sr/extraction/fields';
import { DrizzleExtractionConsensusStore } from '@/lib/sr/extraction/drizzle-store';
import type { ConsensusRow } from '@/lib/sr/extraction/store';
import { excludeReasonLabel } from '@/lib/sr/screening/exclude-reasons';
import { ROB_JUDGEMENT_LABEL } from '@/lib/sr/rob/domains';
import { assembleMethodsBlock, type MethodsMetadata } from './methods';
import { canDraftReport } from './roles';
import type {
  CharacteristicCellDTO,
  CharacteristicsRowDTO,
  GroundedCount,
  ReportReference,
  ReportViewDTO,
  RobOverallOutcome,
  RobSectionDTO,
  ScreeningSectionDTO,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// The report data SEAM — assembles the ReportViewDTO the client renders.
// Grounding is structural:
//   • every count is computed here (visible tables) or inside the blinding
//     chokepoint (blinded-derived aggregates) — the client and the draft model
//     receive finished numbers, never rows to count;
//   • blinded-derived sections (screening outcomes, RoB roll-up) arrive only
//     through the reconcile-gated chokepoint calls; while a surface is still
//     `independent` the catch below turns the refusal into a `withheld` marker
//     carrying ZERO numbers;
//   • the Methods block is assembled from recorded metadata (team roster,
//     review settings, resolution + author-contact logs, the AI validation
//     row), never free-typed.
// ─────────────────────────────────────────────────────────────────────────────

// Duplicates the importer confidently removed are out of the pool; studies from
// an undone import batch are out of the ledger entirely (reversible undo).
const REMOVED_DUPE_STATUSES = ['auto_merged', 'merged'] as const;

interface PoolStudy {
  id: string;
  title: string;
  authors: string | null;
  journal: string | null;
  year: number | null;
  doi: string | null;
  dupeStatus: string;
}

async function loadLedgerStudies(reviewId: string): Promise<PoolStudy[]> {
  const rows = await getDb()
    .select({
      id: studies.id,
      title: studies.title,
      authors: studies.authors,
      journal: studies.journal,
      year: studies.year,
      doi: studies.doi,
      dupeStatus: studies.dupeStatus,
    })
    .from(studies)
    .leftJoin(importBatches, eq(studies.batchId, importBatches.id))
    .where(
      and(
        eq(studies.reviewId, reviewId),
        or(isNull(studies.batchId), isNull(importBatches.undoneAt)),
      ),
    )
    .orderBy(studies.createdAt);
  return rows;
}

async function loadTeamCounts(
  reviewId: string,
): Promise<{ reviewerCount: number; arbitratorCount: number }> {
  const rows = await getDb()
    .select({ role: reviewMembers.role })
    .from(reviewMembers)
    .where(
      and(
        eq(reviewMembers.reviewId, reviewId),
        eq(reviewMembers.status, 'active'),
      ),
    );
  return {
    reviewerCount: rows.filter(
      (r) => r.role === 'reviewer' || r.role === 'collaborator',
    ).length,
    arbitratorCount: rows.filter((r) => r.role === 'arbitrator').length,
  };
}

async function loadScreeningResolutionCounts(
  reviewId: string,
): Promise<{ alignOnOne: number; sentToArbitrator: number }> {
  const rows = await getDb()
    .select({ method: screeningConflictResolutions.method })
    .from(screeningConflictResolutions)
    .where(eq(screeningConflictResolutions.reviewId, reviewId));
  return {
    alignOnOne: rows.filter((r) => r.method === 'align_on_one').length,
    sentToArbitrator: rows.filter((r) => r.method === 'send_to_arbitrator')
      .length,
  };
}

async function loadPassingAiValidation(
  reviewId: string,
): Promise<MethodsMetadata['aiValidation']> {
  const [row] = await getDb()
    .select({
      model: aiValidations.model,
      version: aiValidations.version,
      recall: aiValidations.recallOnIncludes,
      sampleSize: aiValidations.sampleSize,
    })
    .from(aiValidations)
    .where(
      and(eq(aiValidations.reviewId, reviewId), eq(aiValidations.passed, true)),
    )
    .orderBy(desc(aiValidations.createdAt))
    .limit(1);
  return row ?? null;
}

function firstAuthorSurname(authors: string | null): string | null {
  const first = authors?.split(/[;,]/)[0]?.trim();
  if (!first) return null;
  return first.split(/\s+/)[0] ?? null;
}

function referenceLabel(study: PoolStudy, n: number): string {
  const surname = firstAuthorSurname(study.authors);
  if (surname && study.year !== null) return `${surname} ${study.year}`;
  if (surname) return surname;
  return `Study ${n}`;
}

function cellFor(consensus: ConsensusRow | undefined): CharacteristicCellDTO {
  if (!consensus) return { value: null, state: 'pending' };
  const state =
    consensus.state === 'reported' ||
    consensus.state === 'not_reported' ||
    consensus.state === 'na' ||
    consensus.state === 'unclear'
      ? consensus.state
      : 'pending';
  return {
    value: consensus.state === 'reported' ? consensus.value : null,
    state,
  };
}

const CHARACTERISTIC_FIELDS = {
  design: 'study_design',
  population: 'population',
  sampleSize: 'sample_size',
  primaryOutcome: 'primary_outcome',
} as const;

function buildCharacteristics(
  references: readonly ReportReference[],
  consensusRows: readonly ConsensusRow[],
): CharacteristicsRowDTO[] {
  const byStudyField = new Map<string, ConsensusRow>();
  for (const row of consensusRows) {
    byStudyField.set(`${row.studyId}:${row.fieldId}`, row);
  }
  const lookup = (studyId: string, fieldId: string) =>
    byStudyField.get(`${studyId}:${fieldId}`);

  return references.map((ref) => ({
    citationKey: ref.citationKey,
    reference: ref.label,
    design: cellFor(lookup(ref.studyId, CHARACTERISTIC_FIELDS.design)),
    population: cellFor(lookup(ref.studyId, CHARACTERISTIC_FIELDS.population)),
    sampleSize: cellFor(lookup(ref.studyId, CHARACTERISTIC_FIELDS.sampleSize)),
    primaryOutcome: cellFor(
      lookup(ref.studyId, CHARACTERISTIC_FIELDS.primaryOutcome),
    ),
  }));
}

const ROB_OUTCOME_LABEL: Record<RobOverallOutcome, string> = {
  ...ROB_JUDGEMENT_LABEL,
  mixed: 'Mixed (to reconcile)',
  unassessed: 'Not yet assessed',
};

export async function buildReportView(
  ctx: MemberContext,
  reviewId: string,
): Promise<ReportViewDTO | null> {
  const db = getDb();
  const [review] = await db
    .select({
      title: reviews.title,
      reviewType: reviews.reviewType,
      reviewMode: reviews.reviewMode,
      screeningStage: reviews.screeningStage,
      screeningPhase: reviews.screeningPhase,
      extractionPhase: reviews.extractionPhase,
      robPhase: reviews.robPhase,
      qcSampleRate: reviews.extractionQcSampleRate,
    })
    .from(reviews)
    .where(eq(reviews.id, reviewId))
    .limit(1);
  if (!review) return null;

  const role = ctx.member.role;
  const blindedCtx = { reviewId, requesterId: ctx.userId, role };

  const ledger = await loadLedgerStudies(reviewId);
  const removed = ledger.filter((s) =>
    (REMOVED_DUPE_STATUSES as readonly string[]).includes(s.dupeStatus),
  );
  const pool = ledger.filter(
    (s) => !(REMOVED_DUPE_STATUSES as readonly string[]).includes(s.dupeStatus),
  );

  // Blinded-derived aggregates: reconcile-gated. A refusal is the designed
  // `withheld` state, never a zero pretending to be a count.
  let screening: ScreeningSectionDTO = { status: 'withheld' };
  let includedStudyIds: string[] = [];
  try {
    const outcomes = await getReportScreeningOutcomes(
      blindedCtx,
      review.screeningStage,
    );
    screening = {
      status: 'available',
      stage: outcomes.stage,
      included: outcomes.includedStudyIds.length,
      excluded: outcomes.excludedStudyIds.length,
      excludeReasons: outcomes.excludeReasonCounts.map((r) => ({
        label: excludeReasonLabel(r.code) ?? 'No reason recorded',
        count: r.count,
      })),
      conflictPending: outcomes.conflictPending,
      inProgress: outcomes.inProgress,
    };
    includedStudyIds = outcomes.includedStudyIds;
  } catch (error) {
    if (!(error instanceof BlindedAccessError)) throw error;
  }

  let rob: RobSectionDTO = { status: 'withheld' };
  try {
    const outcomes = await getReportRobOutcomes(blindedCtx);
    rob = {
      status: 'available',
      distribution: (
        Object.entries(outcomes.distribution) as Array<
          [RobOverallOutcome, number]
        >
      ).map(([outcome, count]) => ({
        outcome,
        label: ROB_OUTCOME_LABEL[outcome],
        count,
      })),
    };
  } catch (error) {
    if (!(error instanceof BlindedAccessError)) throw error;
  }

  const includedSet = new Set(includedStudyIds);
  const includedStudies = pool.filter((s) => includedSet.has(s.id));
  const references: ReportReference[] = includedStudies.map((study, i) => ({
    citationKey: `S${i + 1}`,
    n: i + 1,
    studyId: study.id,
    label: referenceLabel(study, i + 1),
    title: study.title,
    journal: study.journal,
    year: study.year,
    doi: study.doi,
  }));

  const consensusStore = new DrizzleExtractionConsensusStore();
  const consensusRows = await consensusStore.listConsensus(reviewId);
  const characteristics = buildCharacteristics(references, consensusRows);

  const [team, screeningResolutions, aiValidation, progress] =
    await Promise.all([
      loadTeamCounts(reviewId),
      loadScreeningResolutionCounts(reviewId),
      loadPassingAiValidation(reviewId),
      getSafeProgress(reviewId),
    ]);

  const sections = extractionSections();
  const contactRows = consensusRows.filter((r) => r.authorContacted);
  const methods = assembleMethodsBlock({
    reviewMode: review.reviewMode,
    reviewerCount: team.reviewerCount,
    arbitratorCount: team.arbitratorCount,
    screeningResolutions,
    extractionResolutions: {
      discuss: consensusRows.filter((r) => r.resolutionMethod === 'discuss')
        .length,
      arbitrator: consensusRows.filter(
        (r) => r.resolutionMethod === 'arbitrator',
      ).length,
      authorContact: consensusRows.filter(
        (r) => r.resolutionMethod === 'author_contact',
      ).length,
      unresolved: consensusRows.filter(
        (r) => r.resolutionMethod === 'unresolved',
      ).length,
    },
    authorContacts: {
      fields: contactRows.length,
      studies: new Set(contactRows.map((r) => r.studyId)).size,
    },
    aiValidation,
    qcSampleRate: review.qcSampleRate,
    extractionFieldCount: sections.reduce(
      (sum, section) => sum + section.fields.length,
      0,
    ),
    extractionSectionLabels: sections.map((s) => s.label),
  });

  const counts: GroundedCount[] = [
    {
      key: 'identified',
      label: 'Records identified',
      value: ledger.length,
      source: 'import_ledger',
    },
    {
      key: 'duplicates_removed',
      label: 'Duplicates removed',
      value: removed.length,
      source: 'import_ledger',
    },
    {
      key: 'in_pool',
      label: 'Records screened',
      value: pool.length,
      source: 'import_ledger',
    },
    ...(screening.status === 'available'
      ? [
          {
            key: 'included',
            label: 'Studies included',
            value: screening.included,
            source: 'screening_records' as const,
          },
          {
            key: 'excluded',
            label: 'Records excluded',
            value: screening.excluded,
            source: 'screening_records' as const,
          },
        ]
      : []),
  ];

  return {
    reviewId,
    reviewTitle: review.title,
    reviewType: review.reviewType,
    reviewMode: review.reviewMode,
    canDraft: canDraftReport(role),
    phases: {
      screening: review.screeningPhase,
      extraction: review.extractionPhase,
      rob: review.robPhase,
    },
    progress,
    counts,
    screening,
    rob,
    references,
    characteristics,
    methods,
  };
}
