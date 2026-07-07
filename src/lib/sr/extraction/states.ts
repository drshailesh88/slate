// ─────────────────────────────────────────────────────────────────────────────
// The FOUR distinct extraction states (non-negotiable #8, MECIR). A blank is
// NEVER a zero: "no mention of events" is `not_reported`, not `0`. Each state is
// explicit and selectable; only `reported` carries a value — the other three are
// designed dashed states, never an empty cell.
// ─────────────────────────────────────────────────────────────────────────────

export type ExtractionState = 'reported' | 'not_reported' | 'na' | 'unclear';

export const EXTRACTION_STATES: readonly ExtractionState[] = [
  'reported',
  'not_reported',
  'na',
  'unclear',
];

const STATE_LABEL: Record<ExtractionState, string> = {
  reported: 'Reported',
  not_reported: 'Not reported',
  na: 'N/A',
  unclear: 'Unclear',
};

export function stateLabel(state: ExtractionState): string {
  return STATE_LABEL[state];
}

export function isExtractionState(value: unknown): value is ExtractionState {
  return (
    value === 'reported' ||
    value === 'not_reported' ||
    value === 'na' ||
    value === 'unclear'
  );
}

// Only a `reported` field carries a value; the other three states are recorded
// WITHOUT a value (and rendered as a dashed state, never blank). This is the one
// place that decides whether a value is expected, so the write path and the UI
// agree.
export function stateCarriesValue(state: ExtractionState): boolean {
  return state === 'reported';
}
