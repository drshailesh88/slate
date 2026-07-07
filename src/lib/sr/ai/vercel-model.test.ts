import { describe, expect, it } from 'vitest';
import { MockLanguageModelV4 } from 'ai/test';
import { createVercelScreeningModel } from './vercel-model';
import type { AiScreeningInput } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// The LIVE adapter, proven against the AI SDK's OWN mock model (no network, no
// key). We assert the adapter maps `generateObject` output onto the port's
// { decision, reasoning } shape — and that a score, even if a model tried to
// emit one, is not part of the returned verdict (the schema has no score field).
// ─────────────────────────────────────────────────────────────────────────────

function input(): AiScreeningInput {
  return {
    studyId: 'st1',
    title: 'Empagliflozin in HFpEF',
    abstract: 'A randomized trial in adults with preserved ejection fraction.',
    researchQuestion: 'Do SGLT2 inhibitors help HFpEF?',
    criteria: ['adults with HFpEF', 'randomized controlled trial'],
  };
}

function mockReturning(json: string) {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text', text: json }],
      finishReason: 'stop',
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      warnings: [],
    }),
  });
}

describe('createVercelScreeningModel', () => {
  it('maps a structured include verdict onto the port shape', async () => {
    const model = createVercelScreeningModel({
      model: mockReturning(
        JSON.stringify({
          decision: 'include',
          reasoning: 'RCT in HFpEF adults',
        }),
      ),
      version: 'test',
    });

    const verdict = await model.screen(input());
    expect(verdict.decision).toBe('include');
    expect(verdict.reasoning).toBe('RCT in HFpEF adults');
    // No score field is ever produced by the adapter.
    expect(Object.keys(verdict).sort()).toEqual(['decision', 'reasoning']);
  });

  it('passes through an exclude verdict with its reasoning', async () => {
    const model = createVercelScreeningModel({
      model: mockReturning(
        JSON.stringify({ decision: 'exclude', reasoning: 'wrong population' }),
      ),
    });
    const verdict = await model.screen(input());
    expect(verdict.decision).toBe('exclude');
    expect(verdict.reasoning).toBe('wrong population');
  });

  it('exposes a model id for the ai_validations audit row', () => {
    const model = createVercelScreeningModel({
      model: mockReturning('{}'),
      version: 'v2',
    });
    expect(typeof model.model).toBe('string');
    expect(model.version).toBe('v2');
  });
});
