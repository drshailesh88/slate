import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  searchSpringer,
  mapSpringerRecord,
  extractSpringerAuthors,
  extractSpringerPdfUrl,
  getSpringerApiKey,
  type SpringerRecord,
} from "../sources/springer";

const SAMPLE_RECORD: SpringerRecord = {
  title: "Deep learning for protein folding",
  creators: [{ creator: "Doe, Jane" }, { creator: "Roe, Richard" }],
  publicationName: "Nature Methods",
  publicationDate: "2020-03-01",
  doi: "10.1038/s41592-020-0772-5",
  abstract: "We present a deep-learning approach to protein structure prediction.",
  openaccess: "true",
  url: [
    { platform: "web", format: "html", value: "http://link.springer.com/article/abc" },
    { platform: "web", format: "pdf", value: "http://link.springer.com/pdf/abc.pdf" },
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

describe("extractSpringerAuthors", () => {
  it("reverses 'Last, First' into natural 'First Last' order", () => {
    expect(extractSpringerAuthors(SAMPLE_RECORD)).toEqual([
      "Jane Doe",
      "Richard Roe",
    ]);
  });

  it("passes through names without a comma", () => {
    expect(
      extractSpringerAuthors({ creators: [{ creator: "Aristotle" }] })
    ).toEqual(["Aristotle"]);
  });

  it("returns an empty array when creators is missing", () => {
    expect(extractSpringerAuthors({})).toEqual([]);
  });
});

describe("extractSpringerPdfUrl", () => {
  it("prefers the web PDF link and upgrades http to https", () => {
    expect(extractSpringerPdfUrl(SAMPLE_RECORD)).toBe(
      "https://link.springer.com/pdf/abc.pdf"
    );
  });

  it("falls back to the web HTML link when no PDF is present", () => {
    expect(
      extractSpringerPdfUrl({
        url: [{ platform: "web", format: "html", value: "https://link.springer.com/x" }],
      })
    ).toBe("https://link.springer.com/x");
  });

  it("returns null when there is no web link", () => {
    expect(extractSpringerPdfUrl({})).toBeNull();
  });
});

describe("mapSpringerRecord", () => {
  it("maps every field from a Springer record", () => {
    const mapped = mapSpringerRecord(SAMPLE_RECORD);
    expect(mapped).toMatchObject({
      title: "Deep learning for protein folding",
      authors: ["Jane Doe", "Richard Roe"],
      journal: "Nature Methods",
      year: 2020,
      doi: "10.1038/s41592-020-0772-5",
      abstract: "We present a deep-learning approach to protein structure prediction.",
      isOpenAccess: true,
      openAccessPdfUrl: "https://link.springer.com/pdf/abc.pdf",
      sources: ["springer"],
    });
  });

  it("treats openaccess 'false' as closed and omits the PDF url", () => {
    const mapped = mapSpringerRecord({ ...SAMPLE_RECORD, openaccess: "false" });
    expect(mapped?.isOpenAccess).toBe(false);
    expect(mapped?.openAccessPdfUrl).toBeNull();
  });

  it("returns null for an untitled record", () => {
    expect(mapSpringerRecord({ doi: "10.1/x" })).toBeNull();
  });
});

describe("getSpringerApiKey", () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });

  it("reads SPRINGER_API_KEY", () => {
    process.env.SPRINGER_API_KEY = "springer-key";
    expect(getSpringerApiKey()).toBe("springer-key");
  });

  it("returns undefined when unset", () => {
    delete process.env.SPRINGER_API_KEY;
    expect(getSpringerApiKey()).toBeUndefined();
  });
});

describe("searchSpringer", () => {
  const original = { ...process.env };

  beforeEach(() => {
    delete process.env.SPRINGER_API_KEY;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...original };
  });

  it("is inert (disabled, never throws, never fetches) when no key is set", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const out = await searchSpringer("protein folding");

    expect(out.results).toEqual([]);
    expect(out.total).toBe(0);
    expect(out.status.status).toBe("missing_config");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("maps results through fetch when a key is configured", async () => {
    process.env.SPRINGER_API_KEY = "springer-key";
    mockFetchOnce({
      result: [{ total: "42" }],
      records: [SAMPLE_RECORD],
    });

    const out = await searchSpringer("protein folding");

    expect(out.status.status).toBe("ok");
    expect(out.total).toBe(42);
    expect(out.results).toHaveLength(1);
    expect(out.results[0].title).toBe("Deep learning for protein folding");
    expect(out.results[0].sources).toEqual(["springer"]);
  });

  it("returns an empty ok result when records is absent", async () => {
    process.env.SPRINGER_API_KEY = "springer-key";
    mockFetchOnce({ result: [{ total: "0" }] });

    const out = await searchSpringer("no matches here");

    expect(out.status.status).toBe("ok");
    expect(out.results).toEqual([]);
  });
});
