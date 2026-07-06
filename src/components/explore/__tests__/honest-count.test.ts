import { describe, it, expect } from 'vitest';
import { honestCount } from '@/components/explore/honest-count';

describe('honestCount', () => {
  it('reports matched across sources when nothing is capped', () => {
    expect(
      honestCount({
        matchedTotal: 142,
        total: 142,
        sourceCounts: { a: 100, b: 42 },
      }),
    ).toBe('142 matched across 2 sources');
  });
  it('discloses the cap and groups numerals when matched exceeds total', () => {
    expect(
      honestCount({
        matchedTotal: 3400,
        total: 200,
        sourceCounts: { a: 1, b: 1, c: 1, d: 1, e: 1 },
      }),
    ).toBe('3,400 matched across 5 sources · showing the top 200 by relevance');
  });
  it('falls back to total when matchedTotal is absent', () => {
    expect(
      honestCount({
        matchedTotal: undefined,
        total: 12,
        sourceCounts: { a: 12 },
      }),
    ).toBe('12 matched across 1 source');
  });
});
