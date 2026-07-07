import { createOpenAI } from "@ai-sdk/openai";
import { getLangfuse, isLangfuseConfigured } from "@/lib/langfuse";

// ── Provider selection ─────────────────────────────────────────────
// Set AI_PROVIDER="zhipu" to use GLM-5, otherwise defaults to "anthropic" (Claude).
// Each provider reads its own env key:
//   anthropic → ANTHROPIC_API_KEY
//   zhipu     → ZHIPU_API_KEY

type Provider = "zhipu" | "anthropic" | "openai";

export const AI_PROVIDER: Provider =
  (process.env.AI_PROVIDER as Provider) === "zhipu"
    ? "zhipu"
    : (process.env.AI_PROVIDER as Provider) === "openai"
      ? "openai"
      : "anthropic";

// ── Lazy-initialised clients (created once, reused) ────────────────
let _openai: ReturnType<typeof createOpenAI> | null = null;

function getOpenAI() {
  if (!_openai) {
    _openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  }
  return _openai;
}

// DeepSeek is OpenAI-compatible — used only as the small-model FALLBACK (below).
let _deepseek: ReturnType<typeof createOpenAI> | null = null;
function getDeepSeek() {
  if (!_deepseek) {
    _deepseek = createOpenAI({
      baseURL: "https://api.deepseek.com",
      apiKey: process.env.DEEPSEEK_API_KEY!,
    });
  }
  return _deepseek;
}

/**
 * The single fast, funded default — DeepSeek V4 Flash — used EVERYWHERE except
 * deep-research synthesis (which keeps GPT-5.2). Frontier inference cost isn't falling
 * and the stakes on most calls are low, so one cheap fast model is the default. Override
 * the id with DEEPSEEK_MODEL.
 */
function deepseekFast() {
  return getDeepSeek().chat(process.env.DEEPSEEK_MODEL || "deepseek-v4-flash");
}

// ── LangFuse tracing helper ────────────────────────────────────────
// Creates a LangFuse trace for each model invocation.
// Call traceGeneration() before your LLM call, end it after.
// When LangFuse is not configured, returns no-ops.

export function traceGeneration(meta: {
  tier: string;
  modelId: string;
  feature?: string;
  userId?: string;
  projectId?: number;
}) {
  const trace = isLangfuseConfigured()
    ? getLangfuse().trace({
        name: `llm-${meta.tier}`,
        metadata: { tier: meta.tier, provider: AI_PROVIDER, feature: meta.feature },
      })
    : null;
  const generation = trace?.generation({
    name: meta.modelId,
    model: meta.modelId,
  });

  function writeCost(inputTokens: number, outputTokens: number) {
    if (meta.userId && (inputTokens || outputTokens)) {
      import("@/lib/ai/cost-tracker").then(({ trackAIUsage }) => {
        trackAIUsage({
          userId: meta.userId!,
          modelId: meta.modelId,
          feature: meta.feature ?? `llm-${meta.tier}`,
          inputTokens,
          outputTokens,
          projectId: meta.projectId,
        });
      });
    }
  }

  return {
    end(usage?: Record<string, unknown>) {
      const input = (usage?.promptTokens ?? usage?.inputTokens ?? 0) as number;
      const output = (usage?.completionTokens ?? usage?.outputTokens ?? 0) as number;
      generation?.end({
        usage: usage ? { input, output } : undefined,
      });
      writeCost(input, output);
    },
    error(err: unknown) {
      generation?.end({ level: "ERROR", statusMessage: String(err) });
    },
  };
}

// ── Public helpers ─────────────────────────────────────────────────

/** Returns true when the active provider's API key is set. */
export function isAIConfigured(): boolean {
  return !!process.env.DEEPSEEK_API_KEY;
}

/** Human-readable name of the env var needed for the default model. */
export function requiredKeyName(): string {
  return "DEEPSEEK_API_KEY";
}

// ── Model factories ────────────────────────────────────────────────

/** Main workhorse model for standard AI tasks (drafting, chat, extraction). */
export function getModel() {
  return deepseekFast();
}

/** Cheap model for simple tasks (classification, formatting, summaries). */
export function getSmallModel() {
  return deepseekFast();
}

/**
 * Fast, high-quality model for LATENCY-SENSITIVE structured tasks (video notes). The
 * provider default can be slow (GLM-5 measured ~110s on a lecture transcript), which is
 * unusable for an interactive reading room. Prefer Anthropic Haiku (fast + strong on
 * structured JSON), then DeepSeek V4 Flash, then the provider small model — independent of
 * AI_PROVIDER so a slow default never gates the UI.
 */
export function getFastNotesModel() {
  return deepseekFast();
}

/**
 * Funded fallback for the small-model tasks (deep-research extraction/perspectives)
 * when the {@link getSmallModel} provider errors — e.g. a dead or throttled key that
 * would otherwise SILENTLY zero the evidence tables. DeepSeek V4 Flash (cheap, fast)
 * via its OpenAI-compatible /chat/completions endpoint (`.chat()`); overridable with
 * DEEPSEEK_MODEL. Returns null when DEEPSEEK_API_KEY is unset (no fallback available).
 */
export function getSmallModelFallback() {
  if (!process.env.DEEPSEEK_API_KEY) return null;
  return getDeepSeek().chat(process.env.DEEPSEEK_MODEL || "deepseek-v4-flash");
}

/** High-quality model for complex reasoning (deep research, analysis). */
export function getBigModel() {
  return deepseekFast();
}

/** GPT-5.2 for deep research synthesis — best reasoning per dollar. */
export function getDeepResearchModel() {
  return getOpenAI()("gpt-5.2");
}

/** Claude Sonnet for LaTeX writing tasks — Draft mode, complex edits, TikZ.
 *  This is where users feel the quality difference vs Prism (GPT-5.2). */
export function getLatexWriteModel() {
  return deepseekFast();
}

/** GPT-5 Nano for mechanical LaTeX tasks — grammar fixes, equation gen, error fixes.
 *  20x cheaper than Haiku ($0.05 vs $1.00 input). Same quality for structured output. */
export function getLatexUtilModel() {
  return deepseekFast();
}
