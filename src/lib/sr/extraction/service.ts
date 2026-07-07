import { ExtractionInvalidError } from './errors';
import { stateCarriesValue, type ExtractionState } from './states';
import type { ConsensusRow, ExtractionConsensusStore } from './store';
import type { ExtractionConsensusSource, ProvenanceDTO } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// The extraction reconciliation service — the NO-AUTO-RESOLVE state machine +
// the resolution ladder (pure of DB, port-backed).
//
// A consensus row is written ONLY through an explicit human action carrying an
// actor id. There is deliberately no function anywhere that derives a value from
// the two reviewers (no "resolve to agreement", no majority). The ladder rungs:
//   • resolveExtractionField → a human picked a value (discuss or arbitrator).
//   • logAuthorContact        → the in-app author-contact LOG (attempt+response);
//                               NEVER auto-sends email. Not a resolution.
//   • leaveUnresolved         → park a field, allowed ONLY after recording
//                               author-contacted (y/n) + a rationale (non-neg #9).
// Every action records who + when + how, and also writes an audit entry. The
// reviewers' as-extracted blinded entries are NEVER touched here (non-neg #8).
// ─────────────────────────────────────────────────────────────────────────────

function requireActor(actorId: string): void {
  if (!actorId) {
    throw new ExtractionInvalidError(
      'A reconciliation must be attributed to a human actor.',
    );
  }
}

// A `reported` value must be non-blank (a blank is never a zero); the other three
// states carry NO value (any client-sent value is discarded → stored null).
function normalizeValueForState(
  value: string | null | undefined,
  state: ExtractionState,
): string | null {
  if (!stateCarriesValue(state)) return null;
  const trimmed = (value ?? '').trim();
  if (trimmed.length === 0) {
    throw new ExtractionInvalidError(
      'A "reported" field needs a value. Use Not reported / N/A / Unclear if the paper is silent.',
    );
  }
  return trimmed;
}

export interface ResolveExtractionFieldArgs {
  reviewId: string;
  studyId: string;
  fieldId: string;
  source: ExtractionConsensusSource;
  value: string | null;
  state: ExtractionState;
  derived: boolean;
  derivedFormula: string | null;
  provenance: ProvenanceDTO | null;
  method: 'discuss' | 'arbitrator';
  arbitratorId: string | null;
  actorId: string;
}

export async function resolveExtractionField(
  store: ExtractionConsensusStore,
  args: ResolveExtractionFieldArgs,
  now: Date,
): Promise<void> {
  requireActor(args.actorId);

  if (args.method === 'arbitrator' && !args.arbitratorId) {
    throw new ExtractionInvalidError(
      'Arbitrating a field requires an independent arbitrator.',
    );
  }

  const value = normalizeValueForState(args.value, args.state);
  const derived = args.state === 'reported' ? args.derived : false;
  const derivedFormula =
    derived && args.derivedFormula && args.derivedFormula.trim().length > 0
      ? args.derivedFormula.trim()
      : null;

  // Preserve any prior author-contact record when a value is finally settled.
  const prior = await store.getConsensus(
    args.reviewId,
    args.studyId,
    args.fieldId,
  );

  await store.upsertConsensus(
    {
      reviewId: args.reviewId,
      studyId: args.studyId,
      fieldId: args.fieldId,
      value,
      state: args.state,
      source: args.source,
      derived,
      derivedFormula,
      provenance: args.provenance ?? null,
      resolutionMethod: args.method,
      arbitratorId: args.method === 'arbitrator' ? args.arbitratorId : null,
      authorContacted: prior?.authorContacted ?? false,
      authorContactNote: prior?.authorContactNote ?? null,
      resolvedBy: args.actorId,
    },
    now,
  );

  await store.appendAudit({
    reviewId: args.reviewId,
    actorId: args.actorId,
    action: 'extraction.resolve',
    target: `extraction:${args.reviewId}:${args.studyId}:${args.fieldId}`,
    before: prior
      ? { value: prior.value, method: prior.resolutionMethod }
      : null,
    after: {
      value,
      state: args.state,
      source: args.source,
      method: args.method,
    },
  });
}

