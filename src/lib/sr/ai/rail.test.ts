import { describe, expect, it } from 'vitest';
import { buildAiReviewerRail, type AiReviewerRailInput } from './rail';

// ─────────────────────────────────────────────────────────────────────────────
// The T12 rail hook. The safeguards it must guarantee for the screening screen:
//   • the score is NEVER shown (showScore is always false);
//   • the AI verdict is visible ONLY at reconcile (blinded during independent);
//   • it is the second reviewer in ai_co_reviewer, additional QC in two_reviewer.
// ─────────────────────────────────────────────────────────────────────────────

function input(over: Partial<AiReviewerRailInput> = {}): AiReviewerRailInput {
  return {
    reviewMode: 'two_reviewer',
    validated: true,
    phase: 'independent',
    phase1Mode: 'silent_hold',
    ...over,
  };
}

describe('buildAiReviewerRail', () => {
  it('NEVER shows the score, in any phase or mode', () => {
    const combos: AiReviewerRailInput[] = [
      input({ phase: 'independent' }),
      input({ phase: 'reconcile' }),
      input({ reviewMode: 'ai_co_reviewer' }),
      input({ validated: false }),
      input({ queueOrderEnabled: true }),
    ];
    for (const c of combos) {
      const rail = buildAiReviewerRail(c);
      expect(rail.showScore).toBe(false);
      expect(JSON.stringify(rail)).not.toContain('score":');
    }
  });

  it('hides the verdict during independent, reveals it only at reconcile', () => {
    expect(
      buildAiReviewerRail(input({ phase: 'independent' })).verdictVisible,
    ).toBe(false);
    expect(
      buildAiReviewerRail(input({ phase: 'reconcile' })).verdictVisible,
    ).toBe(true);
  });

  it('is the second reviewer in ai_co_reviewer, additional QC in two_reviewer', () => {
    expect(
      buildAiReviewerRail(input({ reviewMode: 'ai_co_reviewer' })).role,
    ).toBe('second_reviewer');
    expect(
      buildAiReviewerRail(input({ reviewMode: 'two_reviewer' })).role,
    ).toBe('additional_qc');
  });

  it('offers only a LABELLED queue order (never a score) and only when enabled', () => {
    expect(buildAiReviewerRail(input()).queueOrder).toBeNull();
    const withOrder = buildAiReviewerRail(input({ queueOrderEnabled: true }));
    expect(withOrder.queueOrder?.enabled).toBe(true);
    expect(withOrder.queueOrder?.label.toLowerCase()).toContain('not a score');
  });

  it('surfaces an unvalidated AI honestly (recall validation required)', () => {
    const rail = buildAiReviewerRail(input({ validated: false }));
    expect(rail.validated).toBe(false);
    expect(rail.statusLabel.toLowerCase()).toContain('not validated');
  });
});
