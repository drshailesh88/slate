import { describe, expect, it } from 'vitest';
import {
  deriveRobOutcomes,
  deriveScreeningOutcomes,
  type OutcomeDecisionRow,
  type OutcomeResolutionRow,
} from './outcomes';

// ─────────────────────────────────────────────────────────────────────────────
// The report outcome math (T18) — pure derivations the chokepoint executes.
// Every count the report shows must trace to these rules: recorded resolutions
// win, agreed dual coverage decides, everything else is honestly "pending".
// ─────────────────────────────────────────────────────────────────────────────

const STAGE = 'title_abstract';

function vote(
  studyId: string,
  reviewerId: string,
  decision: string,
  opts: Partial<OutcomeDecisionRow> = {},
): OutcomeDecisionRow {
  return {
    studyId,
    reviewerId,
    stage: STAGE,
    decision,
    isAi: false,
    excludeReasonCode: null,
    ...opts,
  };
}

function derive(
  decisions: OutcomeDecisionRow[],
  resolutions: OutcomeResolutionRow[] = [],
  studyIds = ['st1'],
  reviewMode: 'two_reviewer' | 'ai_co_reviewer' = 'two_reviewer',
) {
  return deriveScreeningOutcomes({
    decisions,
    resolutions,
    studyIds,
    stage: STAGE,
    reviewMode,
  });
}

describe('deriveScreeningOutcomes — agreement', () => {
  it('includes a study both humans include', () => {
    const result = derive([
      vote('st1', 'r1', 'include'),
      vote('st1', 'r2', 'include'),
    ]);
    expect(result.includedStudyIds).toEqual(['st1']);
    expect(result.conflictPending).toBe(0);
  });

  it('excludes a study both humans exclude, counting the structured reason', () => {
    const result = derive([
      vote('st1', 'r1', 'exclude', { excludeReasonCode: 'wrong_population' }),
      vote('st1', 'r2', 'exclude', { excludeReasonCode: 'wrong_population' }),
    ]);
    expect(result.excludedStudyIds).toEqual(['st1']);
    expect(result.excludeReasonCounts).toEqual([
      { code: 'wrong_population', count: 1 },
    ]);
  });

  it('a single vote is in progress, never a decided count', () => {
    const result = derive([vote('st1', 'r1', 'include')]);
    expect(result.includedStudyIds).toEqual([]);
    expect(result.inProgress).toBe(1);
  });

  it('an unscreened pool study counts as in progress', () => {
    const result = derive([], [], ['st1', 'st2']);
    expect(result.inProgress).toBe(2);
  });

  it('a maybe never completes coverage', () => {
    const result = derive([
      vote('st1', 'r1', 'include'),
      vote('st1', 'r2', 'maybe'),
    ]);
    expect(result.includedStudyIds).toEqual([]);
    expect(result.inProgress).toBe(1);
  });
});

describe('deriveScreeningOutcomes — conflicts + resolutions', () => {
  const opposing = [vote('st1', 'r1', 'include'), vote('st1', 'r2', 'exclude')];

  it('an unresolved include-vs-exclude is a pending conflict, not a count', () => {
    const result = derive(opposing);
    expect(result.conflictPending).toBe(1);
    expect(result.includedStudyIds).toEqual([]);
    expect(result.excludedStudyIds).toEqual([]);
  });

  it('a recorded align_on_one include settles the study as included', () => {
    const result = derive(opposing, [
      {
        studyId: 'st1',
        stage: STAGE,
        method: 'align_on_one',
        decision: 'include',
        arbitratorId: null,
      },
    ]);
    expect(result.includedStudyIds).toEqual(['st1']);
    expect(result.conflictPending).toBe(0);
  });

  it('sent to an arbitrator who has not decided stays pending', () => {
    const result = derive(opposing, [
      {
        studyId: 'st1',
        stage: STAGE,
        method: 'send_to_arbitrator',
        decision: null,
        arbitratorId: 'arb1',
      },
    ]);
    expect(result.conflictPending).toBe(1);
  });

  it("the arbitrator's own recorded call settles the study", () => {
    const result = derive(
      [
        ...opposing,
        vote('st1', 'arb1', 'exclude', { excludeReasonCode: 'wrong_outcome' }),
      ],
      [
        {
          studyId: 'st1',
          stage: STAGE,
          method: 'send_to_arbitrator',
          decision: null,
          arbitratorId: 'arb1',
        },
      ],
    );
    expect(result.excludedStudyIds).toEqual(['st1']);
    expect(result.excludeReasonCounts).toEqual([
      { code: 'wrong_outcome', count: 1 },
    ]);
  });
});

