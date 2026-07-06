import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { UnifiedSearchResult } from "@/types/search";
import { rerankResults, attachRerankScores, hasReranker } from "../rerank";

const { mockResilientFetch } = vi.hoisted(() => ({ mockResilientFetch: vi.fn() }));

vi.mock("@/lib/http/resilient-fetch", () => ({
  resilientFetch: mockResilientFetch,
}));

const OPENROUTER_KEY = "openrouter_test_key";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/rerank";
const MEDCPT_URL = "https://example-medcpt-rerank.modal.run";
const COHERE_KEY = "cohere_test_key";
const COHERE_URL = "https://api.cohere.com/v2/rerank";

function jsonResponse(body: unknown) {
  return { json: () => Promise.resolve(body) } as unknown as Response;
}

/** OpenRouter / Cohere v2 shape: results sorted by relevance, each pairing back to
 * an input document via `index`. */
function rerankResponse(pairs: [number, number][]) {
  return jsonResponse({
    results: pairs.map(([index, relevance_score]) => ({ index, relevance_score })),
    usage: { search_units: 1, cost: 0.0025 },
  });
}

function paper(title: string): UnifiedSearchResult {
  return {
    title,
    authors: [],
    journal: "",
    year: 2024,
    citationCount: 0,
    isOpenAccess: false,
    openAccessPdfUrl: null,
    publicationTypes: [],
    sources: ["pubmed"],
  } as UnifiedSearchResult;
}

const RESULTS = [paper("A relevance low"), paper("B relevance high"), paper("C relevance mid")];

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("rerankResults — literature reranker chain (MedCPT-primary, free-first)", () => {
  it("maps relevance_score back to each input document by index and sorts desc", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", OPENROUTER_KEY);
    // OpenRouter returns top_n results already sorted by relevance: B (idx 1) > C
    // (idx 2) > A (idx 0). Each score is a [0,1] relevance probability used as-is.
    mockResilientFetch.mockResolvedValueOnce(
      rerankResponse([
        [1, 0.91],
        [2, 0.5],
        [0, 0.12],
      ])
    );

    const out = await rerankResults("q", RESULTS);

    expect(out.map((r) => r.title)).toEqual([
      "B relevance high",
      "C relevance mid",
      "A relevance low",
    ]);
    // relevance_score is carried through verbatim onto rerankScore (no squashing).
    expect(out[0].rerankScore).toBe(0.91);
    expect(out[1].rerankScore).toBe(0.5);
    expect(out[2].rerankScore).toBe(0.12);

    const [url, init] = mockResilientFetch.mock.calls[0];
    expect(url).toBe(OPENROUTER_URL);
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      model: "cohere/rerank-4-pro",
      query: "q",
      documents: ["A relevance low. ", "B relevance high. ", "C relevance mid. "],
      top_n: 3,
    });
    expect(init.headers.Authorization).toBe(`Bearer ${OPENROUTER_KEY}`);
  });

  it("ACADEMIC_RERANK_MODEL overrides the default model", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", OPENROUTER_KEY);
    vi.stubEnv("ACADEMIC_RERANK_MODEL", "cohere/rerank-4-experimental");
    mockResilientFetch.mockResolvedValueOnce(rerankResponse([[0, 0.4]]));

    await rerankResults("q", RESULTS);

    const body = JSON.parse(mockResilientFetch.mock.calls[0][1].body as string);
    expect(body.model).toBe("cohere/rerank-4-experimental");
  });

  it("MedCPT (free self-hosted) is PREFERRED over paid OpenRouter and Cohere for literature", async () => {
    // Free-first: when the self-hosted MedCPT URL is present it is the primary; the
    // paid lanes are never called unless it fails. No opt-in flag required.
    vi.stubEnv("MEDCPT_RERANK_URL", MEDCPT_URL);
    vi.stubEnv("OPENROUTER_API_KEY", OPENROUTER_KEY);
    vi.stubEnv("COHERE_API_KEY", COHERE_KEY);
    // MedCPT returns raw logits in INPUT order.
    mockResilientFetch.mockResolvedValueOnce(jsonResponse({ scores: [0.1, 4, 1] }));

    await rerankResults("q", RESULTS);

    expect(mockResilientFetch).toHaveBeenCalledTimes(1);
    expect(mockResilientFetch.mock.calls[0][0]).toBe(MEDCPT_URL);
  });

  it("uses MedCPT by default (no flag) and only falls to a paid lane when it fails", async () => {
    // MedCPT present WITHOUT ACADEMIC_USE_MEDCPT_RERANK → still primary; on cold-start
    // failure it falls through to the paid OpenRouter fallback.
    vi.stubEnv("MEDCPT_RERANK_URL", MEDCPT_URL);
    vi.stubEnv("OPENROUTER_API_KEY", OPENROUTER_KEY);
    vi.stubEnv("COHERE_API_KEY", COHERE_KEY);
    mockResilientFetch.mockRejectedValueOnce(new Error("[MedCPT-Rerank] cold start timeout"));
    mockResilientFetch.mockResolvedValueOnce(rerankResponse([[1, 0.9], [0, 0.1]]));

    await rerankResults("q", RESULTS);

    expect(mockResilientFetch).toHaveBeenCalledTimes(2);
    expect(mockResilientFetch.mock.calls[0][0]).toBe(MEDCPT_URL);
    // fell to the paid fallback only after the free lane failed
    expect(mockResilientFetch.mock.calls[1][0]).toBe(OPENROUTER_URL);
  });

  it("falls MedCPT → OpenRouter → Cohere", async () => {
    vi.stubEnv("MEDCPT_RERANK_URL", MEDCPT_URL);
    vi.stubEnv("OPENROUTER_API_KEY", OPENROUTER_KEY);
    vi.stubEnv("COHERE_API_KEY", COHERE_KEY);
    mockResilientFetch.mockRejectedValueOnce(new Error("[MedCPT-Rerank] cold start timeout"));
    mockResilientFetch.mockRejectedValueOnce(new Error("[OpenRouter-Rerank] HTTP 402"));
    mockResilientFetch.mockResolvedValueOnce(rerankResponse([[1, 0.9], [0, 0.1]]));

    const out = await rerankResults("q", RESULTS);

    expect(mockResilientFetch).toHaveBeenCalledTimes(3);
    expect(mockResilientFetch.mock.calls[0][0]).toBe(MEDCPT_URL);
    expect(mockResilientFetch.mock.calls[1][0]).toBe(OPENROUTER_URL);
    expect(mockResilientFetch.mock.calls[2][0]).toBe(COHERE_URL);
    expect(out.map((r) => r.title)).toEqual(["B relevance high", "A relevance low"]);
  });

  it("fails open (unchanged, no fetch) when no reranker is configured", async () => {
    const out = await rerankResults("q", RESULTS);
    expect(out).toBe(RESULTS);
    expect(mockResilientFetch).not.toHaveBeenCalled();
  });

  it("fails open to the input order when OpenRouter is the only backend and it throws", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", OPENROUTER_KEY);
    mockResilientFetch.mockRejectedValueOnce(new Error("[OpenRouter-Rerank] timed out"));

    const out = await rerankResults("q", RESULTS);
    expect(out).toBe(RESULTS);
  });

  it("advances to the next backend when OpenRouter yields no scores", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", OPENROUTER_KEY);
    vi.stubEnv("COHERE_API_KEY", COHERE_KEY);
    mockResilientFetch.mockResolvedValueOnce(jsonResponse({ results: [] }));
    mockResilientFetch.mockResolvedValueOnce(rerankResponse([[1, 0.9], [0, 0.1]]));

    const out = await rerankResults("q", RESULTS);

    expect(mockResilientFetch).toHaveBeenCalledTimes(2);
    expect(mockResilientFetch.mock.calls[1][0]).toBe(COHERE_URL);
    expect(out.map((r) => r.title)).toEqual(["B relevance high", "A relevance low"]);
  });
});

