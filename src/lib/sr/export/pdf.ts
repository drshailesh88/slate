import { renderConsensusValue } from './revman';
import type { AsExtractedExportRow, ExportBundle } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// PDF export — a self-contained PDF 1.4 writer (Helvetica text, uncompressed
// streams; no library). The document is the human-readable record of the
// export: references, then the CONSENSUS dataset and the AS-EXTRACTED dataset
// as two separately-headed sections (the consensus never absorbs the
// originals), then RoB and screening. A withheld blinded section prints its
// honest reason — never a silently missing table. States render as words
// ("Not reported" — never a zero); derived values carry their formula;
// provenance travels with every reported value.
//
// The builder returns a BINARY STRING (every char ≤ 0xFF): byte offsets in the
// xref table equal string offsets. Serialize with Buffer.from(pdf, 'latin1').
// ─────────────────────────────────────────────────────────────────────────────

interface PdfLine {
  text: string;
  bold: boolean;
  size: number;
  /** Extra leading before the line (pt). */
  spaceBefore?: number;
}

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 72;
const LEADING = 14;
const BODY_SIZE = 9.5;
const WRAP_COLUMN = 100;

// Keep to Latin-1 so string offsets are byte offsets and Helvetica (WinAnsi)
// renders every glyph. Anything wider becomes '?'.
function toLatin1(text: string): string {
  let out = '';
  for (const ch of text) {
    out += ch.codePointAt(0)! <= 0xff ? ch : '?';
  }
  return out;
}

function pdfEscape(text: string): string {
  return toLatin1(text)
    .replaceAll('\\', '\\\\')
    .replaceAll('(', '\\(')
    .replaceAll(')', '\\)');
}

function wrap(text: string, indent: string): string[] {
  if (text.length <= WRAP_COLUMN) return [text];
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current === '' ? word : `${current} ${word}`;
    if (candidate.length > WRAP_COLUMN && current !== '') {
      lines.push(current);
      current = `${indent}${word}`;
    } else {
      current = candidate;
    }
  }
  if (current !== '') lines.push(current);
  return lines;
}

function line(
  text: string,
  opts: Partial<Omit<PdfLine, 'text'>> = {},
): PdfLine[] {
  const indent = text.startsWith('  ') ? '    ' : '  ';
  return wrap(text, indent).map((wrapped, i) => ({
    text: wrapped,
    bold: opts.bold ?? false,
    size: opts.size ?? BODY_SIZE,
    spaceBefore: i === 0 ? opts.spaceBefore : undefined,
  }));
}

function paginate(lines: readonly PdfLine[]): PdfLine[][] {
  const usable = PAGE_HEIGHT - 2 * MARGIN;
  const pages: PdfLine[][] = [];
  let page: PdfLine[] = [];
  let used = 0;
  for (const l of lines) {
    const height = LEADING + (l.spaceBefore ?? 0);
    if (used + height > usable && page.length > 0) {
      pages.push(page);
      page = [];
      used = 0;
    }
    page.push(l);
    used += height;
  }
  if (page.length > 0) pages.push(page);
  return pages.length > 0 ? pages : [[]];
}

function pageStream(lines: readonly PdfLine[]): string {
  let y = PAGE_HEIGHT - MARGIN;
  const ops: string[] = ['BT'];
  for (const l of lines) {
    y -= LEADING + (l.spaceBefore ?? 0);
    const font = l.bold ? 'F2' : 'F1';
    ops.push(`/${font} ${l.size} Tf`);
    ops.push(`1 0 0 1 ${MARGIN} ${y} Tm`);
    ops.push(`(${pdfEscape(l.text)}) Tj`);
  }
  ops.push('ET');
  return ops.join('\n');
}

