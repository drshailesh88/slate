import {
  getExtractionEntries,
  type BlindedContext,
  type ExtractionEntryView,
} from '@/lib/sr/authz/blinded-read';
import { isExtractionState } from './states';
import type { OwnEntryDTO, ProvenanceDTO } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// The extraction screen's Phase-1 read — always through the blinding chokepoint
// (never a blinded table). The chokepoint already returns own-only during
// `independent`; this seam adds two screen-specific guarantees on top:
//
//   1. `reviewerId === ctx.requesterId` — Phase 1 is an OWN surface. Even if a
//      caller reached this at `reconcile` (where the chokepoint would hand back
//      every row), it still yields only the caller's own values. Reconciliation
//      is a different render path (deriveReconciliation), not this one.
//   2. `!isAi` — the AI's extraction is blinded like a human's; it never seeds a
//      reviewer's entry (non-neg #5). It surfaces only at reconcile, and only as
//      a labeled, source-gated suggestion.
//
// A leak of a co-reviewer's or the AI's value through this seam would breach the
// firewall — it is exercised by the side-channel test for this screen.
// ─────────────────────────────────────────────────────────────────────────────

function toProvenance(raw: unknown): ProvenanceDTO | null {
  if (raw == null || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const str = (v: unknown): string | null =>
    typeof v === 'string' && v.trim().length > 0
      ? v
      : typeof v === 'number'
        ? String(v)
        : null;
  const dto: ProvenanceDTO = {
    reportId: str(p.reportId),
    page: str(p.page),
    locator: str(p.locator),
  };
  if (dto.reportId == null && dto.page == null && dto.locator == null) {
    return null;
  }
  return dto;
}

function toOwnEntry(row: ExtractionEntryView): OwnEntryDTO | null {
  if (!isExtractionState(row.state)) return null;
  return {
    studyId: row.studyId,
    fieldId: row.fieldId,
    value: row.value,
    state: row.state,
    derived: row.derived,
    derivedFormula: row.derivedFormula,
    provenance: toProvenance(row.provenance),
    locked: row.lockedAt != null,
  };
}

export async function getOwnExtractionEntries(
  ctx: BlindedContext,
): Promise<OwnEntryDTO[]> {
  const rows = await getExtractionEntries(ctx);
  const own: OwnEntryDTO[] = [];
  for (const row of rows) {
    if (row.reviewerId !== ctx.requesterId) continue;
    if (row.isAi) continue;
    const entry = toOwnEntry(row);
    if (entry) own.push(entry);
  }
  return own;
}

// True once the reviewer has finished extraction — i.e. they have authored at
// least one entry and every one of them is locked. This is the FIREWALL signal:
// only after both reviewers reach this can any reconciliation happen.
export function hasFinishedExtraction(
  entries: readonly OwnEntryDTO[],
): boolean {
  return entries.length > 0 && entries.every((e) => e.locked);
}
