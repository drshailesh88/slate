import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchMedcptDense } from "../medcpt-dense";

// Must use vi.hoisted so mock references are available inside vi.mock factories
const { mockBreaker, mockResilientFetch } = vi.hoisted(() => {
  const mockBreaker = {
    canRequest: vi.fn(() => true),
    onSuccess: vi.fn(),
    onFailure: vi.fn(),
  };
  const mockResilientFetch = vi.fn();
  return { mockBreaker, mockResilientFetch };
});

vi.mock("@/lib/http/resilient-fetch", () => ({
  resilientFetch: mockResilientFetch,
}));

vi.mock("@/lib/http/circuit-breaker", () => ({
  createCircuitBreaker: vi.fn(() => mockBreaker),
}));

const ENCODER_URL = "https://example-medcpt-query.modal.run";
const API_KEY = "tpuf_test_key";

/** 768-d unit-ish vector stand-in (length is what the lane validates, not magnitude). */
const QUERY_VECTOR = Array.from({ length: 768 }, (_, i) => (i % 7) * 0.01);

function jsonResponse(body: unknown) {
  return { json: () => Promise.resolve(body) } as unknown as Response;
}

/** Encoder returns the query embedding; Turbopuffer returns ranked rows. */
function mockEncoderThenQuery(rows: unknown[], embedding = QUERY_VECTOR) {
  mockResilientFetch
    .mockResolvedValueOnce(jsonResponse({ embedding }))
    .mockResolvedValueOnce(jsonResponse({ rows }));
}

