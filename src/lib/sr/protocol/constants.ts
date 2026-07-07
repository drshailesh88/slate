import type { EligibilityCriterion, Pico, ProtocolContent } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Protocol constants + derivations — ported near-verbatim from the ScholarSync
// precursor (src/lib/sr/protocol.ts). The protocol is the SINGLE source of the
// eligibility criteria; the screening & full-text panels derive from it.
// ─────────────────────────────────────────────────────────────────────────────

export interface PicoField {
  key: keyof Pico;
  label: string;
  hint: string;
}

/** The five PICO(S) fields, AI-drafted from the research question. */
export const PICO_FIELDS: PicoField[] = [
  { key: 'population', label: 'Population', hint: 'Who is studied' },
  { key: 'intervention', label: 'Intervention', hint: 'What is done' },
  { key: 'comparator', label: 'Comparator', hint: 'Compared against' },
  { key: 'outcome', label: 'Outcome', hint: 'What is measured' },
  { key: 'studyDesign', label: 'Study design', hint: 'Eligible designs' },
];

/** Elicit-style suggested criteria the reviewer can add with one tap. */
export const SUGGESTED_CRITERIA: Array<Omit<EligibilityCriterion, 'id'>> = [
  {
    kind: 'include',
    label: 'Human participants',
    instruction: 'Include studies conducted in human participants only.',
    answerStructure: 'yes_no_maybe',
  },
  {
    kind: 'include',
    label: 'Peer-reviewed full text available',
    instruction:
      'Include studies published in a peer-reviewed journal with a retrievable full text.',
    answerStructure: 'yes_no_maybe',
  },
  {
    kind: 'exclude',
    label: 'Follow-up under 12 weeks',
    instruction:
      'Exclude studies with a follow-up period shorter than 12 weeks.',
    answerStructure: 'yes_no_maybe',
  },
  {
    kind: 'exclude',
    label: 'No comparator arm',
    instruction:
      'Exclude single-arm studies with no comparator or control group.',
    answerStructure: 'yes_no_maybe',
  },
];

/** An empty PICO — the starting shape before any drafting. */
export const EMPTY_PICO: Pico = {
  population: '',
  intervention: '',
  comparator: '',
  outcome: '',
  studyDesign: '',
};

/** A blank protocol body — the "empty" state before the first save. */
export function emptyProtocolContent(): ProtocolContent {
  return { researchQuestion: '', pico: { ...EMPTY_PICO }, criteria: [] };
}

/**
 * Collapse the structured protocol criteria into the plain inclusion/exclusion
 * labels the screening & full-text criteria panels read. The protocol is the
 * single source; the screening panel derives from it.
 */
export function deriveScreeningCriteria(content: ProtocolContent): {
  inclusion: string[];
  exclusion: string[];
} {
  return {
    inclusion: content.criteria
      .filter((c) => c.kind === 'include')
      .map((c) => c.label),
    exclusion: content.criteria
      .filter((c) => c.kind === 'exclude')
      .map((c) => c.label),
  };
}
