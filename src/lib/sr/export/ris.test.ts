// RIS export (T19) — the references round-trip through the project's OWN
// importer (src/lib/sr/import-parse.ts::parseRis), so what Slate exports,
// Slate (and EndNote/Zotero/Covidence) can re-import.
import { describe, expect, it } from 'vitest';

import { parseRis } from '@/lib/sr/import-parse';
import { buildRisExport } from './ris';
import type { ExportBundle, ExportStudyRef } from './types';

const STUDIES: ExportStudyRef[] = [
  {
    id: 'st1',
    refId: 'PMID:111',
    title: 'Alpha trial of statins in sepsis',
    abstract: 'A multicentre randomised trial.',
    authors: 'Smith J; Lee K',
    journal: 'Lancet',
    year: 2021,
    doi: '10.1000/alpha',
    externalId: 'PMID:111',
  },
  {
    id: 'st2',
    refId: '#2',
    title: 'Beta cohort\nwith a wrapped title',
    abstract: null,
    authors: null,
    journal: null,
    year: null,
    doi: null,
    externalId: null,
  },
];

function makeBundle(): ExportBundle {
  return {
    review: {
      id: 'review-1',
      title: 'Statins in sepsis',
      reviewType: 'intervention',
      screeningPhase: 'independent',
      extractionPhase: 'independent',
      robPhase: 'independent',
    },
    generatedAt: '2026-07-07T12:00:00.000Z',
    studies: STUDIES,
    consensus: [],
    asExtracted: { status: 'withheld', reason: 'blinded' },
    rob: { status: 'withheld', reason: 'blinded' },
    screening: { status: 'withheld', reason: 'blinded' },
  };
}

describe('buildRisExport — round-trips through parseRis', () => {
  it('every study becomes one record; fields survive the round-trip', () => {
    const ris = buildRisExport(makeBundle());
    const { references, skipped } = parseRis(ris);

    expect(skipped).toBe(0);
    expect(references).toHaveLength(2);

    const alpha = references[0];
    expect(alpha.title).toBe('Alpha trial of statins in sepsis');
    expect(alpha.authors).toEqual(['Smith J', 'Lee K']);
    expect(alpha.journal).toBe('Lancet');
    expect(alpha.year).toBe(2021);
    expect(alpha.doi).toBe('10.1000/alpha');
    expect(alpha.abstract).toBe('A multicentre randomised trial.');
    expect(alpha.externalId).toBe('PMID:111');
  });

  it('sanitizes embedded newlines so a record never corrupts the next', () => {
    const ris = buildRisExport(makeBundle());
    const { references } = parseRis(ris);
    expect(references[1].title).toBe('Beta cohort with a wrapped title');
  });

  it('emits standard tags (TY/TI/AU/PY/JO/DO/ER)', () => {
    const ris = buildRisExport(makeBundle());
    expect(ris).toContain('TY  - JOUR');
    expect(ris).toContain('TI  - Alpha trial of statins in sepsis');
    expect(ris).toContain('AU  - Smith J');
    expect(ris).toContain('AU  - Lee K');
    expect(ris).toContain('PY  - 2021');
    expect(ris).toContain('JO  - Lancet');
    expect(ris).toContain('DO  - 10.1000/alpha');
    expect(ris.trimEnd().endsWith('ER  -')).toBe(true);
  });
});