const SAMPLE_ROWS = [
  {
    id: "38000001",
    $dist: 0.12,
    pmid: "38000001",
    title: "Empagliflozin in Heart Failure with Preserved Ejection Fraction",
    journal: "N Engl J Med",
    year: 2024,
    authors: ["Anker SD", "Butler J", "Filippatos G"],
    abstract: "In patients with heart failure and a preserved ejection fraction...",
    doi: "10.1056/nejmoa2107038",
  },
  {
    id: "37000002",
    $dist: 0.31,
    pmid: "37000002",
    title: "SGLT2 Inhibitors and Cardiovascular Outcomes",
    journal: "Lancet",
    year: 2023,
    authors: ["McMurray JJV"],
    abstract: "A meta-analysis of SGLT2 inhibitor cardiovascular outcome trials...",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockBreaker.canRequest.mockReturnValue(true);
  vi.stubEnv("MEDCPT_QUERY_ENCODER_URL", ENCODER_URL);
  vi.stubEnv("TURBOPUFFER_API_KEY", API_KEY);
  vi.stubEnv("TURBOPUFFER_REGION", "");
  vi.stubEnv("MEDCPT_TURBOPUFFER_NAMESPACE", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("searchMedcptDense", () => {
  it("maps Turbopuffer rows into UnifiedSearchResult with medcpt_dense provenance", async () => {
    mockEncoderThenQuery(SAMPLE_ROWS);
    const { results, total, status } = await searchMedcptDense("heart failure preserved EF");

    expect(status.status).toBe("ok");
    expect(total).toBe(2);
    expect(results).toHaveLength(2);

    const first = results[0];
    expect(first.pmid).toBe("38000001");
    expect(first.title).toBe(
      "Empagliflozin in Heart Failure with Preserved Ejection Fraction"
    );
    expect(first.journal).toBe("N Engl J Med");
    expect(first.year).toBe(2024);
    expect(first.authors).toEqual(["Anker SD", "Butler J", "Filippatos G"]);
    expect(first.abstract).toContain("preserved ejection fraction");
    expect(first.doi).toBe("10.1056/nejmoa2107038");
    expect(first.sources).toEqual(["medcpt_dense"]);
  });

  it("preserves Turbopuffer ANN ordering (closest first)", async () => {
    mockEncoderThenQuery(SAMPLE_ROWS);
    const { results } = await searchMedcptDense("q");
    expect(results.map((r) => r.pmid)).toEqual(["38000001", "37000002"]);
  });

  it("encodes the query via the Modal encoder, then ANN-queries Turbopuffer with that vector", async () => {
    mockEncoderThenQuery(SAMPLE_ROWS);
    await searchMedcptDense("lecanemab alzheimer", { limit: 25 });

    // First call: the Modal query-encoder endpoint, posting the query text.
    const [encoderUrl, encoderInit] = mockResilientFetch.mock.calls[0];
    expect(encoderUrl).toBe(ENCODER_URL);
    expect(encoderInit.method).toBe("POST");
    expect(JSON.parse(encoderInit.body as string)).toMatchObject({
      query: "lecanemab alzheimer",
    });

    // Second call: Turbopuffer query endpoint (region subdomain + v2 path).
    const [tpufUrl, tpufInit] = mockResilientFetch.mock.calls[1];
    expect(tpufUrl).toContain("aws-us-east-1.turbopuffer.com");
    expect(tpufUrl).toContain("/v2/namespaces/");
    expect(tpufUrl).toContain("/query");
    const headers = tpufInit.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${API_KEY}`);
    const body = JSON.parse(tpufInit.body as string);
    expect(body.rank_by).toEqual(["vector", "ANN", QUERY_VECTOR]);
    expect(body.limit).toBe(25);
  });

  it("applies a year-range attribute filter when yearStart/yearEnd given", async () => {
    mockEncoderThenQuery(SAMPLE_ROWS);
    await searchMedcptDense("q", { yearStart: 2024, yearEnd: 2026 });

    const tpufBody = JSON.parse(mockResilientFetch.mock.calls[1][1].body as string);
    expect(tpufBody.filters).toEqual([
      "And",
      [
        ["year", "Gte", 2024],
        ["year", "Lte", 2026],
      ],
    ]);
  });

  it("uses configured region and namespace overrides", async () => {
    vi.stubEnv("TURBOPUFFER_REGION", "gcp-us-central1");
    vi.stubEnv("MEDCPT_TURBOPUFFER_NAMESPACE", "medcpt-test");
    mockEncoderThenQuery(SAMPLE_ROWS);
    await searchMedcptDense("q");

    const tpufUrl = mockResilientFetch.mock.calls[1][0] as string;
    expect(tpufUrl).toContain("gcp-us-central1.turbopuffer.com");
    expect(tpufUrl).toContain("/v2/namespaces/medcpt-test/query");
  });

  it("fails open with missing_config when the encoder URL is unset", async () => {
    vi.stubEnv("MEDCPT_QUERY_ENCODER_URL", "");
    const { results, total, status } = await searchMedcptDense("q");

    expect(results).toEqual([]);
    expect(total).toBe(0);
    expect(status.status).toBe("missing_config");
    expect(mockResilientFetch).not.toHaveBeenCalled();
  });

  it("fails open with missing_config when the Turbopuffer key is unset", async () => {
    vi.stubEnv("TURBOPUFFER_API_KEY", "");
    const { results, status } = await searchMedcptDense("q");

    expect(results).toEqual([]);
    expect(status.status).toBe("missing_config");
    expect(mockResilientFetch).not.toHaveBeenCalled();
  });

  it("returns empty without calling out when the circuit breaker is open", async () => {
    mockBreaker.canRequest.mockReturnValue(false);
    const { results, status } = await searchMedcptDense("q");

    expect(results).toEqual([]);
    expect(status.status).toBe("error");
    expect(mockResilientFetch).not.toHaveBeenCalled();
  });

  it("fails open when the encoder call throws, recording a breaker failure", async () => {
    mockResilientFetch.mockRejectedValueOnce(new Error("[MedCPT] HTTP 503"));
    const { results, total, status } = await searchMedcptDense("q");

    expect(results).toEqual([]);
    expect(total).toBe(0);
    expect(status.status).not.toBe("ok");
    expect(mockBreaker.onFailure).toHaveBeenCalled();
    // Never queries Turbopuffer with a missing vector.
    expect(mockResilientFetch).toHaveBeenCalledTimes(1);
  });

  it("fails open when the encoder returns no usable embedding", async () => {
    mockResilientFetch.mockResolvedValueOnce(jsonResponse({ embedding: [] }));
    const { results, status } = await searchMedcptDense("q");

    expect(results).toEqual([]);
    expect(status.status).not.toBe("ok");
    expect(mockResilientFetch).toHaveBeenCalledTimes(1);
  });

  it("fails open when the Turbopuffer query throws", async () => {
    mockResilientFetch
      .mockResolvedValueOnce(jsonResponse({ embedding: QUERY_VECTOR }))
      .mockRejectedValueOnce(new Error("[Turbopuffer] HTTP 429"));
    const { results, status } = await searchMedcptDense("q");

    expect(results).toEqual([]);
    expect(status.status).not.toBe("ok");
    expect(mockBreaker.onFailure).toHaveBeenCalled();
  });

  it("returns an ok empty set when Turbopuffer has no matches", async () => {
    mockEncoderThenQuery([]);
    const { results, total, status } = await searchMedcptDense("q");

    expect(results).toEqual([]);
    expect(total).toBe(0);
    expect(status.status).toBe("ok");
    expect(mockBreaker.onSuccess).toHaveBeenCalled();
  });

  it("tolerates a scalar author attribute by normalizing to an array", async () => {
    mockEncoderThenQuery([{ id: "1", $dist: 0.1, pmid: "1", title: "T", year: 2024, authors: "Solo A" }]);
    const { results } = await searchMedcptDense("q");
    expect(results[0].authors).toEqual(["Solo A"]);
  });
});

const SEARCH_URL = "https://example-medcpt-search.modal.run";

describe("searchMedcptDense — combined endpoint (MEDCPT_SEARCH_URL)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBreaker.canRequest.mockReturnValue(true);
    vi.stubEnv("MEDCPT_SEARCH_URL", SEARCH_URL);
    vi.stubEnv("MEDCPT_QUERY_ENCODER_URL", ENCODER_URL);
    vi.stubEnv("TURBOPUFFER_API_KEY", API_KEY);
    vi.stubEnv("TURBOPUFFER_REGION", "");
    vi.stubEnv("MEDCPT_TURBOPUFFER_NAMESPACE", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("makes ONE round-trip to the combined endpoint and maps the returned rows", async () => {
    mockResilientFetch.mockResolvedValueOnce(jsonResponse({ rows: SAMPLE_ROWS }));
    const { results, total, status } = await searchMedcptDense("heart failure", { limit: 25 });

    expect(status.status).toBe("ok");
    expect(total).toBe(2);
    expect(results[0].pmid).toBe("38000001");
    expect(results[0].sources).toEqual(["medcpt_dense"]);
    // One fetch only — no separate client-side Turbopuffer call.
    expect(mockResilientFetch).toHaveBeenCalledTimes(1);

    const [url, init] = mockResilientFetch.mock.calls[0];
    expect(url).toBe(SEARCH_URL);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({ query: "heart failure", limit: 25 });
  });

  it("forwards a year range as year_start/year_end to the server", async () => {
    mockResilientFetch.mockResolvedValueOnce(jsonResponse({ rows: [] }));
    await searchMedcptDense("q", { yearStart: 2024, yearEnd: 2026 });

    const body = JSON.parse(mockResilientFetch.mock.calls[0][1].body as string);
    expect(body.year_start).toBe(2024);
    expect(body.year_end).toBe(2026);
  });

  it("prefers the combined endpoint over the two-hop path when both are configured", async () => {
    mockResilientFetch.mockResolvedValueOnce(jsonResponse({ rows: SAMPLE_ROWS }));
    await searchMedcptDense("q");
    // Combined: single call to the search URL, never the encoder/Turbopuffer pair.
    expect(mockResilientFetch).toHaveBeenCalledTimes(1);
    expect(mockResilientFetch.mock.calls[0][0]).toBe(SEARCH_URL);
  });

  it("fails open when the combined call throws, recording a breaker failure", async () => {
    mockResilientFetch.mockRejectedValueOnce(new Error("[MedCPT-Search] HTTP 503"));
    const { results, total, status } = await searchMedcptDense("q");

    expect(results).toEqual([]);
    expect(total).toBe(0);
    expect(status.status).not.toBe("ok");
    expect(mockBreaker.onFailure).toHaveBeenCalled();
  });

  it("returns an ok empty set when the combined endpoint yields no rows", async () => {
    mockResilientFetch.mockResolvedValueOnce(jsonResponse({ rows: [] }));
    const { results, total, status } = await searchMedcptDense("q");

    expect(results).toEqual([]);
    expect(total).toBe(0);
    expect(status.status).toBe("ok");
    expect(mockBreaker.onSuccess).toHaveBeenCalled();
  });
});
