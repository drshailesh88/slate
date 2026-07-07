import { generateObject } from 'ai';
import type { LanguageModel } from 'ai';
import { z } from 'zod';
import { getConfiguredAiModelId } from '@/lib/sr/ai/config';
import type { ReportDraftInput, ReportDraftModel } from './draft';

// ─────────────────────────────────────────────────────────────────────────────
// The LIVE ReportDraftModel — the report module's only Vercel AI SDK call site
// (the screening twin is src/lib/sr/ai/vercel-model.ts). `generateObject` +
// a Zod schema force the model to return sections of citation-tagged sentences;
// everything it returns still passes the grounding gate in draft.ts — the SDK
// schema is shape enforcement, the gate is truth enforcement.
//
// The model id is the same founder-provisioned AI Gateway config the screening
// reviewer uses (SR_AI_MODEL). Without the key, drafting fails at call time
// with an actionable message; build + tests use mock-model.ts.
// ─────────────────────────────────────────────────────────────────────────────

const draftSchema = z.object({
  sections: z.array(
    z.object({
      id: z
        .string()
        .describe('Section id: only "abstract" or "findings" are accepted.'),
      sentences: z.array(
        z.object({
          text: z
            .string()
            .describe(
              'One sentence. Use ONLY numbers that appear in the cited sources.',
            ),
          citationKeys: z
            .array(z.string())
            .describe(
              'Keys of the sources this sentence draws on (at least one).',
            ),
        }),
      ),
    }),
  ),
});

const INSTRUCTIONS =
  'You draft prose for a systematic-review report. You are given a closed table of grounded sources — the review\'s own recorded data. Rules, all hard: (1) every sentence must cite at least one source key from the table; (2) never use a number that does not appear in a cited source; (3) never draw a conclusion, recommendation, synthesis of effect, or certainty/GRADE judgement — those belong to the human authors; (4) produce exactly two sections, "abstract" and "findings", that restate what the sources record. Neutral, factual register.';

function buildPrompt(input: ReportDraftInput): string {
  const table = input.sources
    .map((s) => `${s.key} — ${s.label}: ${s.description}`)
    .join('\n');
  return [
    `Review: ${input.reviewTitle}`,
    `Review type: ${input.reviewType}`,
    '',
    'Grounded sources (the ONLY material you may use):',
    table,
  ].join('\n');
}

export interface VercelReportDraftModelOptions {
  /** AI Gateway "provider/model" string or a LanguageModel. Defaults to config. */
  model?: LanguageModel;
  version?: string;
}

export function createVercelReportDraftModel(
  opts: VercelReportDraftModelOptions = {},
): ReportDraftModel {
  const model: LanguageModel = opts.model ?? getConfiguredAiModelId();
  const modelId = typeof model === 'string' ? model : model.modelId;

  return {
    model: modelId,
    version: opts.version ?? process.env.SR_AI_MODEL_VERSION ?? 'gateway',
    async draft(input: ReportDraftInput) {
      const { object } = await generateObject({
        model,
        schema: draftSchema,
        instructions: INSTRUCTIONS,
        prompt: buildPrompt(input),
      });
      return object;
    },
  };
}