export interface LogAuthorContactArgs {
  reviewId: string;
  studyId: string;
  fieldId: string;
  contacted: boolean;
  note: string;
  actorId: string;
}

export async function logAuthorContact(
  store: ExtractionConsensusStore,
  args: LogAuthorContactArgs,
  now: Date,
): Promise<void> {
  requireActor(args.actorId);
  const note = args.note.trim();
  if (note.length === 0) {
    throw new ExtractionInvalidError(
      'Record the author-contact attempt and any response.',
    );
  }

  const prior = await store.getConsensus(
    args.reviewId,
    args.studyId,
    args.fieldId,
  );

  // Preserve a prior value-resolution; a contact log never settles a value.
  const carried: Pick<
    ConsensusRow,
    | 'value'
    | 'state'
    | 'source'
    | 'derived'
    | 'derivedFormula'
    | 'provenance'
    | 'resolutionMethod'
    | 'arbitratorId'
  > = prior
    ? {
        value: prior.value,
        state: prior.state,
        source: prior.source,
        derived: prior.derived,
        derivedFormula: prior.derivedFormula,
        provenance: prior.provenance,
        resolutionMethod: prior.resolutionMethod,
        arbitratorId: prior.arbitratorId,
      }
    : {
        value: null,
        state: 'unclear' as const,
        source: 'typed' as const,
        derived: false,
        derivedFormula: null,
        provenance: null,
        resolutionMethod: 'author_contact' as const,
        arbitratorId: null,
      };

  await store.upsertConsensus(
    {
      reviewId: args.reviewId,
      studyId: args.studyId,
      fieldId: args.fieldId,
      ...carried,
      authorContacted: args.contacted,
      authorContactNote: note,
      resolvedBy: args.actorId,
    },
    now,
  );

  await store.appendAudit({
    reviewId: args.reviewId,
    actorId: args.actorId,
    action: 'extraction.author_contact',
    target: `extraction:${args.reviewId}:${args.studyId}:${args.fieldId}`,
    before: null,
    after: { contacted: args.contacted, note },
  });
}

export interface LeaveUnresolvedArgs {
  reviewId: string;
  studyId: string;
  fieldId: string;
  authorContacted: boolean;
  rationale: string;
  actorId: string;
}

export async function leaveUnresolved(
  store: ExtractionConsensusStore,
  args: LeaveUnresolvedArgs,
  now: Date,
): Promise<void> {
  requireActor(args.actorId);
  const rationale = args.rationale.trim();
  // The ladder gate: a field can be left unresolved ONLY after recording the
  // author-contact decision (y/n) + a rationale (non-neg #9).
  if (rationale.length === 0) {
    throw new ExtractionInvalidError(
      'Leaving a field unresolved requires a recorded rationale (and whether authors were contacted).',
    );
  }

  const prior = await store.getConsensus(
    args.reviewId,
    args.studyId,
    args.fieldId,
  );

  await store.upsertConsensus(
    {
      reviewId: args.reviewId,
      studyId: args.studyId,
      fieldId: args.fieldId,
      value: null,
      state: 'unclear',
      source: 'typed',
      derived: false,
      derivedFormula: null,
      provenance: prior?.provenance ?? null,
      resolutionMethod: 'unresolved',
      arbitratorId: prior?.arbitratorId ?? null,
      authorContacted: args.authorContacted,
      authorContactNote: rationale,
      resolvedBy: args.actorId,
    },
    now,
  );

  await store.appendAudit({
    reviewId: args.reviewId,
    actorId: args.actorId,
    action: 'extraction.leave_unresolved',
    target: `extraction:${args.reviewId}:${args.studyId}:${args.fieldId}`,
    before: prior ? { method: prior.resolutionMethod } : null,
    after: { authorContacted: args.authorContacted, rationale },
  });
}
