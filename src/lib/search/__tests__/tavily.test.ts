import { describe, it, expect } from "vitest";
import { extractDoi, extractPmid, trustTierForUrl } from "../sources/tavily";

describe("extractDoi", () => {
  it("pulls a DOI out of a URL or text and lowercases it", () => {
    expect(extractDoi("https://doi.org/10.1056/NEJMoa1814052")).toBe("10.1056/nejmoa1814052");
    expect(extractDoi("see doi:10.1016/j.jacc.2021.11.062, table 2")).toBe(
      "10.1016/j.jacc.2021.11.062"
    );
    expect(extractDoi("no identifier here")).toBeUndefined();
  });
});

describe("extractPmid", () => {
  it("extracts a PMID from a PubMed URL", () => {
    expect(extractPmid("https://pubmed.ncbi.nlm.nih.gov/30883058/")).toBe("30883058");
    expect(extractPmid("https://example.com/x")).toBeUndefined();
  });
});

describe("trustTierForUrl", () => {
  it("classifies government and major-journal domains, defaults to other", () => {
    expect(trustTierForUrl("https://www.cdc.gov/page")).toBe("government");
    expect(trustTierForUrl("https://www.nih.gov/x")).toBe("government");
    expect(trustTierForUrl("https://www.nejm.org/doi/full/10.1056/x")).toBe("major_journalism");
    expect(trustTierForUrl("https://randomblog.example.com/post")).toBe("other");
  });
});
