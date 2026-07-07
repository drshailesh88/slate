import { describe, it, expect } from 'vitest';
import { sourceStatusModel } from '@/components/explore/source-status-chip';
import type { SourceStatus } from '@/types/search';

const ok = (): SourceStatus => ({ status: 'ok' });
const down = (): SourceStatus => ({ status: 'timeout' });

describe('sourceStatusModel', () => {
  it('reports N sources when all ok', () => {
    const m = sourceStatusModel(
      { pubmed: ok(), europepmc: ok() },
      { pubmed: 10, europepmc: 5 },
    );
    expect(m).toEqual({ label: '2 sources', degraded: false, reasons: [] });
  });

  it('discloses a degraded source by its clean label and never hides it as zero', () => {
    const m = sourceStatusModel(
      { pubmed: ok(), scopus: down() },
      { pubmed: 10, scopus: 0 },
    );
    expect(m.degraded).toBe(true);
    expect(m.label).toContain('1 of 2 sources');
    expect(m.reasons).toEqual(['Scopus temporarily unavailable']);
  });

  it('is not degraded when statuses are absent', () => {
    expect(
      sourceStatusModel(undefined, {
        pubmed: 1,
        europepmc: 1,
        scopus: 1,
        springer: 1,
        semantic_scholar: 1,
      }),
    ).toEqual({
      label: '5 sources',
      degraded: false,
      reasons: [],
    });
  });

  it('excludes internal engine lanes (pubmed_pmra) from the total', () => {
    const m = sourceStatusModel(undefined, {
      pubmed: 5,
      europepmc: 5,
      medcpt_dense: 5,
      medcpt_dense_hyde_0: 5,
      pubmed_pmra: 3,
    });
    expect(m).toEqual({ label: '3 sources', degraded: false, reasons: [] });
  });

  it('does not degrade the in-house index when only a HyDE lane times out', () => {
    const m = sourceStatusModel(
      { medcpt_dense: ok(), medcpt_dense_hyde_0: down() },
      { medcpt_dense: 12, medcpt_dense_hyde_0: 0 },
    );
    expect(m).toEqual({ label: '1 source', degraded: false, reasons: [] });
  });

  it('degrades the in-house index only when every medcpt lane is down', () => {
    const m = sourceStatusModel(
      { medcpt_dense: down(), medcpt_dense_hyde_0: down() },
      { medcpt_dense: 0, medcpt_dense_hyde_0: 0 },
    );
    expect(m.degraded).toBe(true);
    expect(m.reasons).toEqual(['In-house index temporarily unavailable']);
  });
});
