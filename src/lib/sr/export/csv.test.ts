// CSV export (T19) — every dataset stays labeled + separate, escaping
// round-trips through the module's own RFC 4180 inverse, and the four states
// survive: a not-reported value is an EMPTY cell + its state, never a zero.
import { describe, expect, it } from 'vitest';

import { buildCsvExport, isCsvDataset, parseCsvTable, toCsv } from './csv';
import type { ExportBundle } from './types';

function makeBundle(overrides: Partial<ExportBundle> = {}): ExportBundle {
  return {
    review: {
      id: 'review-1',
      title: 'Statins in sepsis',
      reviewType: 'intervention',
      screeningPhase: 'reconcile',
      extractionPhase: 'reconcile',
      robPhase: 'reconcile',
    },
    generatedAt: '2026-07-07T12:00:00.000Z',
    studies: [
      {
        id: 'st1',
        refId: 'PMID:111',
        title: 'Alpha trial, with "quotes", commas\nand a newline',
        abstract: null,
        authors: 'Smith J; Lee K',
        journal: 'Lancet',
        year: 2021,
        doi: '10.1000/alpha',
        externalId: 'PMID:111',
      },
    ],
    consensus: [
      {
        studyId: 'st1',
        studyTitle: 'Alpha trial, with "quotes", commas\nand a newline',
        fieldId: 'sample_size',
        fieldLabel: 'Total sample size',
        value: '120',
        state: 'reported',
        derived: false,
        derivedFormula: null,
        provenance: { reportId: 'rep1', page: '4', locator: 'Table 2' },
        source: 'reviewer1',
        resolutionMethod: 'discuss',
        authorContacted: false,
        authorContactNote: null,
        resolvedByLabel: 'Dr. Self',
      },
      {
        studyId: 'st1',
        studyTitle: 'Alpha trial, with "quotes", commas\nand a newline',
        fieldId: 'primary_outcome',
        fieldLabel: 'Primary outcome',
        value: null,
        state: 'not_reported',
        derived: false,
        derivedFormula: null,
        provenance: null,
        source: 'reviewer2',
        resolutionMethod: 'author_contact',
        authorContacted: true,
        authorContactNote: 'Emailed, no reply',
        resolvedByLabel: 'Dr. Self',
      },
      {
        studyId: 'st1',
        studyTitle: 'Alpha trial, with "quotes", commas\nand a newline',
        fieldId: 'sd_effect',
        fieldLabel: 'SD of effect',
        value: '4.2',
        state: 'reported',
        derived: true,
        derivedFormula: 'SD from 95% CI',
        provenance: { reportId: 'rep1', page: '7', locator: null },
        source: 'typed',
        resolutionMethod: 'arbitrator',
        authorContacted: false,
        authorContactNote: null,
        resolvedByLabel: 'Dr. Other',
      },
    ],
    asExtracted: {
      status: 'ready',
      rows: [
        {
          studyId: 'st1',
          studyTitle: 'Alpha trial, with "quotes", commas\nand a newline',
          fieldId: 'sample_size',
          fieldLabel: 'Total sample size',
          reviewerLabel: 'Dr. Self',
          isAi: false,
          value: '118',
          state: 'reported',
          derived: false,
          derivedFormula: null,
          provenance: { reportId: 'rep1', page: '4', locator: null },
        },
        {
          studyId: 'st1',
          studyTitle: 'Alpha trial, with "quotes", commas\nand a newline',
          fieldId: 'sample_size',
          fieldLabel: 'Total sample size',
          reviewerLabel: 'AI reviewer',
          isAi: true,
          value: '119',
          state: 'reported',
          derived: false,
          derivedFormula: null,
          provenance: null,
        },
        {
          studyId: 'st1',
          studyTitle: 'Alpha trial, with "quotes", commas\nand a newline',
          fieldId: 'mean_age',
          fieldLabel: 'Mean age',
          reviewerLabel: 'Dr. Other',
          isAi: false,
          value: null,
          state: 'na',
          derived: false,
          derivedFormula: null,
          provenance: null,
        },
      ],
    },
    rob: {
      status: 'ready',
      rows: [
        {
          studyId: 'st1',
          studyTitle: 'Alpha trial, with "quotes", commas\nand a newline',
          reviewerLabel: 'Dr. Self',
          isAi: false,
          domainId: 'randomisation',
          judgement: 'low',
          supportQuote: 'Central randomisation, "sealed" envelopes',
        },
      ],
    },
    screening: {
      status: 'ready',
      rows: [
        {
          studyId: 'st1',
          studyTitle: 'Alpha trial, with "quotes", commas\nand a newline',
          reviewerLabel: 'Dr. Other',
          isAi: false,
          stage: 'title_abstract',
          decision: 'exclude',
          excludeReasonCode: 'wrong_population',
          excludeReasonDetail: 'Paediatric only',
        },
      ],
    },
    ...overrides,
  };
}

describe('toCsv / parseCsvTable — the RFC 4180 round-trip', () => {
  it('round-trips quotes, commas, and embedded newlines exactly', () => {
    const table = [
      ['a', 'plain'],
      ['with "quotes"', 'with, comma'],
      ['multi\nline', 'trailing space '],
      ['', 'empty-first'],
    ];
    expect(parseCsvTable(toCsv(table))).toEqual(table);
  });
});