describe("rerankResults — MedCPT default primary / Cohere tertiary", () => {
  it("uses MedCPT (squashing logits to [0,1]) by default when MEDCPT_RERANK_URL is set", async () => {
    vi.stubEnv("MEDCPT_RERANK_URL", MEDCPT_URL);
    // raw LOGITS in INPUT order: A=-2, B=4, C=1 → sorted desc by sigmoid → B, C, A.
    mockResilientFetch.mockResolvedValueOnce(jsonResponse({ scores: [-2, 4, 1] }));

    const out = await rerankResults("q", RESULTS);

    expect(out.map((r) => r.title)).toEqual([
      "B relevance high",
      "C relevance mid",
      "A relevance low",
    ]);
    expect(out[0].rerankScore).toBeCloseTo(1 / (1 + Math.exp(-4)), 5);
    expect(out[2].rerankScore).toBeGreaterThan(0);
    expect(out[2].rerankScore).toBeLessThan(0.5);
    expect(mockResilientFetch.mock.calls[0][0]).toBe(MEDCPT_URL);
  });

  it("ACADEMIC_USE_MEDCPT_RERANK=0 forces the MedCPT lane OFF (escape hatch)", async () => {
    vi.stubEnv("MEDCPT_RERANK_URL", MEDCPT_URL); // present but explicitly disabled
    vi.stubEnv("ACADEMIC_USE_MEDCPT_RERANK", "0");
    const out = await rerankResults("q", RESULTS);
    expect(out).toBe(RESULTS);
    expect(mockResilientFetch).not.toHaveBeenCalled();
  });

  it("uses Cohere-direct when only COHERE_API_KEY is set", async () => {
    vi.stubEnv("COHERE_API_KEY", COHERE_KEY);
    mockResilientFetch.mockResolvedValueOnce(rerankResponse([[1, 0.9], [0, 0.1]]));

    const out = await rerankResults("q", RESULTS);

    expect(out.map((r) => r.title)).toEqual(["B relevance high", "A relevance low"]);
    expect(mockResilientFetch.mock.calls[0][0]).toBe(COHERE_URL);
  });
});