// Assemble objects + xref. Object layout: 1 catalog · 2 pages · 3 F1 · 4 F2 ·
// then per page: page object + content stream.
function serializePdf(pages: readonly PdfLine[][]): string {
  const objects: string[] = [];
  const pageObjectIds = pages.map((_, i) => 5 + i * 2);

  objects.push(`<< /Type /Catalog /Pages 2 0 R >>`);
  objects.push(
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`,
  );
  objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`);
  objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`);

  for (const [i, page] of pages.entries()) {
    const contentId = pageObjectIds[i] + 1;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    const stream = pageStream(page);
    objects.push(
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    );
  }

  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const [i, content] of objects.entries()) {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${content}\nendobj\n`;
  }

  const xrefOffset = body.length;
  const pad = (n: number) => String(n).padStart(10, '0');
  body += `xref\n0 ${objects.length + 1}\n`;
  body += `0000000000 65535 f \n`;
  for (const offset of offsets) body += `${pad(offset)} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  body += `startxref\n${xrefOffset}\n%%EOF\n`;
  return body;
}

function describeEntry(row: AsExtractedExportRow): string {
  if (row.state !== 'reported') {
    const stateText: Record<string, string> = {
      not_reported: 'Not reported',
      na: 'Not applicable',
      unclear: 'Unclear',
    };
    return stateText[row.state] ?? 'Unclear';
  }
  const parts = [row.value ?? ''];
  if (row.derived)
    parts.push(
      `[derived${row.derivedFormula ? `: ${row.derivedFormula}` : ''}]`,
    );
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

function buildLines(bundle: ExportBundle): PdfLine[] {
  const lines: PdfLine[] = [];
  const add = (text: string, opts?: Partial<Omit<PdfLine, 'text'>>) =>
    lines.push(...line(text, opts));

  add('Slate - Systematic review export', { bold: true, size: 15 });
  add(bundle.review.title, { bold: true, size: 11, spaceBefore: 4 });
  add(
    `Review type: ${bundle.review.reviewType} - Generated: ${bundle.generatedAt}`,
  );
  add(
    `The consensus dataset and the as-extracted originals are exported separately - the consensus never replaces either reviewer's original entries.`,
    { spaceBefore: 4 },
  );

  add(`References (${bundle.studies.length})`, {
    bold: true,
    size: 11,
    spaceBefore: 12,
  });
  for (const s of bundle.studies) {
    const meta = [s.authors, s.journal, s.year ? String(s.year) : null, s.doi]
      .filter(Boolean)
      .join(' - ');
    add(`  ${s.refId}  ${s.title}${meta ? ` (${meta})` : ''}`);
  }

  add(`Consensus dataset - reconciled values (${bundle.consensus.length})`, {
    bold: true,
    size: 11,
    spaceBefore: 12,
  });
  if (bundle.consensus.length === 0) {
    add('  No consensus values recorded yet.');
  }
  for (const row of bundle.consensus) {
    add(
      `  ${row.studyTitle} - ${row.fieldLabel}: ${renderConsensusValue(row)}`,
    );
  }

  add(
    `As-extracted dataset - each reviewer's original entries (kept separate from consensus)`,
    {
      bold: true,
      size: 11,
      spaceBefore: 12,
    },
  );
  if (bundle.asExtracted.status === 'withheld') {
    add(`  Withheld: ${bundle.asExtracted.reason}`);
  } else {
    for (const row of bundle.asExtracted.rows) {
      add(
        `  ${row.studyTitle} - ${row.fieldLabel} - ${row.reviewerLabel}${row.isAi ? ' (AI)' : ''}: ${describeEntry(row)}`,
      );
    }
  }

  add('Risk of bias', { bold: true, size: 11, spaceBefore: 12 });
  if (bundle.rob.status === 'withheld') {
    add(`  Withheld: ${bundle.rob.reason}`);
  } else {
    for (const row of bundle.rob.rows) {
      add(
        `  ${row.studyTitle} - ${row.domainId} - ${row.reviewerLabel}${row.isAi ? ' (AI)' : ''}: ${row.judgement}${row.supportQuote ? ` ("${row.supportQuote}")` : ''}`,
      );
    }
  }

  add('Screening decisions', { bold: true, size: 11, spaceBefore: 12 });
  if (bundle.screening.status === 'withheld') {
    add(`  Withheld: ${bundle.screening.reason}`);
  } else {
    for (const row of bundle.screening.rows) {
      add(
        `  ${row.studyTitle} - ${row.stage} - ${row.reviewerLabel}${row.isAi ? ' (AI)' : ''}: ${row.decision}${row.excludeReasonCode ? ` (${row.excludeReasonCode})` : ''}`,
      );
    }
  }

  return lines;
}

export function buildPdfExport(bundle: ExportBundle): string {
  return serializePdf(paginate(buildLines(bundle)));
}

/**
 * Test helper — the inverse of the text layer: pulls every shown string back
 * out of the (uncompressed) content streams so round-trip tests can assert the
 * document really carries the data.
 */
export function extractPdfText(pdf: string): string {
  const texts: string[] = [];
  const re = /\(((?:[^()\\]|\\.)*)\) Tj/g;
  for (const match of pdf.matchAll(re)) {
    texts.push(match[1].replace(/\\(.)/g, '$1'));
  }
  return texts.join('\n');
}
