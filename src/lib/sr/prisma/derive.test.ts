import { describe, expect, it } from 'vitest';
import {
  derivePrismaFlow,
  derivePrismaIdentification,
  type PrismaDecisionRow,
  type PrismaFlow,
  type PrismaFlowInput,
  type PrismaResolutionRow,
  type PrismaStudyRow,
} from './derive';

function study(
  overrides: Partial<PrismaStudyRow> & Pick<PrismaStudyRow, 'id'>,
): PrismaStudyRow {
  return { source: 'PubMed', dupeStatus: 'unique', ...overrides };
}

function call(
  overrides: Partial<PrismaDecisionRow> &
    Pick<PrismaDecisionRow, 'studyId' | 'reviewerId' | 'decision'>,
): PrismaDecisionRow {
  return {
    stage: 'title_abstract',
    isAi: false,
    excludeReasonCode: null,
    ...overrides,
  };
}

function resolution(
  overrides: Partial<PrismaResolutionRow> &
    Pick<PrismaResolutionRow, 'studyId' | 'stage'>,
): PrismaResolutionRow {
  return { method: 'align_on_one', decision: null, ...overrides };
}

function flow(overrides: Partial<PrismaFlowInput> = {}): PrismaFlow {
  return derivePrismaFlow({
    studies: [],
    decisions: [],
    resolutions: [],
    requiredHumans: 2,
    ...overrides,
  });
}

// The auditable-record invariant: in = out + excluded at every stage, every
// bucket list length matches its count, and every pool record lands in exactly
// one terminal bucket.
function expectReconciled(result: PrismaFlow, totalStudies: number) {
  const { identification, screening, eligibility, included, buckets } = result;

  expect(identification.identified).toBe(totalStudies);
  expect(identification.identified).toBe(
    identification.duplicatesRemoved + identification.screened,
  );
  expect(identification.perSource.reduce((sum, s) => sum + s.count, 0)).toBe(
    identification.identified,
  );

  expect(screening.screened).toBe(
    screening.excluded + screening.inProgress + screening.advanced,
  );
  expect(eligibility.assessed).toBe(screening.advanced);
  expect(eligibility.assessed).toBe(
    eligibility.excluded + eligibility.inProgress + included.studies,
  );
  expect(
    eligibility.exclusionReasons.reduce((sum, r) => sum + r.count, 0),
  ).toBe(eligibility.excluded);

  expect(identification.duplicateStudyIds).toHaveLength(
    identification.duplicatesRemoved,
  );
  expect(buckets.duplicates).toHaveLength(identification.duplicatesRemoved);
  expect(buckets.taExcluded).toHaveLength(screening.excluded);
  expect(buckets.taInProgress).toHaveLength(screening.inProgress);
  expect(buckets.ftExcluded).toHaveLength(eligibility.excluded);
  expect(buckets.ftInProgress).toHaveLength(eligibility.inProgress);
  expect(buckets.included).toHaveLength(included.studies);

  const all = Object.values(buckets).flat();
  expect(all).toHaveLength(totalStudies);
  expect(new Set(all).size).toBe(totalStudies);
}

describe('derivePrismaIdentification', () => {
  it('splits identified into duplicates removed + screened, per source', () => {
    const result = derivePrismaIdentification([
      study({ id: 'a', source: 'PubMed' }),
      study({ id: 'b', source: 'PubMed', dupeStatus: 'auto_merged' }),
      study({ id: 'c', source: 'Embase' }),
      study({ id: 'd', source: null }),
    ]);

    expect(result.identified).toBe(4);
    expect(result.duplicatesRemoved).toBe(1);
    expect(result.screened).toBe(3);
    expect(result.perSource).toEqual([
      { source: 'PubMed', count: 2, studyIds: ['a', 'b'] },
      { source: 'Embase', count: 1, studyIds: ['c'] },
      { source: null, count: 1, studyIds: ['d'] },
    ]);
  });

  it('keeps uncertain (needs_review) and human-kept duplicates in the pool', () => {
    const result = derivePrismaIdentification([
      study({ id: 'a', dupeStatus: 'needs_review' }),
      study({ id: 'b', dupeStatus: 'kept' }),
      study({ id: 'c', dupeStatus: 'merged' }),
    ]);
    expect(result.duplicatesRemoved).toBe(1);
    expect(result.screened).toBe(2);
  });

  it('is empty-safe', () => {
    const result = derivePrismaIdentification([]);
    expect(result).toEqual({
      identified: 0,
      perSource: [],
      duplicatesRemoved: 0,
      duplicateStudyIds: [],
      screened: 0,
    });
  });

  it('lists the removed duplicates for the drill-down', () => {
    const result = derivePrismaIdentification([
      study({ id: 'a' }),
      study({ id: 'b', dupeStatus: 'auto_merged' }),
      study({ id: 'c', dupeStatus: 'merged' }),
    ]);
    expect(result.duplicateStudyIds).toEqual(['b', 'c']);
  });
});