describe("rerankResults — domain routing (web path unchanged)", () => {
  const WEB_URL = "https://example-web-rerank.modal.run";

  it("web domain uses WEB_RERANK_URL, not the biomedical MedCPT reranker", async () => {
    vi.stubEnv("WEB_RERANK_URL", WEB_URL);
    vi.stubEnv("MEDCPT_RERANK_URL", MEDCPT_URL);
    mockResilientFetch.mockResolvedValueOnce(jsonResponse({ scores: [-2, 4, 1] }));

    const out = await rerankResults("q", RESULTS, undefined, { domain: "web" });

    expect(mockResilientFetch.mock.calls[0][0]).toBe(WEB_URL);
    expect(out.map((r) => r.title)).toEqual([
      "B relevance high",
      "C relevance mid",
      "A relevance low",
    ]);
  });

  it("web domain does NOT borrow OpenRouter (literature primary) even when the key is set", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", OPENROUTER_KEY);
    vi.stubEnv("WEB_RERANK_URL", WEB_URL);
    mockResilientFetch.mockResolvedValueOnce(jsonResponse({ scores: [1, 2, 3] }));

    await rerankResults("q", RESULTS, undefined, { domain: "web" });

    expect(mockResilientFetch.mock.calls[0][0]).toBe(WEB_URL);
  });

  it("web domain falls back to Cohere when WEB_RERANK_URL is unset", async () => {
    vi.stubEnv("COHERE_API_KEY", COHERE_KEY);
    mockResilientFetch.mockResolvedValueOnce(rerankResponse([[1, 0.9], [0, 0.2]]));
    const out = await rerankResults("q", RESULTS, undefined, { domain: "web" });
    expect(mockResilientFetch.mock.calls[0][0]).toBe(COHERE_URL);
    expect(out[0].title).toBe("B relevance high");
  });

  it("literature with a GENERAL profile (CS/econ/psych) reranks with bge (WEB_RERANK_URL), not MedCPT", async () => {
    vi.stubEnv("WEB_RERANK_URL", WEB_URL);
    vi.stubEnv("MEDCPT_RERANK_URL", MEDCPT_URL);
    mockResilientFetch.mockResolvedValueOnce(jsonResponse({ scores: [-2, 4, 1] }));

    await rerankResults("q", RESULTS, undefined, {
      domain: "literature",
      rerankProfile: "general",
    });

    expect(mockResilientFetch.mock.calls[0][0]).toBe(WEB_URL);
  });

  it("literature with a BIOMEDICAL profile still reranks with MedCPT", async () => {
    vi.stubEnv("WEB_RERANK_URL", WEB_URL);
    vi.stubEnv("MEDCPT_RERANK_URL", MEDCPT_URL);
    mockResilientFetch.mockResolvedValueOnce(jsonResponse({ scores: [-2, 4, 1] }));

    await rerankResults("q", RESULTS, undefined, {
      domain: "literature",
      rerankProfile: "biomedical",
    });

    expect(mockResilientFetch.mock.calls[0][0]).toBe(MEDCPT_URL);
  });
});

describe("hasReranker / attachRerankScores", () => {
  it("hasReranker is true when OPENROUTER_API_KEY is present", () => {
    expect(hasReranker()).toBe(false);
    vi.stubEnv("OPENROUTER_API_KEY", OPENROUTER_KEY);
    expect(hasReranker()).toBe(true);
  });

  it("hasReranker reflects MEDCPT_RERANK_URL and COHERE_API_KEY too", () => {
    expect(hasReranker()).toBe(false);
    vi.stubEnv("MEDCPT_RERANK_URL", MEDCPT_URL);
    expect(hasReranker()).toBe(true);
    vi.unstubAllEnvs();
    vi.stubEnv("COHERE_API_KEY", COHERE_KEY);
    expect(hasReranker()).toBe(true);
  });

  it("attachRerankScores activates via OPENROUTER_API_KEY and sets scores without reordering", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", OPENROUTER_KEY);
    mockResilientFetch.mockResolvedValueOnce(
      rerankResponse([
        [1, 0.9],
        [2, 0.5],
        [0, 0.1],
      ])
    );

    const input = [paper("A relevance low"), paper("B relevance high"), paper("C relevance mid")];
    const out = await attachRerankScores("q", input, 50);

    // same order (no reordering), scores attached by identity
    expect(out.map((r) => r.title)).toEqual([
      "A relevance low",
      "B relevance high",
      "C relevance mid",
    ]);
    expect(out[1].rerankScore).toBe(0.9);
    expect(out[0].rerankScore).toBe(0.1);
  });
});
