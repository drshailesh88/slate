import type { RobAssessmentView } from '@/lib/sr/authz/blinded-read';
import { assembleReconciliation } from './reconcile';

const REVIEW = 'rev-1';
const R1 = 'reviewer-1';
const R2 = 'reviewer-2';
const AI = 'ai-reviewer';
const OWNER = 'owner-1';

function row(over: Partial<RobAssessmentView>): RobAssessmentView {
  return {
    id: 'x',
    reviewId: REVIEW,
    studyId: 'st1',
    reviewerId: R1,
    domain: 'randomisation',
    judgement: 'low',
    supportQuote: null,
    isAi: false,
    lockedAt: new Date('2026-01-01'),
    ...over,
  };
}

const DOMAINS = [{ id: 'randomisation', name: '1 · Randomisation process' }];

function opts(consensusAuthorId: string | null) {
  return {
    consensusAuthorId,
    labelFor: (id: string, isAi: boolean) =>
      isAi ? 'AI reviewer' : id === R1 ? 'Ana' : id === R2 ? 'Ben' : 'Owner',
    domainsFor: () => DOMAINS,
    studyIds: ['st1'],
  };
}

describe('assembleReconciliation', () => {
  it('groups every reviewer + the AI suggestion per domain at equal weight', () => {
    const rows = [
      row({ reviewerId: R1, judgement: 'low', supportQuote: 'seq generated' }),
      row({
        reviewerId: R2,
        judgement: 'high',
        supportQuote: 'no concealment',
      }),
      row({
        reviewerId: AI,
        isAi: true,
        judgement: 'some',
        supportQuote: 'ai note',
      }),
    ];
    const [study] = assembleReconciliation(rows, opts(null));
    const domain = study.domains[0];

    expect(domain.entries).toHaveLength(3);
    // Humans first, AI last.
    expect(domain.entries[domain.entries.length - 1].isAi).toBe(true);
    expect(domain.entries.map((e) => e.authorLabel)).toContain('Ana');
    expect(domain.entries.map((e) => e.authorLabel)).toContain('AI reviewer');
  });

  it('labels the AI suggestion and never marks it consensus', () => {
    const rows = [
      row({
        reviewerId: AI,
        isAi: true,
        judgement: 'high',
        supportQuote: 'ai',
      }),
    ];
    const [study] = assembleReconciliation(rows, opts(OWNER));
    const domain = study.domains[0];

    expect(domain.entries[0].isAi).toBe(true);
    // No human consensus recorded → consensus stays empty despite the AI row.
    expect(domain.consensus).toBeNull();
    expect(domain.consensusSupportQuote).toBeNull();
  });

  it('splits out the reconciler own row as the consensus (never the AI)', () => {
    const rows = [
      row({ reviewerId: R1, judgement: 'low' }),
      row({ reviewerId: AI, isAi: true, judgement: 'some' }),
      row({
        reviewerId: OWNER,
        judgement: 'high',
        supportQuote: 'adjudicated',
      }),
    ];
    const [study] = assembleReconciliation(rows, opts(OWNER));
    const domain = study.domains[0];

    expect(domain.consensus).toBe('high');
    expect(domain.consensusSupportQuote).toBe('adjudicated');
    // The reconciler own row is not double-listed among the inputs.
    expect(domain.entries.some((e) => e.authorLabel === 'Owner')).toBe(false);
    expect(domain.entries).toHaveLength(2);
  });

  it('when the viewer cannot reconcile, every row is an equal input (no consensus)', () => {
    const rows = [
      row({ reviewerId: R1, judgement: 'low' }),
      row({ reviewerId: OWNER, judgement: 'high' }),
    ];
    const [study] = assembleReconciliation(rows, opts(null));
    const domain = study.domains[0];
    expect(domain.consensus).toBeNull();
    expect(domain.entries).toHaveLength(2);
  });

  it('emits a card per study/domain even with no judgements yet', () => {
    const result = assembleReconciliation([], opts(OWNER));
    expect(result).toHaveLength(1);
    expect(result[0].domains).toHaveLength(1);
    expect(result[0].domains[0].entries).toHaveLength(0);
  });
});
