import { describe, it, expect } from 'vitest';
import { honestCount } from '@/components/explore/honest-count';

describe('honestCount', () => {
  it('reports matched across sources when nothing is capped', () => {
    expect(
      honestCount(
        {
          matchedTotal: 142,
          total: 142,
          sourceCounts: { pubmed: 100, europepmc: 42 },
        },
        'academic',
      ),
    ).toBe('142 matched across 2 sources');
  });

  it('discloses the cap and groups numerals when matched exceeds total', () => {
    expect(
      honestCount(
        {
          matchedTotal: 3400,
          total: 200,
          sourceCounts: {
            pubmed: 1,
            europepmc: 1,
            scopus: 1,
            springer: 1,
            semantic_scholar: 1,
          },
        },
        'academic',
      ),
    ).toBe('3,400 matched across 5 sources · showing the top 200 by relevance');
  });

  it('falls back to total when matchedTotal is absent', () => {
    expect(
      honestCount(
        {
          matchedTotal: undefined,
          total: 12,
          sourceCounts: { pubmed: 12 },
        },
        'academic',
      ),
    ).toBe('12 matched across 1 source');
  });

  it('excludes internal engine lanes and collapses medcpt lanes into one source', () => {
    expect(
      honestCount(
        {
          matchedTotal: 400,
          total: 400,
          sourceCounts: {
            pubmed: 100,
            europepmc: 50,
            medcpt_dense: 30,
            medcpt_dense_hyde_0: 10,
            pubmed_pmra: 20,
          },
        },
        'academic',
      ),
    ).toBe('400 matched across 3 sources');
  });

  it('academic count is unchanged (across sources + cap)', () => {
    expect(
      honestCount(
        {
          matchedTotal: 3400,
          total: 200,
          sourceCounts: { pubmed: 1, europepmc: 1 },
        },
        'academic',
      ),
    ).toBe('3,400 matched across 2 sources · showing the top 200 by relevance');
  });

  it('non-academic count is tab-appropriate, never "sources"', () => {
    expect(honestCount({ total: 43, sourceCounts: { web: 43 } }, 'web')).toBe(
      '43 web results',
    );
    expect(honestCount({ total: 1, sourceCounts: { news: 1 } }, 'news')).toBe(
      '1 news result',
    );
    expect(
      honestCount({ total: 50, sourceCounts: { videos: 50 } }, 'videos'),
    ).toBe('50 videos');
  });
});
