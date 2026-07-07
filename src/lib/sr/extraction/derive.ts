import { EXTRACTION_FIELDS, fieldDef } from './fields';
import { isQcSampled } from './qc';
import { resolveFinal } from './resolve-final';
import type { ExtractionState } from './states';
import type {
  ExtractionConsensusSource,
  ExtractionResolutionMethod,
  ExtractionStudyDTO,
  FieldConsensusDTO,
  ProvenanceDTO,
  ReconcileEntryDTO,
  ReconcileFieldDTO,
  ReconcileStudyDTO,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// deriveReconciliation (T15) — pure assembly of the Phase-2 reconcile grid from
// the (all-rows) blinded entries the chokepoint returns at reconcile, the
// visible study/member metadata, and any recorded consensus.
//
// Everything blinding-sensitive already happened upstream: this runs ONLY at
// reconcile (the seam calls it after the chokepoint returned `all`). It maps the
// two human extractors to positional, equal-weight slots (reviewer1 / reviewer2)
// — NEITHER is "primary" — and attaches the AI as a labeled third input whose
// value the UI reveals only after the source is opened. The Final cell is
// computed by the corrected resolveFinal (empty until a human picks; agreed ≠ AI).
// ─────────────────────────────────────────────────────────────────────────────

// Structural row shapes — deliberately NOT the blinded schema types, so this
// module names no blinded symbol (it takes what the chokepoint already returned).
export interface RawEntry {
  studyId: string;
  fieldId: string;
  reviewerId: string;
  value: string | null;
  state: ExtractionState;
  derived: boolean;
  derivedFormula: string | null;
  provenance: unknown;
  isAi: boolean;
}

export interface RawConsensus {
  studyId: string;
  fieldId: string;
  source: ExtractionConsensusSource;
  value: string | null;
  state: ExtractionState;
  derived: boolean;
  derivedFormula: string | null;
  resolutionMethod: ExtractionResolutionMethod;
  arbitratorId: string | null;
  authorContacted: boolean;
  authorContactNote: string | null;
  resolvedBy: string;
}

function toProvenance(raw: unknown): ProvenanceDTO | null {
  if (raw == null || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const str = (v: unknown): string | null =>
    typeof v === 'string' && v.trim().length > 0 ? v : null;
  const dto: ProvenanceDTO = {
    reportId: str(p.reportId),
    page: str(p.page ?? (typeof p.page === 'number' ? String(p.page) : null)),
    locator: str(p.locator),
  };
  if (dto.reportId == null && dto.page == null && dto.locator == null) {
    return null;
  }
  return dto;
}

function sourceQuoteFrom(raw: unknown): string | null {
  if (raw == null || typeof raw !== 'object') return null;
  const q = (raw as Record<string, unknown>).sourceQuote;
  return typeof q === 'string' && q.trim().length > 0 ? q : null;
}

function toEntry(
  row: RawEntry,
  slot: ExtractionConsensusSource,
  reviewerName: string | null,
): ReconcileEntryDTO {
  return {
    slot,
    reviewerName,
    isAi: row.isAi,
    value: row.value,
    state: row.state,
    derived: row.derived,
    derivedFormula: row.derivedFormula,
    provenance: toProvenance(row.provenance),
    sourceQuote: row.isAi ? sourceQuoteFrom(row.provenance) : null,
  };
}

function toConsensusDTO(
  row: RawConsensus,
  names: ReadonlyMap<string, string>,
): FieldConsensusDTO {
  return {
    source: row.source,
    value: row.value,
    state: row.state,
    derived: row.derived,
    derivedFormula: row.derivedFormula,
    resolutionMethod: row.resolutionMethod,
    arbitratorName: row.arbitratorId
      ? (names.get(row.arbitratorId) ?? null)
      : null,
    authorContacted: row.authorContacted,
    authorContactNote: row.authorContactNote,
    resolvedByName: names.get(row.resolvedBy) ?? null,
  };
}

// The two human extractors for a study, mapped to stable positional slots by a
// deterministic sort of their reviewer ids — reviewer1/reviewer2 stay consistent
// across every field of that study, and neither is preferred.
function humanSlots(
  entries: readonly RawEntry[],
): [string | null, string | null] {
  const humans = [
    ...new Set(entries.filter((e) => !e.isAi).map((e) => e.reviewerId)),
  ].sort();
  return [humans[0] ?? null, humans[1] ?? null];
}

export interface DeriveStudyArgs {
  study: ExtractionStudyDTO;
  entries: readonly RawEntry[];
  consensus: readonly RawConsensus[];
  names: ReadonlyMap<string, string>;
  qcRate: number;
}

export function deriveStudyReconciliation(
  args: DeriveStudyArgs,
): ReconcileStudyDTO {
  const { study, entries, consensus, names, qcRate } = args;
  const [slot1Id, slot2Id] = humanSlots(entries);
  const aiId = entries.find((e) => e.isAi)?.reviewerId ?? null;

  const entryFor = (
    reviewerId: string | null,
    fieldId: string,
    slot: ExtractionConsensusSource,
  ): ReconcileEntryDTO | null => {
    if (!reviewerId) return null;
    const row = entries.find(
      (e) => e.reviewerId === reviewerId && e.fieldId === fieldId,
    );
    if (!row) return null;
    return toEntry(
      row,
      slot,
      reviewerId === aiId ? null : (names.get(reviewerId) ?? null),
    );
  };

  const fields: ReconcileFieldDTO[] = EXTRACTION_FIELDS.map((def) => {
    const reviewer1 = entryFor(slot1Id, def.id, 'reviewer1');
    const reviewer2 = entryFor(slot2Id, def.id, 'reviewer2');
    const ai = entryFor(aiId, def.id, 'ai');
    const consensusRow =
      consensus.find((c) => c.studyId === study.id && c.fieldId === def.id) ??
      null;

    const final = resolveFinal({
      reviewer1: reviewer1
        ? { value: reviewer1.value, state: reviewer1.state }
        : null,
      reviewer2: reviewer2
        ? { value: reviewer2.value, state: reviewer2.state }
        : null,
      consensus: consensusRow
        ? {
            value: consensusRow.value,
            state: consensusRow.state,
            resolutionMethod: consensusRow.resolutionMethod,
          }
        : null,
    });

    const agreed = final.kind === 'agreed';
    // A field neither human extracted is "not extracted", NOT a conflict — only a
    // genuine disagreement (at least one human value present, not agreed, not
    // resolved) counts as an open conflict needing a human pick.
    const hasHumanEntry = reviewer1 !== null || reviewer2 !== null;
    const conflict = final.kind === 'conflict' && hasHumanEntry;
    const critical = fieldDef(def.id)?.critical ?? false;
    const qcFlagged =
      agreed &&
      critical &&
      isQcSampled({ studyId: study.id, fieldId: def.id }, qcRate);

    return {
      fieldId: def.id,
      label: def.label,
      section: def.section,
      critical,
      reviewer1,
      reviewer2,
      ai,
      final,
      agreed,
      conflict,
      qcFlagged,
      consensus: consensusRow ? toConsensusDTO(consensusRow, names) : null,
    };
  });

  // "N fields to verify" — open conflicts plus QC-sampled agreed fields. A field
  // resolved (discuss/arbitrator → final.kind 'resolved') or deliberately parked
  // (`unresolved`, the recorded ladder) is handled, not outstanding; a field only
  // mid-ladder on an `author_contact` log is still outstanding.
  const isOutstandingConflict = (f: ReconcileFieldDTO): boolean =>
    f.conflict &&
    (f.consensus === null || f.consensus.resolutionMethod === 'author_contact');
  const fieldsToVerify = fields.filter(
    (f) => isOutstandingConflict(f) || f.qcFlagged,
  ).length;

  return { study, fields, fieldsToVerify };
}

export function deriveReconciliation(studies: readonly DeriveStudyArgs[]): {
  studies: ReconcileStudyDTO[];
  fieldsToVerify: number;
} {
  const built = studies.map(deriveStudyReconciliation);
  return {
    studies: built,
    fieldsToVerify: built.reduce((sum, s) => sum + s.fieldsToVerify, 0),
  };
}
