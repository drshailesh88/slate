import type {
  AiScreeningInput,
  AiScreeningVerdict,
  ScreeningModel,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic fake ScreeningModel — the LLM stand-in for tests and dev.
//
// It runs the SAME orchestration the live model does (validation gate, blinding,
// casting), with NO network and NO key, so every safeguard is provable offline.
// The live Vercel AI SDK adapter (vercel-model.ts) is swapped in only when the
// founder provisions the provider key.
//
// Verdicts are resolved deterministically: an explicit per-study override first,
// then a keyword heuristic over title/abstract against the criteria, then a
// caller-chosen default. It never emits a score — none exists in the contract.
// ─────────────────────────────────────────────────────────────────────────────

export interface DeterministicModelOptions {
  model?: string;
  version?: string;
  /** Force a specific verdict for a study id (highest priority). */
  verdicts?: Record<string, AiScreeningVerdict>;
  /** Verdict when nothing else matches. Defaults to a cautious `maybe`. */
  fallbackDecision?: AiScreeningVerdict['decision'];
}

function keywordVerdict(input: AiScreeningInput): AiScreeningVerdict | null {
  const haystack = `${input.title} ${input.abstract ?? ''}`.toLowerCase();
  const terms = input.criteria
    .flatMap((c) => c.toLowerCase().split(/[^a-z0-9]+/))
    .filter((w) => w.length >= 4);
  if (terms.length === 0) return null;
  const hit = terms.some((term) => haystack.includes(term));
  return hit
    ? { decision: 'include', reasoning: 'Matches a protocol eligibility term.' }
    : null;
}

export function createDeterministicScreeningModel(
  opts: DeterministicModelOptions = {},
): ScreeningModel {
  const fallback = opts.fallbackDecision ?? 'maybe';
  return {
    model: opts.model ?? 'mock-screening-model',
    version: opts.version ?? 'test-1',
    async screen(input: AiScreeningInput): Promise<AiScreeningVerdict> {
      const forced = opts.verdicts?.[input.studyId];
      if (forced) return forced;
      const keyword = keywordVerdict(input);
      if (keyword) return keyword;
      return {
        decision: fallback,
        reasoning: 'No eligibility term matched; deferred by the mock model.',
      };
    },
  };
}