describe('deriveScreeningOutcomes — the AI vote', () => {
  it('in two_reviewer mode an AI include never completes coverage', () => {
    const result = derive([
      vote('st1', 'r1', 'include'),
      vote('st1', 'ai', 'include', { isAi: true }),
    ]);
    expect(result.includedStudyIds).toEqual([]);
    expect(result.inProgress).toBe(1);
  });

  it('in ai_co_reviewer mode the validated AI completes dual coverage', () => {
    const result = derive(
      [
        vote('st1', 'r1', 'include'),
        vote('st1', 'ai', 'include', { isAi: true }),
      ],
      [],
      ['st1'],
      'ai_co_reviewer',
    );
    expect(result.includedStudyIds).toEqual(['st1']);
  });

  it('in ai_co_reviewer mode two AI votes alone never decide (a human is required)', () => {
    const result = derive(
      [
        vote('st1', 'ai1', 'exclude', { isAi: true }),
        vote('st1', 'ai2', 'exclude', { isAi: true }),
      ],
      [],
      ['st1'],
      'ai_co_reviewer',
    );
    expect(result.excludedStudyIds).toEqual([]);
    expect(result.inProgress).toBe(1);
  });

  it('an AI-vs-human opposition in ai_co_reviewer mode is a conflict for a human to resolve', () => {
    const result = derive(
      [
        vote('st1', 'r1', 'include'),
        vote('st1', 'ai', 'exclude', { isAi: true }),
      ],
      [],
      ['st1'],
      'ai_co_reviewer',
    );
    expect(result.conflictPending).toBe(1);
  });
});

describe('deriveScreeningOutcomes — stage scoping', () => {
  it('only counts rows and resolutions of the requested stage', () => {
    const result = deriveScreeningOutcomes({
      decisions: [
        { ...vote('st1', 'r1', 'include'), stage: 'full_text' },
        { ...vote('st1', 'r2', 'include'), stage: 'full_text' },
      ],
      resolutions: [],
      studyIds: ['st1'],
      stage: STAGE,
      reviewMode: 'two_reviewer',
    });
    expect(result.includedStudyIds).toEqual([]);
    expect(result.inProgress).toBe(1);
  });
});

describe('deriveRobOutcomes', () => {
  const rob = (
    studyId: string,
    reviewerId: string,
    domain: string,
    judgement: string,
    isAi = false,
  ) => ({ studyId, reviewerId, domain, judgement, isAi });

  const ROB2_ALL_LOW = (studyId: string, reviewerId: string) =>
    ['randomisation', 'deviations', 'missing', 'measurement', 'selection'].map(
      (domain) => rob(studyId, reviewerId, domain, 'low'),
    );

  it('agreeing full low roll-ups yield a low overall', () => {
    const result = deriveRobOutcomes(
      [...ROB2_ALL_LOW('st1', 'r1'), ...ROB2_ALL_LOW('st1', 'r2')],
      new Map([['st1', 'rob2']]),
      ['st1'],
    );
    expect(result.perStudy).toEqual([{ studyId: 'st1', overall: 'low' }]);
    expect(result.distribution.low).toBe(1);
  });

  it('disagreeing reviewers are reported as mixed — never a fabricated consensus', () => {
    const result = deriveRobOutcomes(
      [
        ...ROB2_ALL_LOW('st1', 'r1'),
        ...ROB2_ALL_LOW('st1', 'r2').slice(0, 4),
        rob('st1', 'r2', 'selection', 'high'),
      ],
      new Map([['st1', 'rob2']]),
      ['st1'],
    );
    expect(result.perStudy).toEqual([{ studyId: 'st1', overall: 'mixed' }]);
  });

  it('a partially assessed reviewer is at least some concerns (never low)', () => {
    const result = deriveRobOutcomes(
      [rob('st1', 'r1', 'randomisation', 'low')],
      new Map([['st1', 'rob2']]),
      ['st1'],
    );
    expect(result.perStudy).toEqual([{ studyId: 'st1', overall: 'some' }]);
  });

  it('no appraisal reads unassessed; AI suggestion rows never contribute', () => {
    const result = deriveRobOutcomes(
      [rob('st1', 'ai', 'randomisation', 'low', true)],
      new Map([['st1', 'rob2']]),
      ['st1'],
    );
    expect(result.perStudy).toEqual([
      { studyId: 'st1', overall: 'unassessed' },
    ]);
    expect(result.distribution.unassessed).toBe(1);
  });
});
