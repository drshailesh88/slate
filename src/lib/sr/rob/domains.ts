// ─────────────────────────────────────────────────────────────────────────────
// Risk-of-Bias instruments (RoB 2 for randomised trials, ROBINS-I for
// non-randomised studies) and the overall roll-up math — ported near-verbatim
// from the ScholarSync precursor `src/lib/sr/rob.ts`.
//
// PURE module: no DB, no React, no drizzle runtime import (the judgement union is
// declared as literals so this stays safe in the client bundle, mirroring
// screening/types.ts). The chokepoint-gated rows are grouped and rolled up on top
// of this — the science of "Low only if every domain is Low" lives here, proven
// exhaustively by domains.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

// Mirrors robJudgementEnum ('low' | 'some' | 'high') without importing the pgEnum
// runtime into client code. Slate's enum uses `some` where Cochrane writes
// "Some concerns"; the label below restores the human phrasing.
export type RobJudgement = 'low' | 'some' | 'high';

export type RobInstrument = 'rob2' | 'robins_i';

export interface RobDomain {
  id: string;
  /** Display number + name, e.g. "1 · Randomisation process". */
  name: string;
  /** The signalling questions that structure the judgement (Cochrane). */
  signalling: string[];
}

// The five RoB 2 domains (Cochrane Risk of Bias 2 for randomised trials).
export const ROB2_DOMAINS: readonly RobDomain[] = [
  {
    id: 'randomisation',
    name: '1 · Randomisation process',
    signalling: [
      'Was the allocation sequence random?',
      'Was the allocation sequence concealed?',
      'Did baseline differences suggest a problem with randomisation?',
    ],
  },
  {
    id: 'deviations',
    name: '2 · Deviations from intended intervention',
    signalling: [
      'Were participants aware of their assigned intervention?',
      'Were carers and people delivering the intervention aware of assignment?',
      'Was an appropriate analysis used to estimate the effect of assignment?',
    ],
  },
  {
    id: 'missing',
    name: '3 · Missing outcome data',
    signalling: [
      'Were data available for all, or nearly all, randomised participants?',
      'Is there evidence the result was not biased by missing data?',
    ],
  },
  {
    id: 'measurement',
    name: '4 · Measurement of the outcome',
    signalling: [
      'Was the method of measuring the outcome appropriate?',
      'Could measurement have differed between intervention groups?',
      'Were outcome assessors aware of the intervention received?',
    ],
  },
  {
    id: 'selection',
    name: '5 · Selection of the reported result',
    signalling: [
      'Were the data analysed in accordance with a pre-specified plan?',
      'Was the reported result selected from multiple measurements?',
      'Was the reported result selected from multiple analyses?',
    ],
  },
];

// The seven ROBINS-I domains (Cochrane Risk Of Bias In Non-randomised Studies of
// Interventions). Domain ids are disjoint from RoB 2 (except none collide by
// accident) so a single (reviewer, study, domain) key never mixes instruments.
export const ROBINS_I_DOMAINS: readonly RobDomain[] = [
  {
    id: 'confounding',
    name: '1 · Confounding',
    signalling: [
      'Were there baseline confounding domains?',
      'Was the analysis appropriate to control for the confounding?',
    ],
  },
  {
    id: 'participant_selection',
    name: '2 · Selection of participants into the study',
    signalling: [
      'Was selection into the study related to intervention and outcome?',
      'Did start of follow-up and start of intervention coincide?',
    ],
  },
  {
    id: 'classification',
    name: '3 · Classification of interventions',
    signalling: [
      'Were intervention groups clearly defined?',
      'Was information used to define groups recorded at the start?',
    ],
  },
  {
    id: 'intervention_deviations',
    name: '4 · Deviations from intended interventions',
    signalling: [
      'Were there deviations from the intended intervention?',
      'Were these deviations balanced between groups?',
    ],
  },
  {
    id: 'missing_data',
    name: '5 · Missing data',
    signalling: [
      'Were outcome data available for all, or nearly all, participants?',
      'Was there evidence the result was not biased by missing data?',
    ],
  },
  {
    id: 'outcome_measurement',
    name: '6 · Measurement of outcomes',
    signalling: [
      'Could the outcome measure have been influenced by knowledge of intervention?',
      'Were outcome assessors aware of the intervention received?',
    ],
  },
  {
    id: 'reported_result',
    name: '7 · Selection of the reported result',
    signalling: [
      'Was the result in line with a pre-specified analysis plan?',
      'Was the reported result selected from multiple measurements or analyses?',
    ],
  },
];

export const ROB_INSTRUMENTS: Record<
  RobInstrument,
  { label: string; domains: readonly RobDomain[] }
> = {
  rob2: { label: 'RoB 2 · randomised trials', domains: ROB2_DOMAINS },
  robins_i: {
    label: 'ROBINS-I · non-randomised studies',
    domains: ROBINS_I_DOMAINS,
  },
};

export function domainsForInstrument(
  instrument: RobInstrument,
): readonly RobDomain[] {
  return ROB_INSTRUMENTS[instrument].domains;
}

export function isRobInstrument(value: string): value is RobInstrument {
  return value === 'rob2' || value === 'robins_i';
}

// A domain id belongs to the instrument iff it is one of its domains.
export function isDomainOfInstrument(
  instrument: RobInstrument,
  domainId: string,
): boolean {
  return domainsForInstrument(instrument).some((d) => d.id === domainId);
}

/**
 * RoB overall judgement (Cochrane RoB 2 / ROBINS-I roll-up): High if any domain
 * is High; Low only if EVERY domain is Low; otherwise Some concerns. An
 * unassessed domain (`undefined`) is therefore at least Some concerns — never
 * Low. Ported from the precursor `overallRobJudgment`.
 */
export function overallRobJudgment(
  domainJudgments: ReadonlyArray<RobJudgement | undefined>,
): RobJudgement {
  if (domainJudgments.some((j) => j === 'high')) return 'high';
  if (domainJudgments.length > 0 && domainJudgments.every((j) => j === 'low')) {
    return 'low';
  }
  return 'some';
}

/**
 * Roll up a study's overall judgement across the FULL domain set of its
 * instrument: every instrument domain contributes, and one with no judgement
 * yet counts as `undefined` (→ at least Some concerns). This is the correct
 * denominator — a study is Low-risk only when all of its domains are assessed
 * and Low.
 */
export function rollUpOverall(
  instrument: RobInstrument,
  judgementByDomain: ReadonlyMap<string, RobJudgement>,
): RobJudgement {
  const perDomain = domainsForInstrument(instrument).map((domain) =>
    judgementByDomain.get(domain.id),
  );
  return overallRobJudgment(perDomain);
}

export const ROB_JUDGEMENT_LABEL: Record<RobJudgement, string> = {
  low: 'Low',
  some: 'Some concerns',
  high: 'High',
};

// design.md functional colour token per judgement (Jade / Amber / Tomato).
export const ROB_JUDGEMENT_TOKEN: Record<RobJudgement, string> = {
  low: 'var(--inc)',
  some: 'var(--may)',
  high: 'var(--exc)',
};

export function isRobJudgement(value: string): value is RobJudgement {
  return value === 'low' || value === 'some' || value === 'high';
}
