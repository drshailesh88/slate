import { describe, expect, it } from 'vitest';
import {
  cohensKappa,
  deriveScreeningConflicts,
  type ScreeningDecisionRow,
} from './derive';

// Build a screening row with sensible defaults; overrides on top.
function row(
  overrides: Partial<ScreeningDecisionRow> &
    Pick<ScreeningDecisionRow, 'studyId' | 'reviewerId' | 'decision'>,
): ScreeningDecisionRow {
  return {
    stage: 'title_abstract',
    isAi: false,
    excludeReasonCode: null,
    excludeReasonDetail: null,
    ...overrides,
  };
}

describe('cohensKappa (ported from the precursor)', () => {
  it('computes agreement on the include/exclude collapse of dual calls', () => {
    // 3 agree, 1 disagree over the positive(include|maybe)/negative collapse → κ 0.5.
    const rows = [
      row({ studyId: 's1', reviewerId: 'a', decision: 'include' }),
      row({ studyId: 's1', reviewerId: 'b', decision: 'maybe' }),
      row({ studyId: 's2', reviewerId: 'a', decision: 'include' }),
      row({ studyId: 's2', reviewerId: 'b', decision: 'include' }),
      row({ studyId: 's3', reviewerId: 'a', decision: 'exclude' }),
      row({ studyId: 's3', reviewerId: 'b', decision: 'exclude' }),
      row({ studyId: 's4', reviewerId: 'a', decision: 'include' }),
      row({ studyId: 's4', reviewerId: 'b', decision: 'exclude' }),
    ];
    const result = cohensKappa(rows);
    expect(result.value).toBeCloseTo(0.5, 4);
    expect(result.label).toBe('Moderate');
  });

  it('ignores studies without two human calls', () => {
    const result = cohensKappa([
      row({ studyId: 's1', reviewerId: 'a', decision: 'include' }),
    ]);
    expect(result.value).toBeNull();
    expect(result.label).toBe('Not enough data');
  });

  it('reports perfect agreement as 1.0', () => {
    const result = cohensKappa([
      row({ studyId: 's1', reviewerId: 'a', decision: 'include' }),
      row({ studyId: 's1', reviewerId: 'b', decision: 'include' }),
      row({ studyId: 's2', reviewerId: 'a', decision: 'exclude' }),
      row({ studyId: 's2', reviewerId: 'b', decision: 'exclude' }),
    ]);
    expect(result.value).toBe(1);
    expect(result.label).toBe('Almost perfect');
  });

  it('excludes AI calls from inter-human agreement', () => {
    // One human + one AI on a study is NOT a dual-human study → not enough data.
    const result = cohensKappa([
      row({ studyId: 's1', reviewerId: 'a', decision: 'include' }),
      row({ studyId: 's1', reviewerId: 'ai', decision: 'exclude', isAi: true }),
    ]);
    expect(result.value).toBeNull();
  });
});

describe('deriveScreeningConflicts', () => {
  it('flags a study only when calls include BOTH an include and an exclude', () => {
    const conflicts = deriveScreeningConflicts(
      [
        row({ studyId: 's1', reviewerId: 'a', decision: 'include' }),
        row({ studyId: 's1', reviewerId: 'b', decision: 'exclude' }),
      ],
      'title_abstract',
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].studyId).toBe('s1');
    // Both opposing calls are carried — equal weight, none dropped.
    expect(conflicts[0].decisions).toHaveLength(2);
    expect(conflicts[0].decisions.map((d) => d.decision).sort()).toEqual([
      'exclude',
      'include',
    ]);
  });

  it('does not flag agreement', () => {
    const conflicts = deriveScreeningConflicts(
      [
        row({ studyId: 's1', reviewerId: 'a', decision: 'include' }),
        row({ studyId: 's1', reviewerId: 'b', decision: 'include' }),
      ],
      'title_abstract',
    );
    expect(conflicts).toHaveLength(0);
  });

  it('treats a lone Maybe as tentative, not a conflict', () => {
    const conflicts = deriveScreeningConflicts(
      [
        row({ studyId: 's1', reviewerId: 'a', decision: 'include' }),
        row({ studyId: 's1', reviewerId: 'b', decision: 'maybe' }),
      ],
      'title_abstract',
    );
    expect(conflicts).toHaveLength(0);
  });

  it('counts an AI-vs-human opposition as a conflict to reconcile', () => {
    const conflicts = deriveScreeningConflicts(
      [
        row({ studyId: 's1', reviewerId: 'a', decision: 'include' }),
        row({
          studyId: 's1',
          reviewerId: 'ai',
          decision: 'exclude',
          isAi: true,
        }),
      ],
      'title_abstract',
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].decisions.some((d) => d.isAi)).toBe(true);
  });

  it('only considers rows for the requested stage', () => {
    const conflicts = deriveScreeningConflicts(
      [
        row({ studyId: 's1', reviewerId: 'a', decision: 'include' }),
        row({
          studyId: 's1',
          reviewerId: 'b',
          decision: 'exclude',
          stage: 'full_text',
        }),
      ],
      'title_abstract',
    );
    // The two calls are on different stages, so neither stage opposes on its own.
    expect(conflicts).toHaveLength(0);
  });

  it('orders the queue deterministically by studyId', () => {
    const conflicts = deriveScreeningConflicts(
      [
        row({ studyId: 's2', reviewerId: 'a', decision: 'include' }),
        row({ studyId: 's2', reviewerId: 'b', decision: 'exclude' }),
        row({ studyId: 's1', reviewerId: 'a', decision: 'include' }),
        row({ studyId: 's1', reviewerId: 'b', decision: 'exclude' }),
      ],
      'title_abstract',
    );
    expect(conflicts.map((c) => c.studyId)).toEqual(['s1', 's2']);
  });
});
