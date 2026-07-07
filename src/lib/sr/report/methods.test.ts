import { describe, expect, it } from 'vitest';
import { assembleMethodsBlock, type MethodsMetadata } from './methods';
import { extractNumericTokens } from './grounding';
import type { MethodsStatement } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// The auto Methods · data-collection block (PRISMA Items 8/9/10) is ASSEMBLED
// from recorded metadata, never free-typed: every statement carries the
// recorded values it was built from, and every number in its text must appear
// among those values — the traceability contract, asserted mechanically below.
// ─────────────────────────────────────────────────────────────────────────────

function meta(overrides: Partial<MethodsMetadata> = {}): MethodsMetadata {
  return {
    reviewMode: 'two_reviewer',
    reviewerCount: 2,
    arbitratorCount: 1,
    screeningResolutions: { alignOnOne: 3, sentToArbitrator: 1 },
    extractionResolutions: {
      discuss: 4,
      arbitrator: 2,
      authorContact: 1,
      unresolved: 1,
    },
    authorContacts: { fields: 2, studies: 1 },
    aiValidation: null,
    qcSampleRate: 0.2,
    extractionFieldCount: 9,
    extractionSectionLabels: [
      'General information',
      'Participant characteristics',
      'Outcomes',
    ],
    ...overrides,
  };
}

function allStatements(block: ReturnType<typeof assembleMethodsBlock>) {
  return [...block.selection, ...block.dataCollection, ...block.dataItems];
}

function recordedNumbers(statement: MethodsStatement): Set<number> {
  const numbers = new Set<number>();
  for (const value of Object.values(statement.recorded)) {
    if (typeof value === 'number') {
      numbers.add(value);
      // A rate may legitimately surface as a rounded percent or 2-dp figure.
      numbers.add(Math.round(value * 100));
      numbers.add(Number.parseFloat(value.toFixed(2)));
    }
    if (typeof value === 'string') {
      for (const n of extractNumericTokens(value)) numbers.add(n);
    }
  }
  return numbers;
}

describe('assembleMethodsBlock — traceability', () => {
  it('every number in every statement traces to a recorded metadata value', () => {
    const block = assembleMethodsBlock(meta());
    for (const statement of allStatements(block)) {
      const allowed = recordedNumbers(statement);
      for (const token of extractNumericTokens(statement.text)) {
        expect(
          allowed.has(token),
          `"${statement.text}" contains ${token}, not among recorded ${JSON.stringify(statement.recorded)}`,
        ).toBe(true);
      }
    }
  });

  it('every statement names its record source', () => {
    const block = assembleMethodsBlock(meta());
    for (const statement of allStatements(block)) {
      expect(statement.source).toBeTruthy();
      expect(statement.recorded).toBeTruthy();
    }
  });

  it('produces all three PRISMA items', () => {
    const block = assembleMethodsBlock(meta());
    expect(block.selection.length).toBeGreaterThan(0);
    expect(block.dataCollection.length).toBeGreaterThan(0);
    expect(block.dataItems.length).toBeGreaterThan(0);
  });
});

describe('assembleMethodsBlock — Item 8 (selection process)', () => {
  it('states the recorded reviewer count and blinded independence', () => {
    const [independence] = assembleMethodsBlock(meta()).selection;
    expect(independence.text).toContain('2 reviewers');
    expect(independence.text).toContain('independently');
    expect(independence.text).toContain('blinded');
    expect(independence.recorded.reviewerCount).toBe(2);
  });

  it('states the recorded conflict-resolution methods with their counts', () => {
    const block = assembleMethodsBlock(meta());
    const resolution = block.selection.find((s) =>
      s.text.includes('disagreements were resolved'),
    );
    expect(resolution).toBeDefined();
    expect(resolution?.text).toContain('discussion (3 records)');
    expect(resolution?.text).toContain('independent arbitrator (1 record)');
  });

  it('with no AI, states that no automation participated', () => {
    const block = assembleMethodsBlock(meta());
    expect(
      block.selection.some((s) => s.text.includes('No automation tool')),
    ).toBe(true);
  });

  it('states the recorded AI validation (model, recall, sample) when present', () => {
    const block = assembleMethodsBlock(
      meta({
        reviewMode: 'ai_co_reviewer',
        reviewerCount: 1,
        aiValidation: {
          model: 'openai/gpt-4o-mini',
          version: 'v1',
          recall: 0.97,
          sampleSize: 40,
        },
      }),
    );
    const ai = block.selection.find((s) => s.source === 'ai_validation');
    expect(ai?.text).toContain('openai/gpt-4o-mini');
    expect(ai?.text).toContain('0.97');
    expect(ai?.text).toContain('40');
    expect(ai?.text).toContain('never excludes a record on its own');
    expect(ai?.recorded.recall).toBe(0.97);
  });

  it('an unvalidated ai_co_reviewer is stated factually — configured, not screening', () => {
    const block = assembleMethodsBlock(
      meta({ reviewMode: 'ai_co_reviewer', aiValidation: null }),
    );
    const ai = block.selection.find((s) => s.source === 'ai_validation');
    expect(ai?.text).toContain('has not yet passed recall validation');
    expect(ai?.text).toContain('has not screened');
  });

  it('never scolds the AI mode (factual register)', () => {
    const block = assembleMethodsBlock(
      meta({
        reviewMode: 'ai_co_reviewer',
        aiValidation: {
          model: 'm',
          version: 'v',
          recall: 0.96,
          sampleSize: 30,
        },
      }),
    );
    const text = allStatements(block)
      .map((s) => s.text)
      .join(' ');
    expect(text).not.toMatch(/warn|caution|risky|less rigorous|beware/i);
  });
});

describe('assembleMethodsBlock — Item 9 (data collection)', () => {
  it('states the recorded author-contact log', () => {
    const block = assembleMethodsBlock(meta());
    const contact = block.dataCollection.find((s) =>
      s.text.includes('authors were contacted'),
    );
    expect(contact?.text).toContain('2 fields');
    expect(contact?.text).toContain('1 study');
    expect(contact?.recorded.fieldsContacted).toBe(2);
  });

  it('states no contact factually when none is recorded', () => {
    const block = assembleMethodsBlock(
      meta({ authorContacts: { fields: 0, studies: 0 } }),
    );
    expect(
      block.dataCollection.some((s) =>
        s.text.includes('No study authors have been contacted'),
      ),
    ).toBe(true);
  });

  it('states the recorded extraction ladder counts and unresolved fields', () => {
    const block = assembleMethodsBlock(meta());
    const ladder = block.dataCollection.find((s) =>
      s.text.includes('Extraction disagreements were resolved'),
    );
    expect(ladder?.text).toContain('discussion (4 fields)');
    expect(ladder?.text).toContain('arbitrator (2 fields)');
    const unresolved = block.dataCollection.find((s) =>
      s.text.includes('unresolved'),
    );
    expect(unresolved?.text).toContain('1 field');
  });

  it('states the QC sampling rate from review settings', () => {
    const block = assembleMethodsBlock(meta({ qcSampleRate: 0.25 }));
    const qc = block.dataCollection.find((s) => s.source === 'review_settings');
    expect(qc?.text).toContain('25%');
    expect(qc?.recorded.qcSampleRate).toBe(0.25);
  });
});

describe('assembleMethodsBlock — Item 10 (data items)', () => {
  it('states the extraction template scope with the four explicit states', () => {
    const [items] = assembleMethodsBlock(meta()).dataItems;
    expect(items.text).toContain('9 items');
    expect(items.text).toContain('General information');
    expect(items.text).toContain('not reported');
    expect(items.text).toContain('derived');
  });
});
