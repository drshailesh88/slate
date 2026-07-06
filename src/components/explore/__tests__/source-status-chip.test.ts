import { describe, it, expect } from 'vitest';
import { sourceStatusModel } from '@/components/explore/source-status-chip';
import type { SourceStatus } from '@/types/search';

const ok = (): SourceStatus => ({ status: 'ok' });
const down = (): SourceStatus => ({ status: 'timeout' });

describe('sourceStatusModel', () => {
  it('reports N sources when all ok', () => {
    const m = sourceStatusModel({ pubmed: ok(), europepmc: ok() }, 2);
    expect(m).toEqual({ label: '2 sources', degraded: false, reasons: [] });
  });

  it('discloses a degraded source and never hides it as zero', () => {
    const m = sourceStatusModel({ pubmed: ok(), scopus: down() }, 2);
    expect(m.degraded).toBe(true);
    expect(m.label).toContain('1 of 2 sources');
    expect(m.reasons.join(' ')).toMatch(/scopus/i);
  });

  it('is not degraded when statuses are absent', () => {
    expect(sourceStatusModel(undefined, 5)).toEqual({
      label: '5 sources',
      degraded: false,
      reasons: [],
    });
  });
});
