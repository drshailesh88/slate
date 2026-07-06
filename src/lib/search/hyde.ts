/**
 * LLM query expansion (HyDE + multi-query) for under-specified searches.
 *
 * A short or natural-language query ("drugs that help the failing heart") often
 * misses landmark papers that use precise terms (generic drug names, MeSH, trial
 * outcomes). One cheap LLM call (DeepSeek, OpenAI-compatible) produces:
 *   - a few alternative QUERY formulations (multi-query — synonyms, drug-class ↔
 *     generic, MeSH phrasing), run as extra retrieval lanes and RRF-fused, and
 *   - a 1–2 sentence HYPOTHETICAL ABSTRACT (HyDE) — the text a perfectly-relevant
 *     paper would contain — embedded by the dense lane to retrieve by meaning.
 *
 * Fail-open and OFF by default: with no DEEPSEEK_API_KEY, or on any error, it
 * returns no variants and the caller searches the original query exactly as
 * before. Results are cached per normalized query so repeats cost nothing.
 */

import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { z } from "zod";

const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
// DeepSeek V4 Flash: fast + cheap, the right tier for a single per-query expansion
// call. Overridable via DEEPSEEK_MODEL (e.g. "deepseek-v4-pro") without a code change.
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
const MAX_VARIANTS = 3;

export interface HydeResult {
  /** Alternative query formulations (cleaned, deduped, original excluded). */
  variants: string[];
  /** A short hypothetical abstract for HyDE dense retrieval (absent on failure). */
  hypotheticalAbstract?: string;
}

const HydeSchema = z.object({
  variants: z.array(z.string()),
  hypotheticalAbstract: z.string(),
});

const cache = new Map<string, HydeResult>();

/** True when LLM expansion is configured (DeepSeek key present). */
export function hasHyde(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

const DOI_RE = /\b10\.\d{4,9}\/\S+/;
const PMID_RE = /^\d{7,8}$/;

/**
 * True when the query is a SPECIFIC paper lookup — a DOI, a bare PMID, or a pasted
 * paper TITLE (long, predominantly Title-Cased, not a question). HyDE can't help
 * here: the target is already known, so expansion only adds latency/cost (and the
 * exact-title boost downstream already floats the right paper). Conservative by
 * design — it must NOT fire on under-specified topic/PICO queries, where HyDE earns
 * its keep, so a lowercase/keyword/question query is never treated as a lookup.
 */
export function isPaperLookupQuery(query: string): boolean {
  const q = query.trim();
  if (!q) return false;
  if (DOI_RE.test(q)) return true;
  if (PMID_RE.test(q)) return true;
  if (q.includes("?")) return false;
  const words = q.split(/\s+/);
  if (words.length < 6) return false;
  // Significant words = real words (>3 chars, contain a letter). A pasted title is
  // mostly Title-Cased; a typed topic query is mostly lowercase.
  const sig = words.filter((w) => w.length > 3 && /[a-z]/i.test(w));
  if (sig.length < 4) return false;
  const capitalized = sig.filter((w) => /^[A-Z]/.test(w)).length;
  return capitalized / sig.length >= 0.6;
}

/**
 * Clean raw LLM variants: trim, drop strings shorter than 3 chars, drop the echo
 * of the original query and any duplicates (case-insensitive), preserve order,
 * and cap at `max`. Pure — the deterministic half of the expansion.
 */
export function sanitizeVariants(raw: string[], original: string, max: number): string[] {
  const seen = new Set<string>([original.trim().toLowerCase()]);
  const out: string[] = [];
  for (const v of raw) {
    const t = (v ?? "").trim();
    if (t.length < 3) continue;
    const norm = t.toLowerCase();
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Parse + validate the model's JSON reply into a clean HydeResult. Tolerates code
 * fences and surrounding prose by extracting the outermost `{…}`. Throws on missing
 * or invalid JSON so the caller can fail open. Pure (no network).
 */
export function parseHydeResponse(text: string, original: string, max: number): HydeResult {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object in HyDE response");
  const parsed = HydeSchema.parse(JSON.parse(cleaned.slice(start, end + 1)));
  return {
    variants: sanitizeVariants(parsed.variants, original, max),
    hypotheticalAbstract: parsed.hypotheticalAbstract.trim() || undefined,
  };
}

function buildPrompt(query: string): string {
  return [
    "You are a biomedical literature-search assistant.",
    `Original query: "${query}"`,
    "",
    `Generate up to ${MAX_VARIANTS} ALTERNATIVE search-query formulations that would`,
    "surface the most relevant primary literature — expand drug classes to their",
    "generic names, add MeSH-style phrasing and key synonyms. Each must be a concise",
    "search query (not a sentence) and differ from the original. Also write a 1–2",
    "sentence HYPOTHETICAL ABSTRACT: the text a perfectly-relevant paper answering",
    "this query would contain, using precise clinical terms.",
    "",
    "Respond with ONLY a JSON object of this exact shape, no prose:",
    '{"variants": ["...", "..."], "hypotheticalAbstract": "..."}',
  ].join("\n");
}

/**
 * Generate LLM query variants + a hypothetical abstract for a query. Fail-open:
 * returns `{ variants: [] }` with no LLM call when unconfigured, and on any error.
 * Cached per normalized query.
 */
export async function generateSearchVariants(query: string): Promise<HydeResult> {
  const trimmed = query.trim();
  if (!hasHyde() || trimmed.length === 0) return { variants: [] };

  const key = trimmed.toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;

  try {
    const deepseek = createOpenAI({
      baseURL: DEEPSEEK_BASE_URL,
      apiKey: process.env.DEEPSEEK_API_KEY,
    });
    // `.chat()` targets /chat/completions — DeepSeek's OpenAI-compatible endpoint
    // (the provider's default model call uses the newer /responses API, which
    // DeepSeek does not implement). generateText + manual JSON parse, because
    // DeepSeek rejects the json_schema response_format that generateObject emits.
    const { text } = await generateText({
      model: deepseek.chat(DEEPSEEK_MODEL),
      prompt: buildPrompt(trimmed),
    });
    const result = parseHydeResponse(text, trimmed, MAX_VARIANTS);
    cache.set(key, result);
    return result;
  } catch (error) {
    console.error("HyDE expansion failed (fail-open):", error);
    return { variants: [] };
  }
}
