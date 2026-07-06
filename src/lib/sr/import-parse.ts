// ─────────────────────────────────────────────────────────────────────────────
// Reference parsers (T9): RIS · CSV · PubMed (PMID list) → ParsedReference[].
//
// Pure and offline — no network (metadata enrichment from PubMed is a later
// concern; a PMID list imports the identifiers). Every parser reports a
// `skipped` count for malformed records instead of silently dropping them.
// ─────────────────────────────────────────────────────────────────────────────

export type ImportFormat = 'ris' | 'csv' | 'pubmed';

export interface ParsedReference {
  title: string;
  authors: string[];
  journal?: string;
  year?: number;
  doi?: string;
  abstract?: string;
  externalId?: string;
}

export interface ParseResult {
  references: ParsedReference[];
  /** Records recognised but unusable (e.g. no title) — surfaced, never hidden. */
  skipped: number;
}

const IMPORT_FORMATS: readonly ImportFormat[] = ['ris', 'csv', 'pubmed'];

export function isImportFormat(value: unknown): value is ImportFormat {
  return (
    typeof value === 'string' && IMPORT_FORMATS.includes(value as ImportFormat)
  );
}

export function parseReferences(
  format: ImportFormat,
  text: string,
): ParseResult {
  switch (format) {
    case 'ris':
      return parseRis(text);
    case 'csv':
      return parseCsv(text);
    case 'pubmed':
      return parsePubmedIds(text);
  }
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function firstYear(value: string): number | undefined {
  const match = value.match(/\d{4}/);
  if (!match) return undefined;
  const year = Number(match[0]);
  return year >= 1000 && year <= 9999 ? year : undefined;
}

function toReference(raw: {
  title?: string;
  authors: string[];
  journal?: string;
  year?: number;
  doi?: string;
  abstract?: string;
  externalId?: string;
}): ParsedReference | null {
  const title = raw.title?.trim();
  if (!title) return null;
  return {
    title,
    authors: raw.authors.map((a) => a.trim()).filter(Boolean),
    journal: raw.journal?.trim() || undefined,
    year: raw.year,
    doi: raw.doi?.trim() || undefined,
    abstract: raw.abstract?.trim() || undefined,
    externalId: raw.externalId?.trim() || undefined,
  };
}

// ── RIS ──────────────────────────────────────────────────────────────────────

const RIS_LINE = /^([A-Z][A-Z0-9])\s{2}-\s?(.*)$/;

interface RisAccumulator {
  title?: string;
  authors: string[];
  journal?: string;
  year?: number;
  doi?: string;
  abstract?: string;
  externalId?: string;
  seen: boolean;
}

function emptyRis(): RisAccumulator {
  return { authors: [], seen: false };
}

export function parseRis(text: string): ParseResult {
  const lines = stripBom(text).split(/\r\n|\r|\n/);
  const references: ParsedReference[] = [];
  let skipped = 0;
  let acc = emptyRis();

  const flush = () => {
    if (!acc.seen) return;
    const ref = toReference(acc);
    if (ref) references.push(ref);
    else skipped += 1;
    acc = emptyRis();
  };

  for (const line of lines) {
    const match = line.match(RIS_LINE);
    if (!match) continue;
    const tag = match[1];
    const value = match[2].trim();

    if (tag === 'TY') {
      flush();
      acc.seen = true;
      continue;
    }
    if (tag === 'ER') {
      flush();
      continue;
    }
    acc.seen = true;

    switch (tag) {
      case 'TI':
      case 'T1':
        acc.title = acc.title ? `${acc.title} ${value}` : value;
        break;
      case 'AU':
      case 'A1':
        if (value) acc.authors.push(value);
        break;
      case 'PY':
      case 'Y1':
        acc.year = firstYear(value);
        break;
      case 'JO':
      case 'JF':
      case 'JA':
      case 'T2':
        acc.journal = acc.journal ?? value;
        break;
      case 'DO':
        acc.doi = value;
        break;
      case 'AB':
      case 'N2':
        acc.abstract = acc.abstract ? `${acc.abstract} ${value}` : value;
        break;
      case 'AN':
      case 'ID':
        acc.externalId = acc.externalId ?? value;
        break;
    }
  }
  flush();

  return { references, skipped };
}

// ── CSV ──────────────────────────────────────────────────────────────────────

// RFC4180-ish row splitter: honours quoted fields, escaped quotes (""), and
// commas / newlines inside quotes.
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = stripBom(text);

  for (let i = 0; i < src.length; i += 1) {
    const char = src[i];

    if (inQuotes) {
      if (char === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  // Flush the trailing field/row unless the input ended on a clean newline.
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

const CSV_HEADERS: Record<
  keyof Omit<ParsedReference, 'authors'> | 'authors',
  string[]
> = {
  title: ['title', 'article title', 'primary title'],
  authors: ['authors', 'author', 'author names', 'author full names'],
  journal: [
    'journal',
    'source',
    'source title',
    'publication',
    'publication title',
  ],
  year: ['year', 'publication year', 'py', 'pub year'],
  doi: ['doi'],
  abstract: ['abstract', 'abstract note'],
  externalId: ['pmid', 'pubmed id', 'external id', 'id', 'accession number'],
};

function resolveColumns(
  header: string[],
): Partial<Record<keyof ParsedReference, number>> {
  const normalized = header.map((h) => h.trim().toLowerCase());
  const map: Partial<Record<keyof ParsedReference, number>> = {};
  for (const [field, aliases] of Object.entries(CSV_HEADERS)) {
    const index = normalized.findIndex((h) => aliases.includes(h));
    if (index >= 0) map[field as keyof ParsedReference] = index;
  }
  return map;
}

function splitAuthors(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.includes(';')) return trimmed.split(';');
  if (/\sand\s/i.test(trimmed)) return trimmed.split(/\sand\s/i);
  return [trimmed];
}

export function parseCsv(text: string): ParseResult {
  const rows = parseCsvRows(text);
  if (rows.length < 2) return { references: [], skipped: 0 };

  const columns = resolveColumns(rows[0]);
  const references: ParsedReference[] = [];
  let skipped = 0;

  const cell = (row: string[], field: keyof ParsedReference): string => {
    const index = columns[field];
    return index === undefined ? '' : (row[index] ?? '').trim();
  };

  for (const row of rows.slice(1)) {
    const yearCell = cell(row, 'year');
    const ref = toReference({
      title: cell(row, 'title'),
      authors: splitAuthors(cell(row, 'authors')),
      journal: cell(row, 'journal'),
      year: yearCell ? firstYear(yearCell) : undefined,
      doi: cell(row, 'doi'),
      abstract: cell(row, 'abstract'),
      externalId: cell(row, 'externalId'),
    });
    if (ref) references.push(ref);
    else skipped += 1;
  }

  return { references, skipped };
}

// ── PubMed PMID list ─────────────────────────────────────────────────────────

// Accepts PMIDs one-per-line or separated by commas/spaces, with an optional
// "PMID:" prefix. Each id becomes an identifier-only reference (offline import).
export function parsePubmedIds(text: string): ParseResult {
  const ids = stripBom(text)
    .split(/[\s,;]+/)
    .map((token) => token.replace(/^pmid:?/i, '').trim())
    .filter((token) => /^\d{1,9}$/.test(token));

  const references: ParsedReference[] = ids.map((pmid) => ({
    title: `PMID ${pmid}`,
    authors: [],
    externalId: pmid,
  }));

  return { references, skipped: 0 };
}
