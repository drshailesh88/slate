// RevMan export (T19) — well-formed Cochrane review XML that carries the
// CONSENSUS dataset only (as-extracted is a separate labeled artifact), with
// the four states as explicit words (never a zero), derived formulas, and
// provenance. Round-trips through DOMParser (jsdom).
import { describe, expect, it } from 'vitest';

import { buildRevmanExport, renderConsensusValue } from './revman';
import type { ConsensusExportRow, ExportBundle } from './types';

function consensusRow(
  overrides: Partial<ConsensusExportRow> = {},
): ConsensusExportRow {
  return {
    studyId: 'st1',
    studyTitle: 'Alpha trial',
    fieldId: 'sample_size',
    fieldLabel: 'Total sample size',
    value: '120',
    state: 'reported',
    derived: false,
    derivedFormula: null,
    provenance: null,
    source: 'reviewer1',
    resolutionMethod: 'discuss',
    authorContacted: false,
    authorContactNote: null,
    resolvedByLabel: 'Dr. Self',
    ...overrides,
  };
}

function makeBundle(): ExportBundle {
  return {
    review: {
      id: 'review-1',
      title: 'Statins in sepsis <a randomised & blinded review>',
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
        title: 'Alpha trial of statins & sepsis',
        abstract: null,
        authors: 'Smith J; Lee K',
        journal: 'Lancet',
        year: 2021,
        doi: '10.1000/alpha',
        externalId: 'PMID:111',
      },
    ],
    consensus: [
      consensusRow({
        provenance: { reportId: 'rep1', page: '4', locator: 'Table 2' },
      }),
      consensusRow({
        fieldId: 'primary_outcome',
        fieldLabel: 'Primary outcome',
        value: null,
        state: 'not_reported',
      }),
      consensusRow({
        fieldId: 'mean_age',
        fieldLabel: 'Mean age',
        value: '61.5',
        derived: true,
        derivedFormula: 'pooled from arms',
      }),
    ],
    asExtracted: { status: 'ready', rows: [] },
    rob: { status: 'ready', rows: [] },
    screening: { status: 'ready', rows: [] },
  };
}

function parseXml(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  expect(doc.querySelector('parsererror')).toBeNull();
  return doc;
}

describe('buildRevmanExport — structure + escaping', () => {
  it('is well-formed XML with the escaped review title and included study', () => {
    const doc = parseXml(buildRevmanExport(makeBundle()));
    expect(doc.documentElement.tagName).toBe('COCHRANE_REVIEW');
    expect(doc.querySelector('COVER_SHEET > TITLE')?.textContent).toBe(
      'Statins in sepsis <a randomised & blinded review>',
    );
    const study = doc.querySelector('INCLUDED_STUDIES > STUDY');
    expect(study?.getAttribute('NAME')).toBe('Smith J 2021');
    expect(study?.querySelector('TI')?.textContent).toBe(
      'Alpha trial of statins & sepsis',
    );
    expect(
      study?.querySelector('IDENTIFIER[TYPE="DOI"]')?.getAttribute('VALUE'),
    ).toBe('10.1000/alpha');
  });

  it('the characteristics carry consensus values keyed to the study', () => {
    const doc = parseXml(buildRevmanExport(makeBundle()));
    const char = doc.querySelector('INCLUDED_CHAR');
    expect(char?.getAttribute('STUDY_ID')).toBe('STD-1');
    const paragraphs = [...doc.querySelectorAll('INCLUDED_CHAR P')].map(
      (p) => p.textContent,
    );
    expect(paragraphs).toContain(
      'Total sample size: 120 (source: rep1, p. 4, Table 2)',
    );
  });

  it('states render as explicit words and derived carries its formula (never a 0)', () => {
    const xml = buildRevmanExport(makeBundle());
    expect(xml).toContain('Primary outcome: Not reported');
    expect(xml).not.toContain('Primary outcome: 0');
    expect(xml).toContain('Mean age: 61.5 [derived: pooled from arms]');
  });

  it('declares the consensus-only rule so as-extracted is never absorbed silently', () => {
    const xml = buildRevmanExport(makeBundle());
    expect(xml).toMatch(/CONSENSUS dataset only/);
    expect(xml).toMatch(/as-extracted entries are preserved separately/);
  });
});

describe('renderConsensusValue — the four states', () => {
  it('renders each non-reported state as its word', () => {
    expect(
      renderConsensusValue(
        consensusRow({ state: 'not_reported', value: null }),
      ),
    ).toBe('Not reported');
    expect(
      renderConsensusValue(consensusRow({ state: 'na', value: null })),
    ).toBe('Not applicable');
    expect(
      renderConsensusValue(consensusRow({ state: 'unclear', value: null })),
    ).toBe('Unclear');
  });

  it('a derived value without a formula is still flagged', () => {
    expect(
      renderConsensusValue(consensusRow({ derived: true, value: '4.2' })),
    ).toBe('4.2 [derived]');
  });
});
