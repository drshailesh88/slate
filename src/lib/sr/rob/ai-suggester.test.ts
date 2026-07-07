import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({ getDb: vi.fn() }));
vi.mock('@/lib/sr/ai', () => ({
  ensureAiReviewerUser: vi.fn(async () => 'ai-reviewer-id'),
}));
vi.mock('@/lib/sr/authz/ai-rob-write', () => ({
  suggestAiRobJudgements: vi.fn(async (args: { rows: unknown[] }) => ({
    suggested: args.rows.length,
  })),
}));

import { getDb } from '@/lib/db/client';
import { ensureAiReviewerUser } from '@/lib/sr/ai';
import { suggestAiRobJudgements } from '@/lib/sr/authz/ai-rob-write';
import { ROB2_DOMAINS } from './domains';
import {
  createDeterministicRobModel,
  runAiRobSuggestions,
  type RobSuggestInput,
} from './ai-suggester';

function primePool(rows: unknown[]) {
  const where = vi.fn(async () => rows);
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  (getDb as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ select });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createDeterministicRobModel', () => {
  const model = createDeterministicRobModel();

  function input(over: Partial<RobSuggestInput>): RobSuggestInput {
    return {
      studyId: 'st1',
      title: 'A trial',
      abstract: null,
      instrument: 'rob2',
      domainId: 'randomisation',
      domainName: '1 · Randomisation process',
      ...over,
    };
  }

  it('suggests a valid judgement with a non-empty, labeled support quote', async () => {
    const s = await model.suggest(input({}));
    expect(['low', 'some', 'high']).toContain(s.judgement);
    expect(s.supportQuote.length).toBeGreaterThan(0);
    expect(s.supportQuote).toMatch(/^AI:/);
  });

  it('claims Low only when the abstract signals adequate methods', async () => {
    const withSignal = await model.suggest(
      input({ abstract: 'Randomised via central allocation concealment.' }),
    );
    expect(withSignal.judgement).toBe('low');

    const withoutSignal = await model.suggest(
      input({ abstract: 'A study of outcomes.' }),
    );
    expect(withoutSignal.judgement).toBe('some');
  });

  it('never emits High from an abstract alone (needs a human read)', async () => {
    const s = await model.suggest(input({ abstract: 'terrible methods' }));
    expect(s.judgement).not.toBe('high');
  });
});

describe('runAiRobSuggestions', () => {
  it('writes one is_ai suggestion per (study, domain) via the authz writer', async () => {
    primePool([
      { id: 'st1', title: 'T1', abstract: 'randomised', robInstrument: 'rob2' },
      { id: 'st2', title: 'T2', abstract: null, robInstrument: 'rob2' },
    ]);

    const result = await runAiRobSuggestions({
      reviewId: 'rev-1',
      model: createDeterministicRobModel(),
      now: new Date('2026-03-03'),
    });

    // Two RoB 2 studies × five domains each.
    expect(result.suggested).toBe(2 * ROB2_DOMAINS.length);
    expect(ensureAiReviewerUser).toHaveBeenCalledWith('rev-1');

    const call = (suggestAiRobJudgements as unknown as ReturnType<typeof vi.fn>)
      .mock.calls[0][0] as {
      aiReviewerId: string;
      rows: Array<{ studyId: string; domain: string; supportQuote: string }>;
    };
    expect(call.aiReviewerId).toBe('ai-reviewer-id');
    expect(call.rows).toHaveLength(2 * ROB2_DOMAINS.length);
    // Every suggested row cites a domain of the instrument and carries a quote.
    const domainIds = new Set(ROB2_DOMAINS.map((d) => d.id));
    for (const row of call.rows) {
      expect(domainIds.has(row.domain)).toBe(true);
      expect(row.supportQuote.length).toBeGreaterThan(0);
    }
  });

  it('is an empty run when there are no studies', async () => {
    primePool([]);
    const result = await runAiRobSuggestions({
      reviewId: 'rev-1',
      model: createDeterministicRobModel(),
    });
    expect(result.suggested).toBe(0);
  });
});
