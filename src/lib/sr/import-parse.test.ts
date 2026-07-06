import { describe, expect, it } from 'vitest';
import {
  isImportFormat,
  parseCsv,
  parseCsvRows,
  parsePubmedIds,
  parseReferences,
  parseRis,
} from './import-parse';

describe('parseRis', () => {
  const ris = [
    'TY  - JOUR',
    'TI  - Dapagliflozin in Patients with Heart Failure',
    'AU  - McMurray, John',
    'AU  - Solomon, Scott',
    'PY  - 2019/09/19',
    'JO  - New England Journal of Medicine',
    'DO  - 10.1056/NEJMoa1911303',
    'AN  - 31535829',
    'AB  - Background text.',
    'ER  - ',
    '',
    'TY  - JOUR',
    'T1  - Empagliflozin Outcomes',
    'A1  - Zannad, Faiez',
    'Y1  - 2020',
    'T2  - The Lancet',
    'ER  - ',
  ].join('\n');

  it('parses each record with authors, year, journal, doi, and id', () => {
    const { references, skipped } = parseRis(ris);
    expect(skipped).toBe(0);
    expect(references).toHaveLength(2);
    expect(references[0]).toEqual({
      title: 'Dapagliflozin in Patients with Heart Failure',
      authors: ['McMurray, John', 'Solomon, Scott'],
      journal: 'New England Journal of Medicine',
      year: 2019,
      doi: '10.1056/NEJMoa1911303',
      abstract: 'Background text.',
      externalId: '31535829',
    });
    expect(references[1].title).toBe('Empagliflozin Outcomes');
    expect(references[1].year).toBe(2020);
    expect(references[1].journal).toBe('The Lancet');
  });

  it('reports a record with no title as skipped, not dropped', () => {
    const { references, skipped } = parseRis(
      'TY  - JOUR\nAU  - Nobody N\nER  -',
    );
    expect(references).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  it('returns nothing for empty input', () => {
    expect(parseRis('')).toEqual({ references: [], skipped: 0 });
  });
});

describe('parseCsvRows', () => {
  it('honours quoted fields with embedded commas, quotes, and newlines', () => {
    const rows = parseCsvRows('a,"b,c","d""e"\n"line\nbreak",f,g\n');
    expect(rows[0]).toEqual(['a', 'b,c', 'd"e']);
    expect(rows[1]).toEqual(['line\nbreak', 'f', 'g']);
  });
});

describe('parseCsv', () => {
  const csv = [
    'Title,Authors,Year,DOI,Journal,PMID',
    '"SGLT2 inhibitors, an overview","Smith, A; Jones, B",2021,10.1/xyz,Circulation,123456',
    'Second study,Lone Author,2018,,BMJ,',
  ].join('\n');

  it('maps header aliases and splits authors on semicolons', () => {
    const { references, skipped } = parseCsv(csv);
    expect(skipped).toBe(0);
    expect(references[0]).toEqual({
      title: 'SGLT2 inhibitors, an overview',
      authors: ['Smith, A', 'Jones, B'],
      year: 2021,
      doi: '10.1/xyz',
      journal: 'Circulation',
      externalId: '123456',
    });
    expect(references[1].authors).toEqual(['Lone Author']);
    expect(references[1].doi).toBeUndefined();
  });

  it('skips rows with no title', () => {
    const { references, skipped } = parseCsv('Title,Year\n,2020\nReal,2021');
    expect(references).toHaveLength(1);
    expect(skipped).toBe(1);
  });
});

describe('parsePubmedIds', () => {
  it('extracts PMIDs from mixed separators and prefixes', () => {
    const { references } = parsePubmedIds(
      'PMID: 31535829\n32865377, 12345\nnot-an-id',
    );
    expect(references.map((r) => r.externalId)).toEqual([
      '31535829',
      '32865377',
      '12345',
    ]);
    expect(references[0].title).toBe('PMID 31535829');
  });

  it('returns nothing for input with no ids', () => {
    expect(parsePubmedIds('just some words')).toEqual({
      references: [],
      skipped: 0,
    });
  });
});

describe('parseReferences dispatch', () => {
  it('routes by format', () => {
    expect(parseReferences('pubmed', '111').references[0].externalId).toBe(
      '111',
    );
    expect(isImportFormat('ris')).toBe(true);
    expect(isImportFormat('bibtex')).toBe(false);
  });
});
