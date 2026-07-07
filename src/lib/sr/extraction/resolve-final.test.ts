import { describe, expect, it } from 'vitest';
import { entriesAgree, resolveFinal } from './resolve-final';

// ─────────────────────────────────────────────────────────────────────────────
// The CORRECTED resolveFinal (T15). The precursor
// (src/lib/sr/extraction.ts:27-31) had a `kind:"ai"` branch that returned the AI
// value as Final when there was no conflict — the anti-pattern the spec orders
// removed (EXTRACTION-AND-TEAM-spec.md §6). These tests pin the corrected
// contract: Final is EMPTY until a human picks; `agreed` is the human value,
// never the AI's; the AI is not even an input, so it can never be Final.
// ─────────────────────────────────────────────────────────────────────────────

const reported = (value: string) => ({ value, state: 'reported' as const });
const notReported = { value: null, state: 'not_reported' as const };

describe('resolveFinal — agreed (both human reviewers matched)', () => {
  it('returns kind:agreed with the human value when both reviewers match', () => {
    const final = resolveFinal({
      reviewer1: reported('120'),
      reviewer2: reported('120'),
      consensus: null,
    });
    expect(final).toEqual({ kind: 'agreed', value: '120', state: 'reported' });
  });

  it('agreed value is the HUMAN value — never the AI value (agreed ≠ AI)', () => {
    // The corrected function does not accept an AI argument at all, so there is
    // structurally no way for an AI value to become the Final. Both reviewers
    // agree on "120"; whatever the AI said is irrelevant to Final.
    const final = resolveFinal({
      reviewer1: reported('120'),
      reviewer2: reported('120'),
      consensus: null,
    });
    expect(final.kind).toBe('agreed');
    if (final.kind === 'agreed') expect(final.value).toBe('120');
  });

  it('two matching not_reported states agree — and stay null, never 0', () => {
    const final = resolveFinal({
      reviewer1: notReported,
      reviewer2: notReported,
      consensus: null,
    });
    expect(final).toEqual({
      kind: 'agreed',
      value: null,
      state: 'not_reported',
    });
    // Explicitly: an agreed "not reported" is not a zero.
    if (final.kind === 'agreed') expect(final.value).not.toBe('0');
  });
});

describe('resolveFinal — conflict (Final starts EMPTY)', () => {
  it('disagreeing values → conflict with value null (empty until a human picks)', () => {
    const final = resolveFinal({
      reviewer1: reported('120'),
      reviewer2: reported('96'),
      consensus: null,
    });
    expect(final).toEqual({ kind: 'conflict', value: null });
  });

  it('same value but different state is a conflict, not agreement', () => {
    const final = resolveFinal({
      reviewer1: reported('0'),
      reviewer2: { value: null, state: 'not_reported' },
      consensus: null,
    });
    // "0 events reported" vs "not reported" must NOT collapse to agreement.
    expect(final).toEqual({ kind: 'conflict', value: null });
  });

  it('a missing reviewer entry is a conflict, never auto-filled', () => {
    const final = resolveFinal({
      reviewer1: reported('120'),
      reviewer2: null,
      consensus: null,
    });
    expect(final).toEqual({ kind: 'conflict', value: null });
  });

  it('THE CORRECTION: an AI value can never be Final — a lone value stays a conflict', () => {
    // Precursor behaviour returned aiFinal.value here. The corrected function has
    // no AI input, so with both human sides missing Final is empty.
    const final = resolveFinal({
      reviewer1: null,
      reviewer2: null,
      consensus: null,
    });
    expect(final).toEqual({ kind: 'conflict', value: null });
  });
});

describe('resolveFinal — resolved (an explicit human pick)', () => {
  it('a recorded consensus becomes kind:resolved with its value', () => {
    const final = resolveFinal({
      reviewer1: reported('120'),
      reviewer2: reported('96'),
      consensus: {
        value: '108',
        state: 'reported',
        resolutionMethod: 'discuss',
      },
    });
    expect(final).toEqual({
      kind: 'resolved',
      value: '108',
      state: 'reported',
    });
  });

  it('a recorded consensus that picked the AI value is still kind:resolved (a human acted)', () => {
    const final = resolveFinal({
      reviewer1: reported('120'),
      reviewer2: reported('96'),
      consensus: {
        value: '108',
        state: 'reported',
        resolutionMethod: 'arbitrator',
      },
    });
    expect(final.kind).toBe('resolved');
  });

  it('a recorded-UNRESOLVED consensus keeps Final empty (conflict), never a value', () => {
    const final = resolveFinal({
      reviewer1: reported('120'),
      reviewer2: reported('96'),
      consensus: {
        value: null,
        state: 'unclear',
        resolutionMethod: 'unresolved',
      },
    });
    expect(final).toEqual({ kind: 'conflict', value: null });
  });
});

describe('entriesAgree', () => {
  it('agrees on identical reported values (whitespace-insensitive)', () => {
    expect(entriesAgree(reported(' 120 '), reported('120'))).toBe(true);
  });
  it('disagrees on different reported values', () => {
    expect(entriesAgree(reported('120'), reported('96'))).toBe(false);
  });
  it('two reported entries with empty values do not agree (nothing to agree on)', () => {
    expect(
      entriesAgree(
        { value: '', state: 'reported' },
        { value: '', state: 'reported' },
      ),
    ).toBe(false);
  });
  it('matching non-reported states agree regardless of value', () => {
    expect(entriesAgree(notReported, notReported)).toBe(true);
    expect(
      entriesAgree({ value: null, state: 'na' }, { value: null, state: 'na' }),
    ).toBe(true);
  });
  it('different states never agree', () => {
    expect(entriesAgree(notReported, { value: null, state: 'na' })).toBe(false);
  });
});