describe('derivePrismaFlow — title & abstract outcomes', () => {
  it('advances unanimous positives (include and maybe both count)', () => {
    const result = flow({
      studies: [study({ id: 'a' })],
      decisions: [
        call({ studyId: 'a', reviewerId: 'r1', decision: 'include' }),
        call({ studyId: 'a', reviewerId: 'r2', decision: 'maybe' }),
      ],
    });
    expect(result.screening.advanced).toBe(1);
    expect(result.buckets.ftInProgress).toEqual(['a']);
    expectReconciled(result, 1);
  });

  it('excludes only on unanimous exclude', () => {
    const result = flow({
      studies: [study({ id: 'a' })],
      decisions: [
        call({ studyId: 'a', reviewerId: 'r1', decision: 'exclude' }),
        call({ studyId: 'a', reviewerId: 'r2', decision: 'exclude' }),
      ],
    });
    expect(result.screening.excluded).toBe(1);
    expectReconciled(result, 1);
  });

  it('holds an unresolved opposition in progress — never a silent exclusion', () => {
    const result = flow({
      studies: [study({ id: 'a' })],
      decisions: [
        call({ studyId: 'a', reviewerId: 'r1', decision: 'include' }),
        call({ studyId: 'a', reviewerId: 'r2', decision: 'exclude' }),
      ],
    });
    expect(result.screening.inProgress).toBe(1);
    expect(result.screening.excluded).toBe(0);
    expectReconciled(result, 1);
  });

  it('holds a study in progress until enough humans have called', () => {
    const oneVote = flow({
      studies: [study({ id: 'a' })],
      decisions: [
        call({ studyId: 'a', reviewerId: 'r1', decision: 'include' }),
      ],
    });
    expect(oneVote.screening.inProgress).toBe(1);

    const noVotes = flow({ studies: [study({ id: 'a' })] });
    expect(noVotes.screening.inProgress).toBe(1);
    expectReconciled(noVotes, 1);
  });

  it('one human + agreeing AI decides in ai_co_reviewer mode (requiredHumans 1)', () => {
    const result = flow({
      studies: [study({ id: 'a' })],
      decisions: [
        call({ studyId: 'a', reviewerId: 'r1', decision: 'include' }),
        call({
          studyId: 'a',
          reviewerId: 'ai',
          decision: 'include',
          isAi: true,
        }),
      ],
      requiredHumans: 1,
    });
    expect(result.screening.advanced).toBe(1);
  });

  it('an AI opposition keeps the study in progress even with enough humans', () => {
    const result = flow({
      studies: [study({ id: 'a' })],
      decisions: [
        call({ studyId: 'a', reviewerId: 'r1', decision: 'include' }),
        call({ studyId: 'a', reviewerId: 'r2', decision: 'include' }),
        call({
          studyId: 'a',
          reviewerId: 'ai',
          decision: 'exclude',
          isAi: true,
        }),
      ],
    });
    expect(result.screening.inProgress).toBe(1);
  });

  it('an AI call alone never satisfies the required human count', () => {
    const result = flow({
      studies: [study({ id: 'a' })],
      decisions: [
        call({
          studyId: 'a',
          reviewerId: 'ai',
          decision: 'include',
          isAi: true,
        }),
      ],
      requiredHumans: 1,
    });
    expect(result.screening.inProgress).toBe(1);
  });

  it('a recorded resolution decides an opposed study', () => {
    const decisions = [
      call({ studyId: 'a', reviewerId: 'r1', decision: 'include' }),
      call({ studyId: 'a', reviewerId: 'r2', decision: 'exclude' }),
    ];
    const excluded = flow({
      studies: [study({ id: 'a' })],
      decisions,
      resolutions: [
        resolution({
          studyId: 'a',
          stage: 'title_abstract',
          decision: 'exclude',
        }),
      ],
    });
    expect(excluded.screening.excluded).toBe(1);

    const advanced = flow({
      studies: [study({ id: 'a' })],
      decisions,
      resolutions: [
        resolution({
          studyId: 'a',
          stage: 'title_abstract',
          decision: 'include',
        }),
      ],
    });
    expect(advanced.screening.advanced).toBe(1);
  });

  it('pending arbitration (resolution without a decision) stays in progress', () => {
    const result = flow({
      studies: [study({ id: 'a' })],
      decisions: [
        call({ studyId: 'a', reviewerId: 'r1', decision: 'include' }),
        call({ studyId: 'a', reviewerId: 'r2', decision: 'exclude' }),
      ],
      resolutions: [
        resolution({
          studyId: 'a',
          stage: 'title_abstract',
          method: 'send_to_arbitrator',
        }),
      ],
    });
    expect(result.screening.inProgress).toBe(1);
    expect(result.screening.excluded).toBe(0);
  });
});

