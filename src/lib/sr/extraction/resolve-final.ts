import { stateCarriesValue, type ExtractionState } from './states';
import type { ExtractionResolutionMethod } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// resolveFinal — THE CORRECTED reconciliation cell (T15).
//
// The precursor (ScholarSync src/lib/sr/extraction.ts:27-31) returned a
// `kind:"ai"` Final that surfaced the AI's value as the answer whenever there was
// no explicit conflict. That is the anti-pattern EXTRACTION-AND-TEAM-spec.md §6
// orders removed: it makes the AI the system of record and pre-fills consensus.
//
// The correction, encoded structurally:
//   • resolveFinal does not even ACCEPT an AI input — so an AI value can never
//     become Final (non-neg #4/#5). The AI is a labeled suggestion handled in the
//     picker UI, never here.
//   • `agreed` carries the HUMAN value the two reviewers matched on — agreed ≠ AI.
//   • Final is EMPTY (`{kind:'conflict', value:null}`) until a human explicitly
//     records a consensus — nothing auto-resolves (non-neg #3).
//   • A recorded-`unresolved` consensus keeps Final empty (the ladder was walked
//     and the field parked); it is not a value.
// ─────────────────────────────────────────────────────────────────────────────

export interface ExtractionValue {
  value: string | null;
  state: ExtractionState;
}

export interface ConsensusValue extends ExtractionValue {
  resolutionMethod: ExtractionResolutionMethod;
}

// The Final cell for a field. Deliberately three kinds — there is NO `ai` kind.
export type FinalCell =
  | { kind: 'agreed'; value: string | null; state: ExtractionState }
  | { kind: 'resolved'; value: string | null; state: ExtractionState }
  | { kind: 'conflict'; value: null };

function normalize(value: string | null): string {
  return (value ?? '').trim();
}

// Two extraction entries agree iff their states match AND — for the one state
// that carries a value (`reported`) — their normalized values are equal and
// non-empty. Non-reported states (not_reported / na / unclear) agree by matching
// state alone; a `not_reported` is never equated with a `0` because the states
// differ (see the states module).
export function entriesAgree(a: ExtractionValue, b: ExtractionValue): boolean {
  if (a.state !== b.state) return false;
  if (!stateCarriesValue(a.state)) return true;
  const av = normalize(a.value);
  const bv = normalize(b.value);
  return av.length > 0 && av === bv;
}

export function resolveFinal(args: {
  reviewer1: ExtractionValue | null;
  reviewer2: ExtractionValue | null;
  consensus: ConsensusValue | null;
}): FinalCell {
  const { reviewer1, reviewer2, consensus } = args;

  // A DECIDED value wins — only `discuss` / `arbitrator` settle a value. An
  // `author_contact` log (mid-ladder, no value yet) or an `unresolved` park is
  // NOT a final value: Final stays empty and we fall through to agreed/conflict.
  if (
    consensus &&
    (consensus.resolutionMethod === 'discuss' ||
      consensus.resolutionMethod === 'arbitrator')
  ) {
    return { kind: 'resolved', value: consensus.value, state: consensus.state };
  }

  // Both humans present and matching → agreed on the HUMAN value (never the AI).
  if (reviewer1 && reviewer2 && entriesAgree(reviewer1, reviewer2)) {
    return { kind: 'agreed', value: reviewer1.value, state: reviewer1.state };
  }

  // Everything else — disagreement, a missing side, no data — is empty until a
  // human picks. The AI is never consulted to fill it.
  return { kind: 'conflict', value: null };
}
