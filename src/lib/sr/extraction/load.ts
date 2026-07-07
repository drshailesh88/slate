import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { reviewMembers, studies } from '@/lib/db/schema/sr';
import {
  BlindedAccessError,
  getExtractionEntries,
  getSafeProgress,
  type ExtractionEntryView,
} from '@/lib/sr/authz/blinded-read';
import type { MemberContext } from '@/lib/sr/authz/require-member';
import {
  deriveReconciliation,
  type RawConsensus,
  type RawEntry,
} from './derive';
import { DrizzleExtractionConsensusStore } from './drizzle-store';
import type { ConsensusRow } from './store';
import { extractionSections } from './fields';
import { getOwnExtractionEntries, hasFinishedExtraction } from './own-entries';
import { loadExtractionFacts } from './phase';
import {
  canExtract,
  canReadOwnEntries,
  canReconcile,
  canUnblindExtraction,
} from './roles';
import { isExtractionState } from './states';
import type {
  EligibleArbitratorDTO,
  ExtractionStudyDTO,
  ExtractionViewDTO,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// The extraction data SEAM — assembles the ExtractionViewDTO the client renders.
//   • the authoritative extraction phase is read SERVER-SIDE from `reviews`;
//   • Phase 1 (independent): the caller's OWN entries come through the blinding
//     chokepoint (never a blinded table, always own-only + non-AI). The DTO shape
//     carries no field that could hold a co-reviewer value or an AI value, so the
//     screen literally cannot render one before both reviewers lock.
//   • Phase 2 (reconcile): all entries come through the chokepoint (which now
//     returns every row) and are assembled into the symmetric picker by the pure
//     deriveReconciliation. The AI value is delivered but the client reveals it
//     only after the source is opened.
// ─────────────────────────────────────────────────────────────────────────────

// Duplicates the importer confidently removed are out of the pool.
const REMOVED_DUPE_STATUSES = ['auto_merged', 'merged'] as const;

async function loadExtractableStudies(
  reviewId: string,
): Promise<ExtractionStudyDTO[]> {
  const rows = await getDb()
    .select({
      id: studies.id,
      title: studies.title,
      authors: studies.authors,
      journal: studies.journal,
      year: studies.year,
      doi: studies.doi,
      externalId: studies.externalId,
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
  }));
}

export async function buildExtractionView(
  ctx: MemberContext,
  reviewId: string,
): Promise<ExtractionViewDTO | null> {
  const facts = await loadExtractionFacts(reviewId);
  if (!facts) return null;

  const role = ctx.member.role;
  const sections = extractionSections();
  const progress = (await getSafeProgress(reviewId)).extraction;
  const studyPool = await loadExtractableStudies(reviewId);

  const base = {
    reviewId,
    reviewTitle: facts.title,
    reviewType: facts.reviewType,
    canExtract: canExtract(role),
    canUnblind: canUnblindExtraction(role),
    sections,
    progress,
  };

  if (facts.phase === 'independent') {
    const ownEntries = canReadOwnEntries(role)
      ? await getOwnExtractionEntries({
          reviewId,
          requesterId: ctx.userId,
          role,
        })
      : [];
    return {
      ...base,
      phase: 'independent',
      studies: studyPool,
      ownEntries,
      finished: hasFinishedExtraction(ownEntries),
    };
  }

  // ── Reconcile ──────────────────────────────────────────────────────────────
  // A viewer is denied raw rows by the chokepoint (own='none' even at reconcile);
  // they see the derived consensus only, so an empty entry set is correct for them.
  let entries: ExtractionEntryView[] = [];
  try {
    entries = await getExtractionEntries({
      reviewId,
      requesterId: ctx.userId,
      role,
    });
  } catch (error) {
    if (!(error instanceof BlindedAccessError)) throw error;
  }

  const store = new DrizzleExtractionConsensusStore();
  const consensusRows = await store.listConsensus(reviewId);
  const names = await resolveNames([
    ...entries.filter((e) => !e.isAi).map((e) => e.reviewerId),
    ...consensusRows.map((c) => c.resolvedBy),
    ...consensusRows
      .map((c) => c.arbitratorId)
      .filter((id): id is string => id !== null),
  ]);

  const perStudy = studyPool.map((study) => ({
    study,
    entries: toRawEntries(entries.filter((e) => e.studyId === study.id)),
    consensus: toRawConsensus(
      consensusRows.filter((c) => c.studyId === study.id),
    ),
    names,
    qcRate: facts.qcSampleRate,
  }));

  const { studies: reconcileStudies, fieldsToVerify } =
    deriveReconciliation(perStudy);

  return {
    ...base,
    phase: 'reconcile',
    qcSampleRate: facts.qcSampleRate,
    studies: reconcileStudies,
    fieldsToVerify,
    canResolve: canReconcile(role),
    eligibleArbitrators: await loadEligibleArbitrators(reviewId),
  };
}

function toRawEntries(rows: readonly ExtractionEntryView[]): RawEntry[] {
  const out: RawEntry[] = [];
  for (const r of rows) {
    if (!isExtractionState(r.state)) continue;
    out.push({
      studyId: r.studyId,
      fieldId: r.fieldId,
      reviewerId: r.reviewerId,
      value: r.value,
      state: r.state,
      derived: r.derived,
      derivedFormula: r.derivedFormula,
      provenance: r.provenance,
      isAi: r.isAi,
    });
  }
  return out;
}

function toRawConsensus(rows: readonly ConsensusRow[]): RawConsensus[] {
  return rows.map((c) => ({
    studyId: c.studyId,
    fieldId: c.fieldId,
    source: c.source,
    value: c.value,
    state: c.state,
    derived: c.derived,
    derivedFormula: c.derivedFormula,
    resolutionMethod: c.resolutionMethod,
    arbitratorId: c.arbitratorId,
    authorContacted: c.authorContacted,
    authorContactNote: c.authorContactNote,
    resolvedBy: c.resolvedBy,
  }));
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
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await getDb()
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, unique));
  const map = new Map<string, string>();
  for (const r of rows) if (r.name) map.set(r.id, r.name);
  return map;
}