describe('derivePrismaFlow — full-text eligibility', () => {
  const advancedAt = (id: string) => [
    call({ studyId: id, reviewerId: 'r1', decision: 'include' }),
    call({ studyId: id, reviewerId: 'r2', decision: 'include' }),
  ];

  it('includes on unanimous full-text include', () => {
    const result = flow({
      studies: [study({ id: 'a' })],
      decisions: [
        ...advancedAt('a'),
        call({
          studyId: 'a',
          reviewerId: 'r1',
          decision: 'include',
          stage: 'full_text',
        }),
        call({
          studyId: 'a',
          reviewerId: 'r2',
          decision: 'include',
          stage: 'full_text',
        }),
      ],
    });
    expect(result.included.studies).toBe(1);
    expect(result.included.reports).toBe(1);
    expectReconciled(result, 1);
  });

  it('a full-text Maybe is an open question, never an implicit inclusion', () => {
    const result = flow({
      studies: [study({ id: 'a' })],
      decisions: [
        ...advancedAt('a'),
        call({
          studyId: 'a',
          reviewerId: 'r1',
          decision: 'include',
          stage: 'full_text',
        }),
        call({
          studyId: 'a',
          reviewerId: 'r2',
          decision: 'maybe',
          stage: 'full_text',
        }),
      ],
    });
    expect(result.included.studies).toBe(0);
    expect(result.eligibility.inProgress).toBe(1);
  });

  it('groups full-text exclusions by recorded reason (Item 16b)', () => {
    const ft = (id: string, reviewerId: string, code: string | null) =>
      call({
        studyId: id,
        reviewerId,
        decision: 'exclude',
        stage: 'full_text',
        excludeReasonCode: code,
      });
    const result = flow({
      studies: [study({ id: 'a' }), study({ id: 'b' }), study({ id: 'c' })],
      decisions: [
        ...advancedAt('a'),
        ...advancedAt('b'),
        ...advancedAt('c'),
        ft('a', 'r1', 'wrong_population'),
        ft('a', 'r2', 'wrong_population'),
        ft('b', 'r1', 'wrong_population'),
        ft('b', 'r2', 'wrong_outcome'),
        ft('c', 'r1', null),
        ft('c', 'r2', null),
      ],
    });

    expect(result.eligibility.excluded).toBe(3);
    // First human exclude (by reviewer order) carrying a code names the reason;
    // a reason-less exclusion is an explicit null bucket, never dropped.
    expect(result.eligibility.exclusionReasons).toEqual([
      { code: 'wrong_population', count: 2, studyIds: ['a', 'b'] },
      { code: null, count: 1, studyIds: ['c'] },
    ]);
    expectReconciled(result, 3);
  });

  it('prefers a human-recorded reason over the AI call', () => {
    const result = flow({
      studies: [study({ id: 'a' })],
      decisions: [
        ...advancedAt('a'),
        call({
          studyId: 'a',
          reviewerId: 'ai',
          decision: 'exclude',
          stage: 'full_text',
          excludeReasonCode: 'wrong_study_design',
          isAi: true,
        }),
        call({
          studyId: 'a',
          reviewerId: 'r1',
          decision: 'exclude',
          stage: 'full_text',
          excludeReasonCode: 'wrong_population',
        }),
        call({
          studyId: 'a',
          reviewerId: 'r2',
          decision: 'exclude',
          stage: 'full_text',
        }),
      ],
    });
    expect(result.eligibility.exclusionReasons).toEqual([
      { code: 'wrong_population', count: 1, studyIds: ['a'] },
    ]);
  });

  it('a full-text resolution decides the study; a reason-less resolved exclusion lands in the null bucket', () => {
    const result = flow({
      studies: [study({ id: 'a' })],
      decisions: [
        ...advancedAt('a'),
        call({
          studyId: 'a',
          reviewerId: 'r1',
          decision: 'include',
          stage: 'full_text',
        }),
        call({
          studyId: 'a',
          reviewerId: 'r2',
          decision: 'exclude',
          stage: 'full_text',
        }),
      ],
      resolutions: [
        resolution({ studyId: 'a', stage: 'full_text', decision: 'exclude' }),
      ],
    });
    expect(result.eligibility.excluded).toBe(1);
    expect(result.eligibility.exclusionReasons).toEqual([
      { code: null, count: 1, studyIds: ['a'] },
    ]);
  });
});

