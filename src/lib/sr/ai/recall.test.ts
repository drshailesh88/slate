import { describe, expect, it } from 'vitest';
import {
  computeRecallOnIncludes,
  meetsRecallTarget,
  type LabeledScreeningItem,
} from './recall';

// A validation sample: each item pairs a human GOLD label with the AI's verdict.
// Recall/sensitivity is measured ON THE INCLUDES: of the records a human marked
// `include`, what fraction did the AI NOT wrongly exclude. A `maybe` keeps the
// record in the pool (a human still sees it), so it is NOT a miss — only an AI
// `exclude` on a true include is a false negative. This is the science-correct
// safeguard metric (FOUNDATION §8): concordance/agreement is dominated by
// true-negatives and hides missed includes, so it is explicitly NOT used.

function item(
  humanLabel: LabeledScreeningItem['humanLabel'],
  aiVerdict: LabeledScreeningItem['aiVerdict'],
): LabeledScreeningItem {
  return { humanLabel, aiVerdict };
}

describe('computeRecallOnIncludes', () => {
  it('is 1.0 when the AI keeps every human include (include or maybe)', () => {
    const sample = [
      item('include', 'include'),
      item('include', 'maybe'),
      item('exclude', 'exclude'),
    ];
    const result = computeRecallOnIncludes(sample);
    expect(result.recall).toBe(1);
    expect(result.includeCount).toBe(2);
    expect(result.caught).toBe(2);
    expect(result.missed).toBe(0);
    expect(result.sampleSize).toBe(3);
  });

  it('counts an AI `exclude` on a true include as a MISS (false negative)', () => {
    const sample = [
      item('include', 'include'),
      item('include', 'exclude'), // missed a real include — the dangerous error
      item('include', 'maybe'),
      item('include', 'include'),
    ];
    const result = computeRecallOnIncludes(sample);
    expect(result.includeCount).toBe(4);
    expect(result.missed).toBe(1);
    expect(result.caught).toBe(3);
    expect(result.recall).toBeCloseTo(0.75, 5);
  });

  it('ignores human excludes/maybes in the denominator (recall is over includes only)', () => {
    const sample = [
      item('include', 'include'),
      item('exclude', 'include'), // AI over-includes — irrelevant to recall
      item('maybe', 'exclude'), // human maybe is not a positive
    ];
    const result = computeRecallOnIncludes(sample);
    expect(result.includeCount).toBe(1);
    expect(result.recall).toBe(1);
  });

  it('returns null recall when the sample has no human includes (undefined)', () => {
    const sample = [item('exclude', 'exclude'), item('maybe', 'include')];
    const result = computeRecallOnIncludes(sample);
    expect(result.recall).toBeNull();
    expect(result.includeCount).toBe(0);
  });

  it('handles an empty sample without dividing by zero', () => {
    const result = computeRecallOnIncludes([]);
    expect(result.recall).toBeNull();
    expect(result.sampleSize).toBe(0);
    expect(result.includeCount).toBe(0);
  });
});

describe('meetsRecallTarget', () => {
  it('passes only at or above the target', () => {
    expect(meetsRecallTarget(0.95, 0.95)).toBe(true);
    expect(meetsRecallTarget(0.96, 0.95)).toBe(true);
    expect(meetsRecallTarget(0.9499, 0.95)).toBe(false);
  });

  it('fails a null recall (undefined recall can never pass the gate)', () => {
    expect(meetsRecallTarget(null, 0.95)).toBe(false);
  });
});
