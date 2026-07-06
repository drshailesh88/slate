import { describe, it, expect } from 'vitest';
import { honestCount } from '@/components/explore/honest-count';

describe('honestCount', () => {
  it('reports matched across sources when nothing is capped', () => {
    expect(
      honestCount({
        matchedTotal: 142,
        total: 142,
        sourceCounts: { pubmed: 100, europepmc: 42 },
      }),
    ).toBe('142 matched across 2 sources');
  });

  it('discloses the cap and groups numerals when matched exceeds total', () => {
    expect(
      honestCount({
        matchedTotal: 3400,
        total: 200,
        sourceCounts: {
          pubmed: 1,
          europepmc: 1,
          scopus: 1,
          springer: 1,
          semantic_scholar: 1,
        },
      }),
    ).toBe('3,400 matched across 5 sources · showing the top 200 by relevance');
  });

  it('falls back to total when matchedTotal is absent', () => {
    expect(
      honestCount({
        matchedTotal: undefined,
        total: 12,
        sourceCounts: { pubmed: 12 },
      }),
    ).toBe('12 matched across 1 source');
  });

  it('excludes internal engine lanes and collapses medcpt lanes into one source', () => {
    expect(
      honestCount({
        matchedTotal: 400,
        total: 400,
        sourceCounts: {
          pubmed: 100,
          europepmc: 50,
          medcpt_dense: 30,
          medcpt_dense_hyde_0: 10,
          pubmed_pmra: 20,
        },
      }),
    ).toBe('400 matched across 3 sources');
  });
});
