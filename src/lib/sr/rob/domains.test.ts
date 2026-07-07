import {
  domainsForInstrument,
  isDomainOfInstrument,
  isRobInstrument,
  isRobJudgement,
  overallRobJudgment,
  ROB2_DOMAINS,
  ROBINS_I_DOMAINS,
  rollUpOverall,
  type RobJudgement,
} from './domains';

// The roll-up math is ported near-verbatim from the ScholarSync precursor
// (src/lib/sr/rob.ts). Slate's enum uses `some` where the precursor used
// `some_concerns`; the assertions track the Slate enum value.

describe('ROB2_DOMAINS', () => {
  it('defines the five RoB 2 domains in order', () => {
    expect(ROB2_DOMAINS.map((d) => d.id)).toEqual([
      'randomisation',
      'deviations',
      'missing',
      'measurement',
      'selection',
    ]);
  });

  it('carries signalling questions for each domain', () => {
    for (const domain of ROB2_DOMAINS) {
      expect(domain.signalling.length).toBeGreaterThan(0);
    }
  });
});

describe('ROBINS_I_DOMAINS', () => {
  it('defines the seven ROBINS-I domains, disjoint from RoB 2', () => {
    expect(ROBINS_I_DOMAINS).toHaveLength(7);
    const rob2Ids = new Set(ROB2_DOMAINS.map((d) => d.id));
    for (const domain of ROBINS_I_DOMAINS) {
      expect(rob2Ids.has(domain.id)).toBe(false);
    }
  });
});

describe('overallRobJudgment', () => {
  const low: RobJudgement = 'low';
  const some: RobJudgement = 'some';
  const high: RobJudgement = 'high';

  it('is Low only when every domain is Low', () => {
    expect(overallRobJudgment([low, low, low, low, low])).toBe('low');
  });

  it('is High if any domain is High', () => {
    expect(overallRobJudgment([low, some, low, high, low])).toBe('high');
  });

  it('is Some concerns if any domain has some concerns but none are High', () => {
    expect(overallRobJudgment([low, some, low, low, low])).toBe('some');
  });

  it('treats an unassessed domain as some concerns at minimum', () => {
    expect(overallRobJudgment([low, low, undefined, low, low])).toBe('some');
  });

  it('an all-unassessed set is Some concerns, never Low', () => {
    expect(overallRobJudgment([undefined, undefined, undefined])).toBe('some');
  });

  it('an empty set is not Low (no domains assessed)', () => {
    expect(overallRobJudgment([])).toBe('some');
  });
});

describe('rollUpOverall', () => {
  it('rolls up over the full RoB 2 domain set (partial assessment → some)', () => {
    const partial = new Map<string, RobJudgement>([
      ['randomisation', 'low'],
      ['deviations', 'low'],
    ]);
    // Three RoB 2 domains still unassessed → some concerns.
    expect(rollUpOverall('rob2', partial)).toBe('some');
  });

  it('is Low only when all five RoB 2 domains are Low', () => {
    const all = new Map<string, RobJudgement>(
      ROB2_DOMAINS.map((d) => [d.id, 'low'] as const),
    );
    expect(rollUpOverall('rob2', all)).toBe('low');
  });

  it('a single High domain makes the whole study High', () => {
    const mixed = new Map<string, RobJudgement>(
      ROB2_DOMAINS.map((d) => [d.id, 'low'] as const),
    );
    mixed.set('measurement', 'high');
    expect(rollUpOverall('rob2', mixed)).toBe('high');
  });

  it('rolls up over all seven ROBINS-I domains', () => {
    const all = new Map<string, RobJudgement>(
      ROBINS_I_DOMAINS.map((d) => [d.id, 'low'] as const),
    );
    expect(rollUpOverall('robins_i', all)).toBe('low');
    // A RoB 2 domain key does not count toward ROBINS-I completeness.
    const stray = new Map<string, RobJudgement>([['randomisation', 'low']]);
    expect(rollUpOverall('robins_i', stray)).toBe('some');
  });
});

describe('instrument guards', () => {
  it('domainsForInstrument returns the instrument domains', () => {
    expect(domainsForInstrument('rob2')).toBe(ROB2_DOMAINS);
    expect(domainsForInstrument('robins_i')).toBe(ROBINS_I_DOMAINS);
  });

  it('isRobInstrument accepts only the two instruments', () => {
    expect(isRobInstrument('rob2')).toBe(true);
    expect(isRobInstrument('robins_i')).toBe(true);
    expect(isRobInstrument('grade')).toBe(false);
  });

  it('isDomainOfInstrument gates a domain to its instrument', () => {
    expect(isDomainOfInstrument('rob2', 'randomisation')).toBe(true);
    expect(isDomainOfInstrument('rob2', 'confounding')).toBe(false);
    expect(isDomainOfInstrument('robins_i', 'confounding')).toBe(true);
  });

  it('isRobJudgement accepts only the enum values', () => {
    expect(isRobJudgement('low')).toBe(true);
    expect(isRobJudgement('some')).toBe(true);
    expect(isRobJudgement('high')).toBe(true);
    expect(isRobJudgement('some_concerns')).toBe(false);
  });
});