describe('derivePrismaFlow — every record accounted for', () => {
  it('reconciles a mixed review end to end', () => {
    const studies = [
      study({ id: 'dup', dupeStatus: 'merged' }),
      study({ id: 'ta-out' }),
      study({ id: 'ta-open' }),
      study({ id: 'ft-out', source: 'Embase' }),
      study({ id: 'ft-open' }),
      study({ id: 'in', source: 'Embase' }),
    ];
    const decisions = [
      // dup: screening calls on a removed duplicate must not resurrect it.
      call({ studyId: 'dup', reviewerId: 'r1', decision: 'include' }),
      call({ studyId: 'dup', reviewerId: 'r2', decision: 'include' }),
      call({ studyId: 'ta-out', reviewerId: 'r1', decision: 'exclude' }),
      call({ studyId: 'ta-out', reviewerId: 'r2', decision: 'exclude' }),
      call({ studyId: 'ta-open', reviewerId: 'r1', decision: 'include' }),
      call({ studyId: 'ft-out', reviewerId: 'r1', decision: 'include' }),
      call({ studyId: 'ft-out', reviewerId: 'r2', decision: 'include' }),
      call({
        studyId: 'ft-out',
        reviewerId: 'r1',
        decision: 'exclude',
        stage: 'full_text',
        excludeReasonCode: 'wrong_outcome',
      }),
      call({
        studyId: 'ft-out',
        reviewerId: 'r2',
        decision: 'exclude',
        stage: 'full_text',
        excludeReasonCode: 'wrong_outcome',
      }),
      call({ studyId: 'ft-open', reviewerId: 'r1', decision: 'include' }),
      call({ studyId: 'ft-open', reviewerId: 'r2', decision: 'maybe' }),
      call({ studyId: 'in', reviewerId: 'r1', decision: 'include' }),
      call({ studyId: 'in', reviewerId: 'r2', decision: 'include' }),
      call({
        studyId: 'in',
        reviewerId: 'r1',
        decision: 'include',
        stage: 'full_text',
      }),
      call({
        studyId: 'in',
        reviewerId: 'r2',
        decision: 'include',
        stage: 'full_text',
      }),
    ];

    const result = flow({ studies, decisions });

    expect(result.buckets).toEqual({
      duplicates: ['dup'],
      taExcluded: ['ta-out'],
      taInProgress: ['ta-open'],
      ftExcluded: ['ft-out'],
      ftInProgress: ['ft-open'],
      included: ['in'],
    });
    expect(result.identification.perSource).toEqual([
      {
        source: 'PubMed',
        count: 4,
        studyIds: ['dup', 'ta-out', 'ta-open', 'ft-open'],
      },
      { source: 'Embase', count: 2, studyIds: ['ft-out', 'in'] },
    ]);
    expectReconciled(result, 6);
  });

  it('reconciles the empty review', () => {
    expectReconciled(flow(), 0);
  });
});
