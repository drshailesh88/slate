import type { ExportBundle, ExportDatasetId, ExportSection } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// CSV export (RFC 4180). Four datasets, each a SEPARATE file whose first column
// names the dataset — so consensus and as-extracted rows stay clearly labeled
// and distinct even if a user concatenates the files (non-neg #8).
//
// The four explicit states survive as their own `state` column: a non-reported
// value exports an EMPTY value cell + its state — a blank is never a zero.
// Provenance (report/page/locator) and the derived flag + formula travel as
// columns on every data row.
// ─────────────────────────────────────────────────────────────────────────────

function csvEscape(cell: string): string {
  return /[",\r\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell;
}

export function toCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map(csvEscape).join(',')).join('\r\n') + '\r\n';
}

/**
 * The exact inverse of `toCsv` (RFC 4180): quoted fields, doubled quotes,
 * embedded delimiters/newlines. Round-trip tests parse exports back through
 * this so escaping bugs cannot ship silently.
 */
export function parseCsvTable(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let i = 0;

  const endCell = () => {
    row.push(cell);
    cell = '';
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 2;
      } else if (ch === '"') {
        quoted = false;
        i += 1;
      } else {
        cell += ch;
        i += 1;
      }
      continue;
    }
    if (ch === '"' && cell === '') {
      quoted = true;
      i += 1;
    } else if (ch === ',') {
      endCell();
      i += 1;
    } else if (ch === '\r' && text[i + 1] === '\n') {
      endRow();
      i += 2;
    } else if (ch === '\n' || ch === '\r') {
      endRow();
      i += 1;
    } else {
      cell += ch;
      i += 1;
    }
  }
  if (cell !== '' || row.length > 0) endRow();
  return rows;
}

const str = (value: string | number | boolean | null | undefined): string =>
  value == null ? '' : String(value);

export const CSV_DATASETS = [
  'references',
  'consensus',
  'as_extracted',
  'rob',
  'screening',
] as const satisfies readonly ExportDatasetId[];

export type CsvDatasetId = (typeof CSV_DATASETS)[number];

export function isCsvDataset(value: string): value is CsvDatasetId {
  return (CSV_DATASETS as readonly string[]).includes(value);
}

export type CsvResult =
  | { status: 'ready'; filename: string; content: string }
  | { status: 'withheld'; reason: string };

function ready(filename: string, rows: (readonly string[])[]): CsvResult {
  return { status: 'ready', filename, content: toCsv(rows) };
}

function buildReferencesCsv(bundle: ExportBundle): CsvResult {
  const rows: (readonly string[])[] = [
    ['dataset', 'ref_id', 'title', 'authors', 'journal', 'year', 'doi'],
  ];
  for (const s of bundle.studies) {
    rows.push([
      'references',
      s.refId,
      s.title,
      str(s.authors),
      str(s.journal),
      str(s.year),
      str(s.doi),
    ]);
  }
  return ready('sr-references.csv', rows);
}

function buildConsensusCsv(bundle: ExportBundle): CsvResult {
  const rows: (readonly string[])[] = [
    [
      'dataset',
      'study',
      'field',
      'value',
      'state',
      'derived',
      'derived_formula',
      'source',
      'resolution_method',
      'author_contacted',
      'author_contact_note',
      'resolved_by',
      'provenance_report',
      'provenance_page',
      'provenance_locator',
    ],
  ];
  for (const r of bundle.consensus) {
    rows.push([
      'consensus',
      r.studyTitle,
      r.fieldLabel,
      // The four states are explicit; a non-reported value stays EMPTY (never 0).
      r.state === 'reported' ? str(r.value) : '',
      r.state,
      String(r.derived),
      str(r.derivedFormula),
      r.source,
      r.resolutionMethod,
      String(r.authorContacted),
      str(r.authorContactNote),
      r.resolvedByLabel,
      str(r.provenance?.reportId),
      str(r.provenance?.page),
      str(r.provenance?.locator),
    ]);
  }
  return ready('sr-consensus.csv', rows);
}

function guard<T>(
  section: ExportSection<T>,
  build: (rows: T[]) => CsvResult,
): CsvResult {
  return section.status === 'withheld'
    ? { status: 'withheld', reason: section.reason }
    : build(section.rows);
}

function buildAsExtractedCsv(bundle: ExportBundle): CsvResult {
  return guard(bundle.asExtracted, (entries) => {
    const rows: (readonly string[])[] = [
      [
        'dataset',
        'study',
        'field',
        'reviewer',
        'is_ai',
        'value',
        'state',
        'derived',
        'derived_formula',
        'provenance_report',
        'provenance_page',
        'provenance_locator',
      ],
    ];
    for (const r of entries) {
      rows.push([
        'as_extracted',
        r.studyTitle,
        r.fieldLabel,
        r.reviewerLabel,
        String(r.isAi),
        r.state === 'reported' ? str(r.value) : '',
        r.state,
        String(r.derived),
        str(r.derivedFormula),
        str(r.provenance?.reportId),
        str(r.provenance?.page),
        str(r.provenance?.locator),
      ]);
    }
    return ready('sr-as-extracted.csv', rows);
  });
}

function buildRobCsv(bundle: ExportBundle): CsvResult {
  return guard(bundle.rob, (assessments) => {
    const rows: (readonly string[])[] = [
      [
        'dataset',
        'study',
        'reviewer',
        'is_ai',
        'domain',
        'judgement',
        'support_quote',
      ],
    ];
    for (const r of assessments) {
      rows.push([
        'risk_of_bias',
        r.studyTitle,
        r.reviewerLabel,
        String(r.isAi),
        r.domainId,
        r.judgement,
        str(r.supportQuote),
      ]);
    }
    return ready('sr-risk-of-bias.csv', rows);
  });
}

function buildScreeningCsv(bundle: ExportBundle): CsvResult {
  return guard(bundle.screening, (decisions) => {
    const rows: (readonly string[])[] = [
      [
        'dataset',
        'study',
        'reviewer',
        'is_ai',
        'stage',
        'decision',
        'exclude_reason_code',
        'exclude_reason_detail',
      ],
    ];
    for (const r of decisions) {
      rows.push([
        'screening',
        r.studyTitle,
        r.reviewerLabel,
        String(r.isAi),
        r.stage,
        r.decision,
        str(r.excludeReasonCode),
        str(r.excludeReasonDetail),
      ]);
    }
    return ready('sr-screening.csv', rows);
  });
}

export function buildCsvExport(
  bundle: ExportBundle,
  dataset: CsvDatasetId,
): CsvResult {
  switch (dataset) {
    case 'references':
      return buildReferencesCsv(bundle);
    case 'consensus':
      return buildConsensusCsv(bundle);
    case 'as_extracted':
      return buildAsExtractedCsv(bundle);
    case 'rob':
      return buildRobCsv(bundle);
    case 'screening':
      return buildScreeningCsv(bundle);
  }
}
