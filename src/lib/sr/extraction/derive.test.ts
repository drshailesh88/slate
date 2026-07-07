import { describe, expect, it } from 'vitest';
import {
  deriveStudyReconciliation,
  type RawConsensus,
  type RawEntry,
} from './derive';
import type { ExtractionStudyDTO } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// deriveReconciliation (T15) — the Phase-2 grid. Asserts the science invariants
// end-to-end: equal-weight slots, Final empty until a human picks, agreed ≠ AI,
// not_reported ≠ 0, derived kept per-entry + separate, recorded ladder, QC of
// agreed critical fields.
// ─────────────────────────────────────────────────────────────────────────────

const STUDY: ExtractionStudyDTO = {
  id: 'st1',
  refId: '#1',
  title: 'A trial',
  authors: 'Doe',
  journal: 'J',
  year: 2020,
  doi: null,
};

const R1 = 'user-r1';
const R2 = 'user-r2';
const AI = 'user-ai';
const NAMES = new Map([
  [R1, 'Reviewer One'],
  [R2, 'Reviewer Two'],
]);

function entry(
  over: Partial<RawEntry> & Pick<RawEntry, 'reviewerId' | 'fieldId'>,
): RawEntry {
  return {
    value: null,
    state: 'reported',
    derived: false,
    derivedFormula: null,
    provenance: null,
    isAi: false,
    studyId: STUDY.id,
    ...over,
  };
}

function derive(
  entries: RawEntry[],
  consensus: RawConsensus[] = [],
  qcRate = 0,
) {
  return deriveStudyReconciliation({
    study: STUDY,
    entries,
    consensus,
    names: NAMES,
    qcRate,
  });
}

function field(result: ReturnType<typeof derive>, fieldId: string) {
  const f = result.fields.find((x) => x.fieldId === fieldId);
  if (!f) throw new Error(`no field ${fieldId}`);
  return f;
}

describe('equal-weight slots (non-neg #1)', () => {
  it('maps the two human extractors to reviewer1 / reviewer2, AI to ai', () => {
    const result = derive([
      entry({ reviewerId: R1, fieldId: 'sample_size', value: '120' }),
      entry({ reviewerId: R2, fieldId: 'sample_size', value: '96' }),
      entry({
        reviewerId: AI,
        fieldId: 'sample_size',
        value: '120',
        isAi: true,
      }),
    ]);
    const f = field(result, 'sample_size');
    expect(f.reviewer1?.value).toBe('120');
    expect(f.reviewer2?.value).toBe('96');
    expect(f.ai?.isAi).toBe(true);
    // Neither human slot is flagged primary/selected — they are peers.
    expect(f.reviewer1?.slot).toBe('reviewer1');
    expect(f.reviewer2?.slot).toBe('reviewer2');
  });
});

describe('Final starts empty for a conflict (non-neg #3/#4)', () => {
  it('a disagreement is a conflict with a null Final', () => {
    const result = derive([
      entry({ reviewerId: R1, fieldId: 'sample_size', value: '120' }),
      entry({ reviewerId: R2, fieldId: 'sample_size', value: '96' }),
    ]);
    const f = field(result, 'sample_size');
    expect(f.conflict).toBe(true);
    expect(f.final).toEqual({ kind: 'conflict', value: null });
  });

  it('agreed ≠ AI: reviewers agree on X while AI says Y → Final is X, not Y', () => {
    const result = derive([
      entry({ reviewerId: R1, fieldId: 'sample_size', value: '120' }),
      entry({ reviewerId: R2, fieldId: 'sample_size', value: '120' }),
      entry({
        reviewerId: AI,
        fieldId: 'sample_size',
        value: '999',
        isAi: true,
      }),
    ]);
    const f = field(result, 'sample_size');
    expect(f.agreed).toBe(true);
    if (f.final.kind === 'agreed') expect(f.final.value).toBe('120');
  });

  it('THE CORRECTION: AI alone can never be Final — reviewers missing → conflict', () => {
    const result = derive([
      entry({
        reviewerId: AI,
        fieldId: 'effect_estimate',
        value: 'RR 0.8',
        isAi: true,
      }),
    ]);
    const f = field(result, 'effect_estimate');
    expect(f.ai?.value).toBe('RR 0.8');
    expect(f.final).toEqual({ kind: 'conflict', value: null });
  });
});

describe('four states — not_reported ≠ 0 (non-neg #8)', () => {
  it('agreed not_reported keeps a null value, not a zero', () => {
    const result = derive([
      entry({
        reviewerId: R1,
        fieldId: 'events_control',
        value: null,
        state: 'not_reported',
      }),
      entry({
        reviewerId: R2,
        fieldId: 'events_control',
        value: null,
        state: 'not_reported',
      }),
    ]);
    const f = field(result, 'events_control');
    expect(f.agreed).toBe(true);
    if (f.final.kind === 'agreed') {
      expect(f.final.state).toBe('not_reported');
      expect(f.final.value).toBeNull();
    }
  });

  it('reported 0 vs not_reported is a conflict (a blank is never a zero)', () => {
    const result = derive([
      entry({
        reviewerId: R1,
        fieldId: 'events_control',
        value: '0',
        state: 'reported',
      }),
      entry({
        reviewerId: R2,
        fieldId: 'events_control',
        value: null,
        state: 'not_reported',
      }),
    ]);
    expect(field(result, 'events_control').conflict).toBe(true);
  });
});

