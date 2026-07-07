import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { searchArxiv } from "../arxiv";

const FIXTURE_XML = readFileSync(
  join(__dirname, "fixtures/arxiv-response.xml"),
  "utf-8"
);

const EMPTY_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">
  <opensearch:totalResults>0</opensearch:totalResults>
</feed>`;

const MALFORMED_XML = `<?xml version="1.0"?>
<feed><broken><entry><not-closed></feed>`;

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

function mockResponse(xml: string) {
  mockResilientFetch.mockResolvedValue({
    text: () => Promise.resolve(xml),
  } as unknown as Response);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockBreaker.canRequest.mockReturnValue(true);
});

describe("searchArxiv", () => {
  it("returns results with correct field mapping", async () => {
    mockResponse(FIXTURE_XML);
    const { results, total } = await searchArxiv("quantum entanglement");

    expect(total).toBe(4230);
    expect(results).toHaveLength(4);

    const first = results[0];
    expect(first.title).toBe("Quantum Entanglement in Many-Body Systems: A Review");
    expect(first.authors).toEqual(["Alice Zhang", "Bob Chen", "Carol Williams"]);
    expect(first.year).toBe(2023);
    expect(first.journal).toBe("arXiv:quant-ph");
    expect(first.doi).toBe("10.1103/PhysRevLett.130.123401");
    expect(first.arxivId).toBe("2301.12345v2");
    expect(first.abstract).toContain("quantum entanglement in many-body systems");
  });

  it("all results have correct constant fields", async () => {
    mockResponse(FIXTURE_XML);
    const { results } = await searchArxiv("quantum entanglement");

    for (const r of results) {
      expect(r.sources).toEqual(["arxiv"]);
      expect(r.isOpenAccess).toBe(true);
      expect(r.studyType).toBe("preprint");
      expect(r.publicationTypes).toEqual(["preprint"]);
      expect(r.citationCount).toBe(0);
    }
  });

  it("extracts arxivId without URL prefix", async () => {
    mockResponse(FIXTURE_XML);
    const { results } = await searchArxiv("quantum entanglement");

    expect(results[0].arxivId).toBe("2301.12345v2");
    expect(results[1].arxivId).toBe("2305.67890v1");
    expect(results[2].arxivId).toBe("2210.11111v3");
  });

  it("applies category filtering to query URL", async () => {
    mockResponse(FIXTURE_XML);
    await searchArxiv("quantum", { categories: ["cs.AI"] });

    const calledUrl = mockResilientFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("cat:cs.AI");
  });

  it("filters results by year range", async () => {
    mockResponse(FIXTURE_XML);
    const { results } = await searchArxiv("quantum entanglement", {
      yearStart: 2023,
      yearEnd: 2023,
    });

    // Fixture has years: 2023, 2023, 2022, 2024 — only 2023 entries pass
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.year === 2023)).toBe(true);
  });

  it("returns empty results for empty response", async () => {
    mockResponse(EMPTY_XML);
    const { results, total } = await searchArxiv("nonexistent topic xyz");

    expect(results).toEqual([]);
    expect(total).toBe(0);
  });

  it("handles malformed XML without throwing", async () => {
    mockResponse(MALFORMED_XML);
    const { results, total } = await searchArxiv("test");

    expect(results).toEqual([]);
    expect(total).toBe(0);
  });

  it("returns empty when circuit breaker is open", async () => {
    mockBreaker.canRequest.mockReturnValue(false);
    const { results, total } = await searchArxiv("quantum");

    expect(results).toEqual([]);
    expect(total).toBe(0);
    expect(mockResilientFetch).not.toHaveBeenCalled();
  });

  it("extracts PDF link into openAccessPdfUrl", async () => {
    mockResponse(FIXTURE_XML);
    const { results } = await searchArxiv("quantum entanglement");

    expect(results[0].openAccessPdfUrl).toBe("http://arxiv.org/pdf/2301.12345v2");
    expect(results[1].openAccessPdfUrl).toBe("http://arxiv.org/pdf/2305.67890v1");
  });

  it("extracts DOI when present, undefined when absent", async () => {
    mockResponse(FIXTURE_XML);
    const { results } = await searchArxiv("quantum entanglement");

    // First and third entries have DOIs
    expect(results[0].doi).toBe("10.1103/PhysRevLett.130.123401");
    expect(results[2].doi).toBe("10.1007/s11128-023-03891-x");
    // Second and fourth entries have no PUBLISHED DOI → fall back to the canonical
    // arXiv DOI (10.48550/arXiv.<id>, version stripped) so dedup + matching still work.
    expect(results[1].doi).toBe("10.48550/arXiv.2305.67890");
    expect(results[3].doi).toMatch(/^10\.48550\/arXiv\./);
  });

  it("extracts fieldsOfStudy from category terms", async () => {
    mockResponse(FIXTURE_XML);
    const { results } = await searchArxiv("quantum entanglement");

    expect(results[0].fieldsOfStudy).toEqual(["quant-ph", "cond-mat.str-el"]);
    expect(results[1].fieldsOfStudy).toEqual(["cs.AI", "quant-ph", "cs.LG"]);
    expect(results[2].fieldsOfStudy).toEqual(["quant-ph"]);
  });
});
