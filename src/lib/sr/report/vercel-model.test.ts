import { describe, expect, it } from 'vitest';
import { MockLanguageModelV4 } from 'ai/test';
import { createVercelReportDraftModel } from './vercel-model';
import type { ReportDraftInput } from './draft';

// ─────────────────────────────────────────────────────────────────────────────
// The LIVE draft adapter, proven against the AI SDK's OWN mock model (no
// network, no key). The adapter only shapes I/O — grounding is enforced
// downstream in draft.ts regardless of what the model returns.
// ─────────────────────────────────────────────────────────────────────────────

function input(): ReportDraftInput {
  return {
    reviewTitle: 'SGLT2 inhibitors in heart failure',
    reviewType: 'Intervention review',
    sources: [
      {
        key: 'C:identified',
        label: 'Records identified',
        description: 'Records identified: 412',
        allowedNumbers: [412],
      },
    ],
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

describe('createVercelReportDraftModel', () => {
  it('maps structured sections onto the port shape', async () => {
    const model = createVercelReportDraftModel({
      model: mockReturning(
        JSON.stringify({
          sections: [
            {
              id: 'abstract',
              sentences: [
                {
                  text: 'Records identified: 412.',
                  citationKeys: ['C:identified'],
                },
              ],
            },
          ],
        }),
      ),
      version: 'test',
    });

    const raw = await model.draft(input());
    expect(raw.sections).toHaveLength(1);
    expect(raw.sections[0].id).toBe('abstract');
    expect(raw.sections[0].sentences[0].citationKeys).toEqual(['C:identified']);
  });

  it('exposes a model id + version for the draft label', () => {
    const model = createVercelReportDraftModel({
      model: mockReturning('{"sections":[]}'),
      version: 'v2',
    });
    expect(typeof model.model).toBe('string');
    expect(model.version).toBe('v2');
  });
});