describe('derived tagged + kept separate (non-neg #10)', () => {
  it('each reviewer entry keeps its own derived flag + formula', () => {
    const result = derive([
      entry({
        reviewerId: R1,
        fieldId: 'confidence_interval',
        value: '0.6–1.0',
        derived: true,
        derivedFormula: 'from SE',
      }),
      entry({
        reviewerId: R2,
        fieldId: 'confidence_interval',
        value: '0.6–1.0',
      }),
    ]);
    const f = field(result, 'confidence_interval');
    expect(f.reviewer1?.derived).toBe(true);
    expect(f.reviewer1?.derivedFormula).toBe('from SE');
    expect(f.reviewer2?.derived).toBe(false);
  });
});

describe('recorded ladder + resolved/unresolved (non-neg #7/#9)', () => {
  const conflictEntries = [
    entry({ reviewerId: R1, fieldId: 'sample_size', value: '120' }),
    entry({ reviewerId: R2, fieldId: 'sample_size', value: '96' }),
  ];

  it('a recorded consensus resolves the Final and carries the ladder', () => {
    const consensus: RawConsensus[] = [
      {
        studyId: STUDY.id,
        fieldId: 'sample_size',
        source: 'typed',
        value: '108',
        state: 'reported',
        derived: false,
        derivedFormula: null,
        resolutionMethod: 'discuss',
        arbitratorId: null,
        authorContacted: false,
        authorContactNote: null,
        resolvedBy: R1,
      },
    ];
    const f = field(derive(conflictEntries, consensus), 'sample_size');
    expect(f.final).toEqual({
      kind: 'resolved',
      value: '108',
      state: 'reported',
    });
    expect(f.consensus?.resolutionMethod).toBe('discuss');
    expect(f.consensus?.resolvedByName).toBe('Reviewer One');
  });

  it('a parked (unresolved) consensus keeps Final empty but records author-contact', () => {
    const consensus: RawConsensus[] = [
      {
        studyId: STUDY.id,
        fieldId: 'sample_size',
        source: 'typed',
        value: null,
        state: 'unclear',
        derived: false,
        derivedFormula: null,
        resolutionMethod: 'unresolved',
        arbitratorId: null,
        authorContacted: true,
        authorContactNote: 'Emailed authors; no reply in 4 weeks.',
        resolvedBy: R1,
      },
    ];
    const f = field(derive(conflictEntries, consensus), 'sample_size');
    expect(f.final).toEqual({ kind: 'conflict', value: null });
    expect(f.consensus?.resolutionMethod).toBe('unresolved');
    expect(f.consensus?.authorContacted).toBe(true);
    // Recorded → not counted as an outstanding field to verify.
    expect(f.qcFlagged).toBe(false);
  });
});

describe('QC sampling of agreed critical fields (non-neg #9)', () => {
  it('samples agreed CRITICAL fields at a full rate, never non-critical', () => {
    const result = derive(
      [
        // agreed critical
        entry({ reviewerId: R1, fieldId: 'effect_estimate', value: 'RR 0.8' }),
        entry({ reviewerId: R2, fieldId: 'effect_estimate', value: 'RR 0.8' }),
        // agreed non-critical
        entry({ reviewerId: R1, fieldId: 'country', value: 'UK' }),
        entry({ reviewerId: R2, fieldId: 'country', value: 'UK' }),
      ],
      [],
      1, // sample everything eligible
    );
    expect(field(result, 'effect_estimate').qcFlagged).toBe(true);
    expect(field(result, 'country').qcFlagged).toBe(false);
  });

  it('never QC-flags a conflicting field (only agreed values are spot-checked)', () => {
    const result = derive(
      [
        entry({ reviewerId: R1, fieldId: 'effect_estimate', value: 'RR 0.8' }),
        entry({ reviewerId: R2, fieldId: 'effect_estimate', value: 'RR 0.5' }),
      ],
      [],
      1,
    );
    expect(field(result, 'effect_estimate').qcFlagged).toBe(false);
  });

  it('at rate 0 nothing is QC-flagged', () => {
    const result = derive(
      [
        entry({ reviewerId: R1, fieldId: 'effect_estimate', value: 'RR 0.8' }),
        entry({ reviewerId: R2, fieldId: 'effect_estimate', value: 'RR 0.8' }),
      ],
      [],
      0,
    );
    expect(field(result, 'effect_estimate').qcFlagged).toBe(false);
  });
});

describe('fieldsToVerify (the header count, framed as verify not "to zero")', () => {
  it('counts open conflicts plus QC-flagged agreed fields', () => {
    const result = derive(
      [
        // open conflict
        entry({ reviewerId: R1, fieldId: 'sample_size', value: '120' }),
        entry({ reviewerId: R2, fieldId: 'sample_size', value: '96' }),
        // agreed critical → QC flagged at rate 1
        entry({ reviewerId: R1, fieldId: 'effect_estimate', value: 'RR 0.8' }),
        entry({ reviewerId: R2, fieldId: 'effect_estimate', value: 'RR 0.8' }),
      ],
      [],
      1,
    );
    expect(result.fieldsToVerify).toBe(2);
  });
});
