import { describe, expect, it } from 'vitest';
import {
  buildOwnQueue,
  decisionsByStudy,
  isDecisionKind,
  nextPendingIndex,
  orderStudyIds,
} from './queue';
import type { OwnDecisionDTO, ScreeningStudyDTO } from './types';

function study(id: string): ScreeningStudyDTO {
  return {
    id,
    refId: id,
    title: `Study ${id}`,
    authors: null,
    journal: null,
    year: null,
    doi: null,
    abstract: null,
  };
}

function decision(studyId: string): OwnDecisionDTO {
  return {
    studyId,
    decision: 'include',
    excludeReasonCode: null,
    excludeReasonDetail: null,
    locked: false,
  };
}

const POOL = [study('a'), study('b'), study('c'), study('d')];

describe('orderStudyIds', () => {
  it('keeps import order by default', () => {
    expect(orderStudyIds(POOL)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('ignores AI order when the toggle is off', () => {
    expect(orderStudyIds(POOL, { aiRanking: ['d', 'c'], useAiOrder: false })).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
  });

  it('leads with the AI ranking then appends the unranked tail (stable, no drops)', () => {
    const ordered = orderStudyIds(POOL, {
      aiRanking: ['d', 'b'],
      useAiOrder: true,
    });
    expect(ordered).toEqual(['d', 'b', 'a', 'c']);
    // Every study is still present exactly once — reordering never drops one.
    expect([...ordered].sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('drops ranking ids that are not in the pool', () => {
    expect(
      orderStudyIds(POOL, { aiRanking: ['zzz', 'c'], useAiOrder: true }),
    ).toEqual(['c', 'a', 'b', 'd']);
  });

  it('falls back to import order when the ranking is empty', () => {
    expect(orderStudyIds(POOL, { aiRanking: [], useAiOrder: true })).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
  });
});

describe('buildOwnQueue', () => {
  it('splits pending vs decided by the caller own decisions', () => {
    const queue = buildOwnQueue(POOL, [decision('b'), decision('d')]);
    expect(queue.pending).toEqual(['a', 'c']);
    expect(queue.decided).toEqual(['b', 'd']);
    expect(queue.decidedCount).toBe(2);
    expect(queue.totalCount).toBe(4);
  });

  it('is empty-pool safe', () => {
    const queue = buildOwnQueue([], []);
    expect(queue).toMatchObject({ pending: [], decided: [], totalCount: 0 });
  });
});

describe('nextPendingIndex', () => {
  const order = ['a', 'b', 'c', 'd'];
  it('finds the next undecided study, wrapping once', () => {
    const decided = new Set(['b']);
    expect(nextPendingIndex(order, decided, 0)).toBe(2); // skip b at 1
  });
  it('wraps to the earliest undecided when at the end', () => {
    const decided = new Set(['d']);
    expect(nextPendingIndex(order, decided, 3)).toBe(0);
  });
  it('returns -1 when everything is decided', () => {
    expect(nextPendingIndex(order, new Set(order), 0)).toBe(-1);
  });
  it('returns -1 for an empty order', () => {
    expect(nextPendingIndex([], new Set(), 0)).toBe(-1);
  });
});

describe('decisionsByStudy / isDecisionKind', () => {
  it('indexes decisions by study id', () => {
    const map = decisionsByStudy([decision('a'), decision('c')]);
    expect(map.get('a')?.studyId).toBe('a');
    expect(map.has('b')).toBe(false);
  });
  it('validates decision kinds', () => {
    expect(isDecisionKind('include')).toBe(true);
    expect(isDecisionKind('maybe')).toBe(true);
    expect(isDecisionKind('exclude')).toBe(true);
    expect(isDecisionKind('approve')).toBe(false);
  });
});
