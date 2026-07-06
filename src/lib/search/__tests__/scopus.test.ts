import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  searchScopus,
  mapScopusEntry,
  extractScopusAuthors,
  getScopusApiKey,
  type ScopusEntry,
} from "../sources/scopus";

const SAMPLE_ENTRY: ScopusEntry = {
  "dc:title": "SGLT2 inhibitors in heart failure",
  "dc:creator": "Smith A.",
  "dc:description": "A randomised trial of SGLT2 inhibition.",
  "prism:publicationName": "New England Journal of Medicine",
  "prism:coverDate": "2021-08-15",
  "prism:doi": "10.1056/nejmoa2107038",
  "citedby-count": "1234",
  openaccessFlag: true,
  author: [
    { authname: "Smith A.", surname: "Smith", "given-name": "A." },
    { authname: "Jones B.", surname: "Jones", "given-name": "B." },
  ],
};

function mockFetchOnce(body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => body,
    }))
  );
}

describe("extractScopusAuthors", () => {
  it("prefers the full author[] list via authname", () => {
    expect(extractScopusAuthors(SAMPLE_ENTRY)).toEqual(["Smith A.", "Jones B."]);
  });

  it("falls back to ce:indexed-name when authname is absent", () => {
    expect(
      extractScopusAuthors({ author: [{ "ce:indexed-name": "Doe C." }] })
    ).toEqual(["Doe C."]);
  });

  it("falls back to dc:creator (first author) when author[] is missing", () => {
    expect(extractScopusAuthors({ "dc:creator": "Only A." })).toEqual(["Only A."]);
  });

  it("returns an empty array when no author data is present", () => {
    expect(extractScopusAuthors({})).toEqual([]);
  });
});

describe("mapScopusEntry", () => {
  it("maps every field from a Scopus entry", () => {
    const mapped = mapScopusEntry(SAMPLE_ENTRY);
    expect(mapped).toMatchObject({
      title: "SGLT2 inhibitors in heart failure",
      authors: ["Smith A.", "Jones B."],
      journal: "New England Journal of Medicine",
      year: 2021,
      doi: "10.1056/nejmoa2107038",
      abstract: "A randomised trial of SGLT2 inhibition.",
      citationCount: 1234,
      isOpenAccess: true,
      sources: ["scopus"],
    });
  });

  it("treats openaccess string '1' as open access", () => {
    expect(mapScopusEntry({ "dc:title": "x", openaccess: "1" })?.isOpenAccess).toBe(true);
    expect(mapScopusEntry({ "dc:title": "x", openaccess: "0" })?.isOpenAccess).toBe(false);
  });

  it("returns null for an untitled entry", () => {
    expect(mapScopusEntry({ "dc:creator": "Nobody" })).toBeNull();
  });

  it("defaults citationCount to 0 when citedby-count is absent", () => {
    expect(mapScopusEntry({ "dc:title": "x" })?.citationCount).toBe(0);
  });
});

describe("getScopusApiKey", () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });

  it("accepts ELSEVIER_API_KEY", () => {
    delete process.env.SCOPUS_API_KEY;
    process.env.ELSEVIER_API_KEY = "els-key";
    expect(getScopusApiKey()).toBe("els-key");
  });

  it("accepts SCOPUS_API_KEY as an alias", () => {
    delete process.env.ELSEVIER_API_KEY;
    process.env.SCOPUS_API_KEY = "scopus-key";
    expect(getScopusApiKey()).toBe("scopus-key");
  });
});

describe("searchScopus", () => {
  const original = { ...process.env };

  beforeEach(() => {
    delete process.env.ELSEVIER_API_KEY;
    delete process.env.SCOPUS_API_KEY;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...original };
  });

  it("is inert (disabled, never throws, never fetches) when no key is set", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const out = await searchScopus("heart failure");

    expect(out.results).toEqual([]);
    expect(out.total).toBe(0);
    expect(out.status.status).toBe("missing_config");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("maps results through fetch when a key is configured", async () => {
    process.env.ELSEVIER_API_KEY = "els-key";
    mockFetchOnce({
      "search-results": {
        "opensearch:totalResults": "2",
        entry: [SAMPLE_ENTRY],
      },
    });

    const out = await searchScopus("heart failure");

    expect(out.status.status).toBe("ok");
    expect(out.total).toBe(2);
    expect(out.results).toHaveLength(1);
    expect(out.results[0].title).toBe("SGLT2 inhibitors in heart failure");
    expect(out.results[0].sources).toEqual(["scopus"]);
  });

  it("returns an empty ok result for a zero-result query (synthetic error entry)", async () => {
    process.env.SCOPUS_API_KEY = "scopus-key";
    mockFetchOnce({
      "search-results": {
        "opensearch:totalResults": "0",
        entry: [{ error: "Result set was empty" }],
      },
    });

    const out = await searchScopus("asdfqwerty no results");

    expect(out.status.status).toBe("ok");
    expect(out.results).toEqual([]);
  });
});
