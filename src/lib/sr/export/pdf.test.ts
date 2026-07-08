// PDF export (T19) — a structurally valid PDF whose text layer really carries
// the data: consensus + as-extracted as separately-headed sections, explicit
// states (never a zero), derived formulas, provenance, and the honest
// withheld reason during independent. extractPdfText is the inverse of the
// text layer, so these are round-trip assertions.
import { describe, expect, it } from 'vitest';

import { buildPdfExport, extractPdfText } from './pdf';
import type { ExportBundle } from './types';

function makeBundle(overrides: Partial<ExportBundle> = {}): ExportBundle {
  return {
    review: {
      id: 'review-1',
      title: 'Statins in sepsis (a blinded review)',
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
        title: 'Alpha trial',
        abstract: null,
        authors: 'Smith J',
        journal: 'Lancet',
        year: 2021,
        doi: '10.1000/alpha',
        externalId: 'PMID:111',
      },
    ],
    consensus: [
      {
        studyId: 'st1',
        studyTitle: 'Alpha trial',
        fieldId: 'sample_size',
        fieldLabel: 'Total sample size',
        value: '120',
        state: 'reported',
        derived: false,
        derivedFormula: null,
        provenance: { reportId: 'rep1', page: '4', locator: null },
        source: 'reviewer1',
        resolutionMethod: 'discuss',
        authorContacted: false,
        authorContactNote: null,
        resolvedByLabel: 'Dr. Self',
      },
      {
        studyId: 'st1',
        studyTitle: 'Alpha trial',
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
        authorContactNote: null,
        resolvedByLabel: 'Dr. Self',
      },
    ],
    asExtracted: {
      status: 'ready',
      rows: [
        {
          studyId: 'st1',
          studyTitle: 'Alpha trial',
          fieldId: 'sample_size',
          fieldLabel: 'Total sample size',
          reviewerLabel: 'Dr. Other',
          isAi: false,
          value: '118 (participants)',
          state: 'reported',
          derived: true,
          derivedFormula: 'arms summed',
          provenance: { reportId: 'rep1', page: '4', locator: null },
        },
      ],
    },
    rob: {
      status: 'ready',
      rows: [
        {
          studyId: 'st1',
          studyTitle: 'Alpha trial',
          reviewerLabel: 'Dr. Self',
          isAi: false,
          domainId: 'randomisation',
          judgement: 'low',
          supportQuote: 'Central randomisation',
        },
      ],
    },
    screening: {
      status: 'ready',
      rows: [
        {
          studyId: 'st1',
          studyTitle: 'Alpha trial',
          reviewerLabel: 'AI reviewer',
          isAi: true,
          stage: 'title_abstract',
          decision: 'include',
          excludeReasonCode: null,
          excludeReasonDetail: null,
        },
      ],
    },
    ...overrides,
  };
}

describe('buildPdfExport — structure', () => {
  it('emits a parseable PDF skeleton (header, xref, trailer, EOF)', () => {
    const pdf = buildPdfExport(makeBundle());
    expect(pdf.startsWith('%PDF-1.4\n')).toBe(true);
    expect(pdf).toContain('/Type /Catalog');
    expect(pdf).toContain('xref');
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
    // Every char stays single-byte so xref offsets equal string offsets.
    for (const ch of pdf) expect(ch.codePointAt(0)!).toBeLessThanOrEqual(0xff);
    // The startxref offset really points at the xref table.
    const startxref = Number(/startxref\n(\d+)\n/.exec(pdf)?.[1]);
    expect(pdf.slice(startxref, startxref + 4)).toBe('xref');
  });

  it('paginates: many rows produce multiple page objects', () => {
    const rows = Array.from({ length: 200 }, (_, i) => ({
      studyId: 'st1',
      studyTitle: 'Alpha trial',
      fieldId: `f${i}`,
      fieldLabel: `Field ${i}`,
      value: String(i),
      state: 'reported' as const,
      derived: false,
      derivedFormula: null,
      provenance: null,
      source: 'reviewer1' as const,
      resolutionMethod: 'discuss' as const,
      authorContacted: false,
      authorContactNote: null,
      resolvedByLabel: 'Dr. Self',
    }));
    const pdf = buildPdfExport(makeBundle({ consensus: rows }));
    const pageCount = Number(/\/Count (\d+)/.exec(pdf)?.[1]);
    expect(pageCount).toBeGreaterThan(1);
  });
});

describe('buildPdfExport — the text layer round-trip', () => {
  it('carries both datasets under separate labeled headings', () => {
    const text = extractPdfText(buildPdfExport(makeBundle()));
    expect(text).toContain('Consensus dataset - reconciled values (2)');
    expect(text).toContain(
      "As-extracted dataset - each reviewer's original entries (kept separate from consensus)",
    );
    expect(text).toContain('Total sample size: 120 (source: rep1, p. 4)');
    // The as-extracted line wraps at the layout column, so assert the parts.
    expect(text).toContain(
      'Total sample size - Dr. Other: 118 (participants) [derived: arms summed]',
    );
    expect(text).toContain('rep1, p. 4');
  });

  it('states stay explicit — a silent field is never a zero', () => {
    const text = extractPdfText(buildPdfExport(makeBundle()));
    expect(text).toContain('Primary outcome: Not reported');
    expect(text).not.toContain('Primary outcome: 0');
  });

  it('a withheld section prints its honest reason', () => {
    const reason =
      'Blinded per-reviewer as-extracted entries are withheld while extraction is independent.';
    const text = extractPdfText(
      buildPdfExport(
        makeBundle({ asExtracted: { status: 'withheld', reason } }),
      ),
    );
    expect(text).toContain('Withheld: Blinded per-reviewer as-extracted');
    // No as-extracted value appears anywhere.
    expect(text).not.toContain('118');
  });

  it('escapes parentheses in values without corrupting the stream', () => {
    const text = extractPdfText(buildPdfExport(makeBundle()));
    expect(text).toContain('118 (participants)');
  });

  it('rob and screening sections render with attribution', () => {
    const text = extractPdfText(buildPdfExport(makeBundle()));
    expect(text).toContain(
      'randomisation - Dr. Self: low ("Central randomisation")',
    );
    expect(text).toContain('AI reviewer (AI): include');
  });
});
