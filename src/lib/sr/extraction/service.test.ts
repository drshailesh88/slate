import { beforeEach, describe, expect, it } from 'vitest';
import { ExtractionInvalidError } from './errors';
import {
  leaveUnresolved,
  logAuthorContact,
  resolveExtractionField,
} from './service';
import { InMemoryExtractionConsensusStore } from './store';

// ─────────────────────────────────────────────────────────────────────────────
// The extraction reconciliation service (T15) — the NO-AUTO-RESOLVE state machine
// and the resolution ladder, exercised with an in-memory store (no DB). A
// consensus is written ONLY through an explicit human action carrying an actor
// id; there is no path that derives a value from the reviewers.
// ─────────────────────────────────────────────────────────────────────────────

const NOW = new Date('2026-07-07T00:00:00Z');
const BASE = { reviewId: 'r1', studyId: 's1', fieldId: 'sample_size' };
const ACTOR = 'user-actor';

let store: InMemoryExtractionConsensusStore;
beforeEach(() => {
  store = new InMemoryExtractionConsensusStore();
});

describe('resolveExtractionField — explicit human pick (non-neg #3/#4)', () => {
  it('records the picked value + source + who, and audits it', async () => {
    await resolveExtractionField(
      store,
      {
        ...BASE,
        source: 'reviewer1',
        value: '120',
        state: 'reported',
        derived: false,
        derivedFormula: null,
        provenance: { reportId: 'rep1', page: '4' },
        method: 'discuss',
        arbitratorId: null,
        actorId: ACTOR,
      },
      NOW,
    );
    const row = await store.getConsensus('r1', 's1', 'sample_size');
    expect(row?.value).toBe('120');
    expect(row?.source).toBe('reviewer1');
    expect(row?.resolvedBy).toBe(ACTOR);
    expect(store.audits.map((a) => a.action)).toContain('extraction.resolve');
  });

  it('refuses a resolution with no actor (nothing auto-resolves)', async () => {
    await expect(
      resolveExtractionField(
        store,
        {
          ...BASE,
          source: 'typed',
          value: '108',
          state: 'reported',
          derived: false,
          derivedFormula: null,
          provenance: null,
          method: 'discuss',
          arbitratorId: null,
          actorId: '',
        },
        NOW,
      ),
    ).rejects.toBeInstanceOf(ExtractionInvalidError);
    expect(await store.listConsensus('r1')).toHaveLength(0);
  });

  it('refuses a `reported` value that is blank (a blank is never a zero)', async () => {
    await expect(
      resolveExtractionField(
        store,
        {
          ...BASE,
          source: 'typed',
          value: '   ',
          state: 'reported',
          derived: false,
          derivedFormula: null,
          provenance: null,
          method: 'discuss',
          arbitratorId: null,
          actorId: ACTOR,
        },
        NOW,
      ),
    ).rejects.toBeInstanceOf(ExtractionInvalidError);
  });

  it('a non-reported state is stored with a null value, never 0', async () => {
    await resolveExtractionField(
      store,
      {
        ...BASE,
        source: 'typed',
        value: '0', // client tried to sneak a zero onto a not_reported
        state: 'not_reported',
        derived: false,
        derivedFormula: null,
        provenance: null,
        method: 'discuss',
        arbitratorId: null,
        actorId: ACTOR,
      },
      NOW,
    );
    const row = await store.getConsensus('r1', 's1', 'sample_size');
    expect(row?.state).toBe('not_reported');
    expect(row?.value).toBeNull();
  });

  it('arbitration requires an arbitrator id', async () => {
    await expect(
      resolveExtractionField(
        store,
        {
          ...BASE,
          source: 'reviewer2',
          value: '96',
          state: 'reported',
          derived: false,
          derivedFormula: null,
          provenance: null,
          method: 'arbitrator',
          arbitratorId: null,
          actorId: ACTOR,
        },
        NOW,
      ),
    ).rejects.toBeInstanceOf(ExtractionInvalidError);
  });

  it('a typed derived value keeps its derived flag + formula (non-neg #10)', async () => {
    await resolveExtractionField(
      store,
      {
        ...BASE,
        source: 'typed',
        value: '0.34',
        state: 'reported',
        derived: true,
        derivedFormula: 'SD = (upper − lower) / 3.92',
        provenance: null,
        method: 'discuss',
        arbitratorId: null,
        actorId: ACTOR,
      },
      NOW,
    );
    const row = await store.getConsensus('r1', 's1', 'sample_size');
    expect(row?.derived).toBe(true);
    expect(row?.derivedFormula).toContain('3.92');
  });
});