describe('the consensus dataset CSV', () => {
  it('is labeled `consensus` per row and round-trips its cells', () => {
    const result = buildCsvExport(makeBundle(), 'consensus');
    if (result.status !== 'ready') throw new Error('expected ready');
    const rows = parseCsvTable(result.content);
    const header = rows[0];
    expect(header[0]).toBe('dataset');
    for (const row of rows.slice(1)) expect(row[0]).toBe('consensus');

    const byField = new Map(
      rows.slice(1).map((r) => [r[header.indexOf('field')], r]),
    );
    const reported = byField.get('Total sample size')!;
    expect(reported[header.indexOf('value')]).toBe('120');
    expect(reported[header.indexOf('provenance_locator')]).toBe('Table 2');
  });

  it('a not-reported value exports an EMPTY cell + its state — never a 0', () => {
    const result = buildCsvExport(makeBundle(), 'consensus');
    if (result.status !== 'ready') throw new Error('expected ready');
    const rows = parseCsvTable(result.content);
    const header = rows[0];
    const row = rows
      .slice(1)
      .find((r) => r[header.indexOf('field')] === 'Primary outcome')!;
    expect(row[header.indexOf('value')]).toBe('');
    expect(row[header.indexOf('value')]).not.toBe('0');
    expect(row[header.indexOf('state')]).toBe('not_reported');
    expect(row[header.indexOf('author_contacted')]).toBe('true');
  });

  it('the derived flag + formula survive', () => {
    const result = buildCsvExport(makeBundle(), 'consensus');
    if (result.status !== 'ready') throw new Error('expected ready');
    const rows = parseCsvTable(result.content);
    const header = rows[0];
    const row = rows
      .slice(1)
      .find((r) => r[header.indexOf('field')] === 'SD of effect')!;
    expect(row[header.indexOf('derived')]).toBe('true');
    expect(row[header.indexOf('derived_formula')]).toBe('SD from 95% CI');
    expect(row[header.indexOf('resolution_method')]).toBe('arbitrator');
  });
});

describe('the as-extracted dataset CSV — separate and labeled', () => {
  it('is its own file, labeled `as_extracted`, with per-reviewer attribution', () => {
    const result = buildCsvExport(makeBundle(), 'as_extracted');
    if (result.status !== 'ready') throw new Error('expected ready');
    expect(result.filename).toBe('sr-as-extracted.csv');
    const rows = parseCsvTable(result.content);
    const header = rows[0];
    for (const row of rows.slice(1)) expect(row[0]).toBe('as_extracted');
    const reviewers = rows.slice(1).map((r) => r[header.indexOf('reviewer')]);
    expect(reviewers).toContain('Dr. Self');
    expect(reviewers).toContain('AI reviewer');
    // The original 118/119 never collapse into the consensus 120.
    const values = rows.slice(1).map((r) => r[header.indexOf('value')]);
    expect(values).toContain('118');
    expect(values).toContain('119');
    expect(values).not.toContain('120');
  });

  it('an `na` state exports empty + explicit, and is withheld pre-unblind', () => {
    const ready = buildCsvExport(makeBundle(), 'as_extracted');
    if (ready.status !== 'ready') throw new Error('expected ready');
    const rows = parseCsvTable(ready.content);
    const header = rows[0];
    const na = rows.slice(1).find((r) => r[header.indexOf('state')] === 'na')!;
    expect(na[header.indexOf('value')]).toBe('');

    const withheld = buildCsvExport(
      makeBundle({
        asExtracted: {
          status: 'withheld',
          reason: 'Blinded during independent.',
        },
      }),
      'as_extracted',
    );
    expect(withheld.status).toBe('withheld');
    if (withheld.status === 'withheld') {
      expect(withheld.reason).toBe('Blinded during independent.');
    }
  });
});

describe('rob / screening / references datasets', () => {
  it('rob rows carry the support quote', () => {
    const result = buildCsvExport(makeBundle(), 'rob');
    if (result.status !== 'ready') throw new Error('expected ready');
    const rows = parseCsvTable(result.content);
    expect(rows[1][0]).toBe('risk_of_bias');
    expect(rows[1]).toContain('Central randomisation, "sealed" envelopes');
  });

  it('screening rows carry the structured exclude reason', () => {
    const result = buildCsvExport(makeBundle(), 'screening');
    if (result.status !== 'ready') throw new Error('expected ready');
    const rows = parseCsvTable(result.content);
    expect(rows[1][0]).toBe('screening');
    expect(rows[1]).toContain('wrong_population');
  });

  it('references export without any blinded gate', () => {
    const result = buildCsvExport(
      makeBundle({
        asExtracted: { status: 'withheld', reason: 'blinded' },
        rob: { status: 'withheld', reason: 'blinded' },
        screening: { status: 'withheld', reason: 'blinded' },
      }),
      'references',
    );
    expect(result.status).toBe('ready');
  });

  it('isCsvDataset accepts only known dataset ids', () => {
    expect(isCsvDataset('consensus')).toBe(true);
    expect(isCsvDataset('as_extracted')).toBe(true);
    expect(isCsvDataset('everything')).toBe(false);
  });
});
