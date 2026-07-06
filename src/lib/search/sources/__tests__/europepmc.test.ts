import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchEuropePMC } from "../europepmc";

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

function mockJson(payload: unknown) {
  mockResilientFetch.mockResolvedValue({
    json: () => Promise.resolve(payload),
  } as unknown as Response);
}

const SAMPLE_RESPONSE = {
  hitCount: 19468,
  resultList: {
    result: [
      {
        id: "37012345",
        source: "MED",
        pmid: "37012345",
        doi: "10.1016/j.jcin.2023.01.001",
        title: "Management of contrast induced nephropathy",
        abstractText: "A review of prevention strategies for CIN.",
        authorString: "Smith AB, Jones CD, Brown EF.",
        journalInfo: {
          journal: { title: "JACC Cardiovascular Interventions" },
          yearOfPublication: 2023,
        },
        pubYear: "2023",
        citedByCount: 42,
        isOpenAccess: "Y",
        pubTypeList: { pubType: ["Journal Article", "Review"] },
        fullTextUrlList: {
          fullTextUrl: [
            {
              url: "https://europepmc.org/articles/PMC12345",
              documentStyle: "html",
              availability: "Open access",
            },
            {
              url: "https://europepmc.org/articles/PMC12345?pdf=render",
              documentStyle: "pdf",
              availability: "Open access",
            },
          ],
        },
      },
      {
        id: "PPR654321",
        source: "PPR",
        pmid: "654321",
        title: "Preprint on nephrotoxicity",
        abstractText: "Preprint abstract.",
        authorList: {
          author: [{ fullName: "Doe J" }, { fullName: "Roe K" }],
        },
        journalInfo: { yearOfPublication: 2024 },
        pubYear: "2024",
        citedByCount: 0,
        isOpenAccess: "N",
        pubTypeList: { pubType: ["Preprint"] },
      },
    ],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockBreaker.canRequest.mockReturnValue(true);
});

describe("searchEuropePMC", () => {
  it("maps fields correctly including abstract, citations, and open access", async () => {
    mockJson(SAMPLE_RESPONSE);
    const { results, total, status } = await searchEuropePMC(
      "contrast induced nephropathy management"
    );

    expect(total).toBe(19468);
    expect(status).toEqual({ status: "ok" });
    expect(results).toHaveLength(2);

    const first = results[0];
    expect(first.title).toBe("Management of contrast induced nephropathy");
    expect(first.abstract).toBe("A review of prevention strategies for CIN.");
    expect(first.authors).toEqual(["Smith AB", "Jones CD", "Brown EF"]);
    expect(first.journal).toBe("JACC Cardiovascular Interventions");
    expect(first.year).toBe(2023);
    expect(first.doi).toBe("10.1016/j.jcin.2023.01.001");
    expect(first.pmid).toBe("37012345");
    expect(first.citationCount).toBe(42);
    expect(first.isOpenAccess).toBe(true);
    expect(first.openAccessPdfUrl).toBe(
      "https://europepmc.org/articles/PMC12345?pdf=render"
    );
    expect(first.publicationTypes).toEqual(["Journal Article", "Review"]);
    expect(first.studyType).toBe("review");
    expect(first.sources).toEqual(["europepmc"]);
  });

  it("omits pmid for non-MED sources and falls back to authorList", async () => {
    mockJson(SAMPLE_RESPONSE);
    const { results } = await searchEuropePMC("nephrotoxicity");

    const preprint = results[1];
    expect(preprint.pmid).toBeUndefined();
    expect(preprint.authors).toEqual(["Doe J", "Roe K"]);
    expect(preprint.isOpenAccess).toBe(false);
    expect(preprint.openAccessPdfUrl).toBeNull();
    expect(preprint.citationCount).toBe(0);
  });

  it("appends a PUB_YEAR filter to the query when year bounds are set", async () => {
    mockJson(SAMPLE_RESPONSE);
    await searchEuropePMC("aortic stenosis", { yearStart: 2018, yearEnd: 2024 });

    const calledUrl = mockResilientFetch.mock.calls[0][0] as string;
    expect(decodeURIComponent(calledUrl)).toContain(
      "AND (PUB_YEAR:[2018 TO 2024])"
    );
  });

  it("caps pageSize at 100 and passes the page number", async () => {
    mockJson(SAMPLE_RESPONSE);
    await searchEuropePMC("sepsis", { limit: 500, page: 3 });

    const calledUrl = mockResilientFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("pageSize=100");
    expect(calledUrl).toContain("page=3");
  });

  it("handles an empty result list", async () => {
    mockJson({ hitCount: 0, resultList: { result: [] } });
    const { results, total, status } = await searchEuropePMC("zzzznomatchzzz");

    expect(results).toEqual([]);
    expect(total).toBe(0);
    expect(status).toEqual({ status: "ok" });
  });

  it("handles a missing resultList without throwing", async () => {
    mockJson({ hitCount: 0 });
    const { results, total } = await searchEuropePMC("anything");

    expect(results).toEqual([]);
    expect(total).toBe(0);
  });

  it("returns an error status and empty results on a non-200 (thrown) response", async () => {
    mockResilientFetch.mockRejectedValue(new Error("[EuropePMC] HTTP 503"));
    const { results, total, status } = await searchEuropePMC("failure");

    expect(results).toEqual([]);
    expect(total).toBe(0);
    expect(status.status).toBe("error");
    expect(mockBreaker.onFailure).toHaveBeenCalled();
  });

  it("returns empty when the circuit breaker is open", async () => {
    mockBreaker.canRequest.mockReturnValue(false);
    const { results, total, status } = await searchEuropePMC("anything");

    expect(results).toEqual([]);
    expect(total).toBe(0);
    expect(status.status).toBe("error");
    expect(mockResilientFetch).not.toHaveBeenCalled();
  });
});
