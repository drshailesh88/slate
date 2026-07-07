import type { ExtractionSectionId } from '@/lib/sr/extraction/fields';
import { fieldDef } from '@/lib/sr/extraction/fields';
import type { ConsensusExportRow, ExportBundle } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// RevMan-compatible export (Cochrane RevMan 5 review structure): the included
// study references plus per-study characteristics tables. The characteristics
// carry ONLY the reconciled CONSENSUS dataset — RevMan is the analysis handoff,
// and the as-extracted originals are a separate, labeled artifact (CSV) that
// this file explicitly points to, never silently absorbs.
//
// The four states render as explicit words ("Not reported" / "Not applicable"
// / "Unclear") — a silent field is never a zero. Derived values carry their
// formula; provenance (report/page/locator) travels with every reported value.
// Statistical synthesis happens in RevMan/R — Slate exports, it does not
// invent a stats engine.
// ─────────────────────────────────────────────────────────────────────────────

function xmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

const STATE_TEXT: Record<string, string> = {
  not_reported: 'Not reported',
  na: 'Not applicable',
  unclear: 'Unclear',
};

export function renderConsensusValue(row: ConsensusExportRow): string {
  if (row.state !== 'reported') {
    return STATE_TEXT[row.state] ?? 'Unclear';
  }
  const parts: string[] = [row.value ?? ''];
  if (row.derived && row.derivedFormula) {
    parts.push(`[derived: ${row.derivedFormula}]`);
  } else if (row.derived) {
    parts.push('[derived]');
  }
  const where = [
    row.provenance?.reportId,
    row.provenance?.page ? `p. ${row.provenance.page}` : null,
    row.provenance?.locator,
  ]
    .filter(Boolean)
    .join(', ');
  if (where) parts.push(`(source: ${where})`);
  return parts.filter(Boolean).join(' ');
}

function studyName(
  authors: string | null,
  year: number | null,
  title: string,
): string {
  const firstAuthor = authors?.split(/[;,]|\band\b/)[0]?.trim();
  const name = firstAuthor || title;
  return year ? `${name} ${year}` : name;
}

// RevMan characteristics slots for our extraction-form sections.
const CHAR_ELEMENT: Record<ExtractionSectionId, string> = {
  general: 'CHAR_METHODS',
  characteristics: 'CHAR_PARTICIPANTS',
  outcomes: 'CHAR_OUTCOMES',
};

function charElementFor(fieldId: string): string {
  const section = fieldDef(fieldId)?.section;
  return section ? CHAR_ELEMENT[section] : 'CHAR_NOTES';
}

function referenceXml(bundle: ExportBundle): string {
  return bundle.studies
    .map((study, index) => {
      const id = `STD-${index + 1}`;
      const name = xmlEscape(studyName(study.authors, study.year, study.title));
      const fields = [
        `        <TI>${xmlEscape(study.title)}</TI>`,
        study.authors ? `        <AU>${xmlEscape(study.authors)}</AU>` : null,
        study.journal ? `        <SO>${xmlEscape(study.journal)}</SO>` : null,
        study.year != null ? `        <YR>${study.year}</YR>` : null,
        study.doi
          ? `        <IDENTIFIERS><IDENTIFIER TYPE="DOI" VALUE="${xmlEscape(study.doi)}" /></IDENTIFIERS>`
          : null,
      ].filter(Boolean);
      return [
        `    <STUDY ID="${id}" NAME="${name}" DATA_SOURCE="PUBLISHED">`,
        `      <REFERENCE TYPE="JOURNAL_ARTICLE" PRIMARY="YES">`,
        ...fields,
        `      </REFERENCE>`,
        `    </STUDY>`,
      ].join('\n');
    })
    .join('\n');
}

function characteristicsXml(bundle: ExportBundle): string {
  const byStudy = new Map<string, ConsensusExportRow[]>();
  for (const row of bundle.consensus) {
    byStudy.set(row.studyId, [...(byStudy.get(row.studyId) ?? []), row]);
  }

  return bundle.studies
    .filter((study) => byStudy.has(study.id))
    .map((study) => {
      const studyIndex = bundle.studies.findIndex((s) => s.id === study.id);
      const rows = byStudy.get(study.id) ?? [];
      const byElement = new Map<string, ConsensusExportRow[]>();
      for (const row of rows) {
        const el = charElementFor(row.fieldId);
        byElement.set(el, [...(byElement.get(el) ?? []), row]);
      }
      const sections = [...byElement.entries()]
        .map(([element, elementRows]) => {
          const paragraphs = elementRows
            .map(
              (row) =>
                `        <P>${xmlEscape(`${row.fieldLabel}: ${renderConsensusValue(row)}`)}</P>`,
            )
            .join('\n');
          return `      <${element}>\n${paragraphs}\n      </${element}>`;
        })
        .join('\n');
      return [
        `    <INCLUDED_CHAR STUDY_ID="STD-${studyIndex + 1}">`,
        sections,
        `    </INCLUDED_CHAR>`,
      ].join('\n');
    })
    .join('\n');
}

export function buildRevmanExport(bundle: ExportBundle): string {
  const title = xmlEscape(bundle.review.title);
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<COCHRANE_REVIEW TYPE="INTERVENTION" REVMAN_VERSION="5" MODIFIED="${xmlEscape(bundle.generatedAt)}">`,
    `  <COVER_SHEET>`,
    `    <TITLE>${title}</TITLE>`,
    `  </COVER_SHEET>`,
    `  <MAIN_TEXT>`,
    `    <SUMMARY>`,
    `      <P>Characteristics tables below carry the reconciled CONSENSUS dataset only. Each reviewer's original as-extracted entries are preserved separately (export the as-extracted CSV) and are never replaced by the consensus.</P>`,
    `    </SUMMARY>`,
    `  </MAIN_TEXT>`,
    `  <STUDIES_AND_REFERENCES>`,
    `  <STUDIES>`,
    `  <INCLUDED_STUDIES>`,
    referenceXml(bundle),
    `  </INCLUDED_STUDIES>`,
    `  </STUDIES>`,
    `  </STUDIES_AND_REFERENCES>`,
    `  <CHARACTERISTICS_OF_STUDIES>`,
    `  <CHARACTERISTICS_OF_INCLUDED_STUDIES>`,
    characteristicsXml(bundle),
    `  </CHARACTERISTICS_OF_INCLUDED_STUDIES>`,
    `  </CHARACTERISTICS_OF_STUDIES>`,
    `</COCHRANE_REVIEW>`,
  ]
    .filter((line) => line !== '')
    .join('\n');
}
