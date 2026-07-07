import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockGenerateText } = vi.hoisted(() => ({ mockGenerateText: vi.fn() }));
vi.mock("ai", () => ({ generateText: mockGenerateText }));
vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: () => ({ chat: (modelId: string) => ({ modelId }) }),
}));

import {
  sanitizeVariants,
  parseHydeResponse,
  isPaperLookupQuery,
  hasHyde,
  generateSearchVariants,
} from "../hyde";

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
afterEach(() => vi.unstubAllEnvs());

describe("sanitizeVariants — clean the LLM output", () => {
  it("drops an echo of the original query (case-insensitive), duplicates, and too-short strings", () => {
    const out = sanitizeVariants(
      ["SGLT2 inhibitors heart failure", "sglt2 INHIBITORS heart failure", "dapagliflozin HFrEF", "dapagliflozin HFrEF", "x"],
      "SGLT2 inhibitors heart failure",
      5
    );
    expect(out).toEqual(["dapagliflozin HFrEF"]);
  });

  it("caps at max and preserves order", () => {
    const out = sanitizeVariants(["a alpha", "b beta", "c gamma", "d delta"], "orig query", 2);
    expect(out).toEqual(["a alpha", "b beta"]);
  });
});

describe("parseHydeResponse — tolerant JSON extraction", () => {
  it("extracts JSON wrapped in a ```json code fence and surrounding prose", () => {
    const text = 'Sure!\n```json\n{"variants":["empagliflozin HFrEF"],"hypotheticalAbstract":"An RCT showed benefit."}\n```';
    const out = parseHydeResponse(text, "heart failure drugs", 3);
    expect(out.variants).toEqual(["empagliflozin HFrEF"]);
    expect(out.hypotheticalAbstract).toBe("An RCT showed benefit.");
  });

  it("throws when there is no JSON object (so the caller fails open)", () => {
    expect(() => parseHydeResponse("I cannot help with that.", "q", 3)).toThrow();
  });
});

describe("isPaperLookupQuery — gate HyDE off where it can't help", () => {
  it("gates a pasted paper TITLE (long, Title-Cased, no question)", () => {
    expect(isPaperLookupQuery("Dexamethasone in Hospitalized Patients with Covid-19 RECOVERY")).toBe(true);
    expect(isPaperLookupQuery("Pembrolizumab plus Chemotherapy in Metastatic Non-Small-Cell Lung Cancer")).toBe(true);
  });

  it("gates a bare DOI or PMID identifier", () => {
    expect(isPaperLookupQuery("10.1056/NEJMoa2034577")).toBe(true);
    expect(isPaperLookupQuery("33301246")).toBe(true);
  });

  it("does NOT gate an under-specified topic / PICO query (HyDE should run)", () => {
    expect(isPaperLookupQuery("management of heart failure with reduced ejection fraction")).toBe(false);
    expect(isPaperLookupQuery("SGLT2 inhibitors cardiovascular outcomes")).toBe(false);
    expect(isPaperLookupQuery("does early goal-directed therapy reduce mortality in septic shock?")).toBe(false);
    expect(isPaperLookupQuery("drugs that help the failing heart")).toBe(false);
  });
});

describe("hasHyde", () => {
  it("reflects DEEPSEEK_API_KEY presence", () => {
    expect(hasHyde()).toBe(false);
    vi.stubEnv("DEEPSEEK_API_KEY", "sk-test");
    expect(hasHyde()).toBe(true);
  });
});

describe("generateSearchVariants — fail-open, cached LLM expansion", () => {
  it("returns empty (no LLM call) when no DEEPSEEK_API_KEY is set", async () => {
    const out = await generateSearchVariants("statin myopathy risk in elderly");
    expect(out).toEqual({ variants: [] });
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("returns sanitized variants + hypothetical abstract on success, and caches the query", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "sk-test");
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({
        variants: ["empagliflozin cardiovascular outcomes", "broad cardio dementia query unique-1"],
        hypotheticalAbstract: "In a randomized trial, the SGLT2 inhibitor reduced cardiovascular death.",
      }),
    });

    const first = await generateSearchVariants("broad cardio dementia query unique-1");
    expect(first.variants).toEqual(["empagliflozin cardiovascular outcomes"]); // echo of original dropped
    expect(first.hypotheticalAbstract).toContain("SGLT2 inhibitor");

    // Same query again → served from cache, no second LLM call.
    const second = await generateSearchVariants("broad cardio dementia query unique-1");
    expect(second).toEqual(first);
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });

  it("fails open to empty when the LLM call throws", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "sk-test");
    mockGenerateText.mockRejectedValue(new Error("deepseek 503"));
    const out = await generateSearchVariants("unique throwing query xyz");
    expect(out).toEqual({ variants: [] });
  });

  it("fails open to empty when the LLM returns unparseable text", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "sk-test");
    mockGenerateText.mockResolvedValue({ text: "I cannot help with that." });
    const out = await generateSearchVariants("unique unparseable query qrs");
    expect(out).toEqual({ variants: [] });
  });
});
