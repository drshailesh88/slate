import { describe, it, expect } from 'vitest';
import { formatCitation } from '../format-citation';
import type { UnifiedSearchResult } from '@/types/search';

function makeResult(
  overrides: Partial<UnifiedSearchResult> = {},
): UnifiedSearchResult {
  return {
    title: 'SGLT2i in HF',
    authors: ['Zannad F', 'Ferreira JP'],
    journal: 'The Lancet',
    year: 2020,
    citationCount: 0,
    publicationTypes: [],
    isOpenAccess: false,
    sources: [],
    ...overrides,
  };
}

describe('formatCitation', () => {
  it('formats authors, year, title, journal, and a DOI link when doi is present', () => {
    const result = makeResult({ doi: '10.1016/x' });

    expect(formatCitation(result)).toBe(
      'Zannad F, Ferreira JP (2020). SGLT2i in HF. The Lancet. https://doi.org/10.1016/x',
    );
  });

  it('omits the DOI link entirely when doi is absent', () => {
    const result = makeResult({ doi: undefined });

    expect(formatCitation(result)).toBe(
      'Zannad F, Ferreira JP (2020). SGLT2i in HF. The Lancet.',
    );
  });

  it('joins a single author without a separator', () => {
    const result = makeResult({ authors: ['Smith A'], doi: undefined });

    expect(formatCitation(result)).toBe(
      'Smith A (2020). SGLT2i in HF. The Lancet.',
    );
  });
});