describe('logAuthorContact — the in-app LOG (non-neg #9, no auto-send)', () => {
  it('records the contact attempt + response without settling a value', async () => {
    await logAuthorContact(
      store,
      {
        ...BASE,
        contacted: true,
        note: 'Emailed corresponding author 2026-07-01; awaiting reply.',
        actorId: ACTOR,
      },
      NOW,
    );
    const row = await store.getConsensus('r1', 's1', 'sample_size');
    expect(row?.authorContacted).toBe(true);
    expect(row?.authorContactNote).toContain('Emailed');
    // Not a resolution — no final value was set.
    expect(row?.value).toBeNull();
    expect(row?.resolutionMethod).toBe('author_contact');
    expect(store.audits.map((a) => a.action)).toContain(
      'extraction.author_contact',
    );
  });

  it('preserves an existing resolved value when a later contact is logged', async () => {
    await resolveExtractionField(
      store,
      {
        ...BASE,
        source: 'reviewer1',
        value: '120',
        state: 'reported',
        derived: false,
        derivedFormula: null,
        provenance: null,
        method: 'discuss',
        arbitratorId: null,
        actorId: ACTOR,
      },
      NOW,
    );
    await logAuthorContact(
      store,
      { ...BASE, contacted: false, note: 'No contact needed.', actorId: ACTOR },
      NOW,
    );
    const row = await store.getConsensus('r1', 's1', 'sample_size');
    expect(row?.value).toBe('120'); // resolution intact
    expect(row?.authorContacted).toBe(false);
  });

  it('refuses an empty log note', async () => {
    await expect(
      logAuthorContact(
        store,
        { ...BASE, contacted: true, note: '   ', actorId: ACTOR },
        NOW,
      ),
    ).rejects.toBeInstanceOf(ExtractionInvalidError);
  });
});

describe('leaveUnresolved — allowed ONLY after the recorded ladder (non-neg #9)', () => {
  it('records unresolved with author-contacted y/n + rationale', async () => {
    await leaveUnresolved(
      store,
      {
        ...BASE,
        authorContacted: true,
        rationale: 'Authors did not reply after two attempts over 6 weeks.',
        actorId: ACTOR,
      },
      NOW,
    );
    const row = await store.getConsensus('r1', 's1', 'sample_size');
    expect(row?.resolutionMethod).toBe('unresolved');
    expect(row?.authorContacted).toBe(true);
    expect(row?.authorContactNote).toContain('two attempts');
    expect(row?.value).toBeNull();
    expect(store.audits.map((a) => a.action)).toContain(
      'extraction.leave_unresolved',
    );
  });

  it('refuses to park a field without a recorded rationale', async () => {
    await expect(
      leaveUnresolved(
        store,
        { ...BASE, authorContacted: false, rationale: '', actorId: ACTOR },
        NOW,
      ),
    ).rejects.toBeInstanceOf(ExtractionInvalidError);
  });
});

describe('as-extracted preserved — consensus never writes the blinded entries', () => {
  it('the consensus store only ever touches its own rows', async () => {
    // The store is the extraction_consensus port; it exposes no method that could
    // write the blinded entries. Recording a consensus adds a consensus row only.
    await resolveExtractionField(
      store,
      {
        ...BASE,
        source: 'reviewer1',
        value: '120',
        state: 'reported',
        derived: false,
        derivedFormula: null,
        provenance: null,
        method: 'discuss',
        arbitratorId: null,
        actorId: ACTOR,
      },
      NOW,
    );
    const rows = await store.listConsensus('r1');
    expect(rows).toHaveLength(1);
    expect(rows[0].fieldId).toBe('sample_size');
  });
});
