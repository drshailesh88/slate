import type { ExportBundle, ExportStudyRef } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// RIS export — the study references (non-blinded), one record per study. Tags
// mirror what our own importer reads (src/lib/sr/import-parse.ts: TY/TI/AU/PY/
// JO/DO/AB/AN/ER), so an export round-trips through `parseRis` losslessly —
// and imports cleanly into EndNote/Zotero/Covidence.
// ─────────────────────────────────────────────────────────────────────────────

// The importer stores authors as one text blob; split on the common separators
// so each author gets its own AU line (the RIS convention).
function splitAuthors(authors: string | null): string[] {
  if (!authors) return [];
  return authors
    .split(/;|\band\b/)
    .map((a) => a.trim())
    .filter(Boolean);
}

// RIS is line-oriented: a newline inside a value would corrupt the record.
function sanitize(value: string): string {
  return value.replace(/\s*[\r\n]+\s*/g, ' ').trim();
}

function toRecord(study: ExportStudyRef): string {
  const lines: string[] = ['TY  - JOUR'];
  const push = (tag: string, value: string | number | null) => {
    if (value == null || value === '') return;
    lines.push(`${tag}  - ${sanitize(String(value))}`);
  };

  push('TI', study.title);
  for (const author of splitAuthors(study.authors)) push('AU', author);
  push('PY', study.year);
  push('JO', study.journal);
  push('DO', study.doi);
  push('AB', study.abstract);
  push('AN', study.externalId);
  lines.push('ER  - ');
  return lines.join('\r\n');
}

export function buildRisExport(bundle: ExportBundle): string {
  return bundle.studies.map(toRecord).join('\r\n') + '\r\n';
}
