import { generateObject } from 'ai';
import type { LanguageModel } from 'ai';
import { z } from 'zod';
import { getConfiguredAiModelId } from './config';
import type {
  AiScreeningInput,
  AiScreeningVerdict,
  ScreeningModel,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// The LIVE ScreeningModel — the ONLY file that touches the Vercel AI SDK. It
// maps the port (types.ts) onto `generateObject` with a Zod schema, so the model
// is forced to return exactly a { decision, reasoning } object.
//
// SCORE IS NEVER REQUESTED. The schema has no score/confidence field — the model
// is not even asked for one, so it cannot leak (FOUNDATION-auth-tenancy.md §8).
//
// The model id is a Vercel AI Gateway "provider/model" string (config.ts /
// SR_AI_MODEL). The provider key is FOUNDER-PROVISIONED (see AGENTS.md) — without
// it, `generateObject` fails at call time; build + tests use the deterministic
// mock model (mock-model.ts) and this adapter is proven against the SDK's own
// MockLanguageModel in vercel-model.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

const verdictSchema = z.object({
  decision: z
    .enum(['include', 'exclude', 'maybe'])
    .describe(
      'include = meets the eligibility criteria; exclude = clearly ineligible; maybe = uncertain, keep for a human to decide.',
    ),
  reasoning: z
    .string()
    .describe(
      'A brief justification tied to the eligibility criteria. Revealed to humans only at reconciliation.',
    ),
});

const SYSTEM_PROMPT =
  'You are a blinded screening reviewer for a systematic review. Decide whether each record should be included, excluded, or marked maybe, judged ONLY against the supplied research question and eligibility criteria. Prefer `maybe` over `exclude` when uncertain — never exclude a record that might be eligible. Do not output any numeric score or confidence.';

function buildPrompt(input: AiScreeningInput): string {
  const criteria = input.criteria.length
    ? input.criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')
    : '(none provided)';
  return [
    `Research question: ${input.researchQuestion}`,
    '',
    'Eligibility criteria:',
    criteria,
    '',
    'Record to screen:',
    `Title: ${input.title}`,
    `Abstract: ${input.abstract ?? '(no abstract available)'}`,
    input.journal ? `Journal: ${input.journal}` : '',
    input.year ? `Year: ${input.year}` : '',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

export interface VercelScreeningModelOptions {
  /** AI Gateway "provider/model" string or a LanguageModel. Defaults to config. */
  model?: LanguageModel;
  /** Recorded as the ai_validations `version` (what ran). */
  version?: string;
}

export function createVercelScreeningModel(
  opts: VercelScreeningModelOptions = {},
): ScreeningModel {
  const model: LanguageModel = opts.model ?? getConfiguredAiModelId();
  const modelId = typeof model === 'string' ? model : model.modelId;

  return {
    model: modelId,
    version: opts.version ?? process.env.SR_AI_MODEL_VERSION ?? 'gateway',
    async screen(input: AiScreeningInput): Promise<AiScreeningVerdict> {
      const { object } = await generateObject({
        model,
        schema: verdictSchema,
        system: SYSTEM_PROMPT,
        prompt: buildPrompt(input),
      });
      return { decision: object.decision, reasoning: object.reasoning };
    },
  };
}
