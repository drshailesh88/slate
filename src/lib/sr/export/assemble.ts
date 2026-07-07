import {
  BlindedAccessError,
  getExtractionEntriesForExport,
  getRobAssessmentsForExport,
  getScreeningDecisionsForExport,
  type BlindedContext,
  type BlindedSurface,
  type ExtractionEntryView,
  type RobAssessmentView,
  type ScreeningDecisionView,
} from '@/lib/sr/authz/blinded-read';
import { fieldDef } from '@/lib/sr/extraction/fields';
import type { ProvenanceDTO } from '@/lib/sr/extraction/types';
import { DrizzleExportStore } from './drizzle-store';
import type { ExportStore } from './store';
import type {
  AsExtractedExportRow,
  ConsensusExportRow,
  ExportBundle,
  ExportSection,
  ExportSectionSummary,
  ExportStudyRef,
  ExportViewDTO,
  RobExportRow,
  ScreeningExportRow,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// The export data seam — assembles the ExportBundle every format renders from.
//
//   • VISIBLE data (review facts, the study pool, the consensus table, user
//     labels) comes through the ExportStore port.
//   • BLINDED data (as-extracted entries, RoB assessments, screening decisions)
//     comes ONLY through the chokepoint's ForExport readers, which read the
//     authoritative phase from `reviews` themselves and refuse during
//     `independent` for every role — a spoofed or stale phase here cannot leak
//     anything. A refusal becomes an honest `withheld` section, never a
//     silently-empty one.
//   • The consensus dataset and the as-extracted dataset stay SEPARATE bundle
//     fields with distinct row shapes (non-neg #8) — the reconciled value never
//     replaces either reviewer's original.
// ─────────────────────────────────────────────────────────────────────────────

export interface ExportDeps {
  store: ExportStore;
  readScreening: typeof getScreeningDecisionsForExport;
  readEntries: typeof getExtractionEntriesForExport;
  readRob: typeof getRobAssessmentsForExport;
  now: () => Date;
}

export function createDefaultExportDeps(): ExportDeps {
  return {
    store: new DrizzleExportStore(),
    readScreening: getScreeningDecisionsForExport,
    readEntries: getExtractionEntriesForExport,
    readRob: getRobAssessmentsForExport,
    now: () => new Date(),
  };
}

const AI_REVIEWER_LABEL = 'AI reviewer';
const FALLBACK_REVIEWER_LABEL = 'Reviewer';
const UNKNOWN_STUDY_LABEL = 'Unknown study';

const SURFACE_NOUN: Record<BlindedSurface, string> = {
  screening: 'screening decisions',
  extraction: 'as-extracted entries',
  rob: 'risk-of-bias assessments',
};

function withheldReason(error: BlindedAccessError): string {
  if (error.phase === 'independent') {
    return (
      `Blinded per-reviewer ${SURFACE_NOUN[error.surface]} are withheld while ` +
      `${error.surface === 'rob' ? 'risk of bias' : error.surface} is independent. ` +
      `Unblind to reconcile to export them.`
    );
  }
  return (
    `Per-reviewer ${SURFACE_NOUN[error.surface]} are not available to your ` +
    `role — export the consensus dataset instead.`
  );
}

async function readSection<View>(
  read: (ctx: BlindedContext) => Promise<View[]>,
  ctx: BlindedContext,
): Promise<ExportSection<View>> {
  try {
    return { status: 'ready', rows: await read(ctx) };
  } catch (error) {
    if (error instanceof BlindedAccessError) {
      return { status: 'withheld', reason: withheldReason(error) };
    }
    throw error;
  }
}

// Provenance travels as an untyped jsonb; keep only the structured fields the
// extraction form writes so an export never fabricates provenance.
export function toProvenance(value: unknown): ProvenanceDTO | null {
  if (value == null || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const pick = (key: string): string | null =>
    typeof raw[key] === 'string' && raw[key] !== ''
      ? (raw[key] as string)
      : null;
  const provenance = {
    reportId: pick('reportId'),
    page: pick('page'),
    locator: pick('locator'),
  };
  return provenance.reportId || provenance.page || provenance.locator
    ? provenance
    : null;
}

function fieldLabel(fieldId: string): string {
  return fieldDef(fieldId)?.label ?? fieldId;
}

export async function buildExportBundle(
  ctx: BlindedContext,
  deps: ExportDeps = createDefaultExportDeps(),
): Promise<ExportBundle | null> {
  const facts = await deps.store.getReviewFacts(ctx.reviewId);
  if (!facts) return null;

  const [studyRows, consensusRows] = await Promise.all([
    deps.store.listStudies(ctx.reviewId),
    deps.store.listConsensus(ctx.reviewId),
  ]);

  const [screening, asExtracted, rob] = await Promise.all([
    readSection(deps.readScreening, ctx),
    readSection(deps.readEntries, ctx),
    readSection(deps.readRob, ctx),
  ]);

  const studies: ExportStudyRef[] = studyRows.map((row, index) => ({
    id: row.id,
    refId: row.externalId ?? `#${index + 1}`,
    title: row.title,
    abstract: row.abstract,
    authors: row.authors,
    journal: row.journal,
    year: row.year,
    doi: row.doi,
    externalId: row.externalId,
  }));
  const studyTitleById = new Map(studies.map((s) => [s.id, s.title]));
  const studyTitle = (id: string): string =>
    studyTitleById.get(id) ?? UNKNOWN_STUDY_LABEL;

  const humanIds = new Set<string>(consensusRows.map((r) => r.resolvedBy));
  const collectHumans = (rows: Array<{ reviewerId: string; isAi: boolean }>) =>
    rows.filter((r) => !r.isAi).forEach((r) => humanIds.add(r.reviewerId));
  if (screening.status === 'ready') collectHumans(screening.rows);
  if (asExtracted.status === 'ready') collectHumans(asExtracted.rows);
  if (rob.status === 'ready') collectHumans(rob.rows);

  const labels = await deps.store.listUserLabels([...humanIds]);
  const reviewerLabel = (id: string, isAi: boolean): string =>
    isAi ? AI_REVIEWER_LABEL : (labels.get(id) ?? FALLBACK_REVIEWER_LABEL);

  const consensus: ConsensusExportRow[] = consensusRows.map((row) => ({
    studyId: row.studyId,
    studyTitle: studyTitle(row.studyId),
    fieldId: row.fieldId,
    fieldLabel: fieldLabel(row.fieldId),
    value: row.value,
    state: row.state,
    derived: row.derived,
    derivedFormula: row.derivedFormula,
    provenance: toProvenance(row.provenance),
    source: row.source,
    resolutionMethod: row.resolutionMethod,
    authorContacted: row.authorContacted,
    authorContactNote: row.authorContactNote,
    resolvedByLabel: reviewerLabel(row.resolvedBy, false),
  }));

  const mapSection = <View, Row>(
    section: ExportSection<View>,
    map: (view: View) => Row,
  ): ExportSection<Row> =>
    section.status === 'ready'
      ? { status: 'ready', rows: section.rows.map(map) }
      : section;

  return {
    review: {
      id: facts.id,
      title: facts.title,
      reviewType: facts.reviewType,
      screeningPhase: facts.screeningPhase,
      extractionPhase: facts.extractionPhase,
      robPhase: facts.robPhase,
    },
    generatedAt: deps.now().toISOString(),
    studies,
    consensus,
    asExtracted: mapSection(
      asExtracted,
      (v: ExtractionEntryView): AsExtractedExportRow => ({
        studyId: v.studyId,
        studyTitle: studyTitle(v.studyId),
        fieldId: v.fieldId,
        fieldLabel: fieldLabel(v.fieldId),
        reviewerLabel: reviewerLabel(v.reviewerId, v.isAi),
        isAi: v.isAi,
        value: v.value,
        state: v.state as AsExtractedExportRow['state'],
        derived: v.derived,
        derivedFormula: v.derivedFormula,
        provenance: toProvenance(v.provenance),
      }),
    ),
    rob: mapSection(rob, (v: RobAssessmentView): RobExportRow => ({
      studyId: v.studyId,
      studyTitle: studyTitle(v.studyId),
      reviewerLabel: reviewerLabel(v.reviewerId, v.isAi),
      isAi: v.isAi,
      domainId: v.domain,
      judgement: v.judgement,
      supportQuote: v.supportQuote,
    })),
    screening: mapSection(
      screening,
      (v: ScreeningDecisionView): ScreeningExportRow => ({
        studyId: v.studyId,
        studyTitle: studyTitle(v.studyId),
        reviewerLabel: reviewerLabel(v.reviewerId, v.isAi),
        isAi: v.isAi,
        stage: v.stage,
        decision: v.decision,
        excludeReasonCode: v.excludeReasonCode,
        excludeReasonDetail: v.excludeReasonDetail,
      }),
    ),
  };
}

function summarize<T>(section: ExportSection<T>): ExportSectionSummary {
  return section.status === 'ready'
    ? { status: 'ready', count: section.rows.length, reason: null }
    : { status: 'withheld', count: 0, reason: section.reason };
}

export function toExportView(bundle: ExportBundle): ExportViewDTO {
  return {
    reviewId: bundle.review.id,
    reviewTitle: bundle.review.title,
    reviewType: bundle.review.reviewType,
    studyCount: bundle.studies.length,
    consensusCount: bundle.consensus.length,
    asExtracted: summarize(bundle.asExtracted),
    rob: summarize(bundle.rob),
    screening: summarize(bundle.screening),
  };
}
