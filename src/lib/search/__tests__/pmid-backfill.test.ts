import { describe, it, expect, vi } from "vitest";
import {
  selectDoisNeedingPmid,
  backfillPmidsByDoi,
  PMID_BACKFILL_CAP,
} from "../pmid-backfill";
import type { UnifiedSearchResult } from "@/types/search";

function paper(p: Partial<UnifiedSearchResult>): UnifiedSearchResult {
  return {
    title: "Untitled",
    authors: [],
    journal: "",
    year: 2020,
    citationCount: 0,
    publicationTypes: [],
    isOpenAccess: false,
    sources: ["openalex"],
    ...p,
  };
}

describe("selectDoisNeedingPmid", () => {
  it("selects DOI-only results, skipping those that already have a PMID", () => {
    const list = [
      paper({ doi: "10.1/a", pmid: "111" }),
      paper({ doi: "10.1/b" }),
      paper({ doi: "10.1/c" }),
      paper({ title: "no ids" }),
    ];
    expect(selectDoisNeedingPmid(list)).toEqual(["10.1/b", "10.1/c"]);
  });

  it("dedupes DOIs case-insensitively and preserves pool order", () => {
    const list = [paper({ doi: "10.1/X" }), paper({ doi: "10.1/x" }), paper({ doi: "10.1/y" })];
    expect(selectDoisNeedingPmid(list)).toEqual(["10.1/X", "10.1/y"]);
  });

  it("caps the number of lookups", () => {
    const list = Array.from({ length: 20 }, (_, i) => paper({ doi: `10.1/${i}` }));
    expect(selectDoisNeedingPmid(list, 3)).toHaveLength(3);
    expect(selectDoisNeedingPmid(list)).toHaveLength(PMID_BACKFILL_CAP);
  });
});

describe("backfillPmidsByDoi", () => {
  it("fills PMIDs for DOI-only results via the injected lookup", async () => {
    const results = [paper({ doi: "10.1/a" }), paper({ doi: "10.1/b" })];
    const lookup = vi.fn(async (doi: string) => (doi === "10.1/a" ? "1001" : "1002"));
    const filled = await backfillPmidsByDoi(results, { lookup });
    expect(filled).toBe(2);
    expect(results[0].pmid).toBe("1001");
    expect(results[1].pmid).toBe("1002");
  });

  it("applies a resolved PMID to every result sharing that DOI", async () => {
    const results = [paper({ doi: "10.1/a" }), paper({ doi: "10.1/a" })];
    const lookup = vi.fn(async () => "1001");
    const filled = await backfillPmidsByDoi(results, { lookup });
    expect(filled).toBe(2);
    expect(lookup).toHaveBeenCalledTimes(1); // deduped — one network call for the shared DOI
  });

  it("is a no-op when nothing needs a PMID", async () => {
    const results = [paper({ doi: "10.1/a", pmid: "111" })];
    const lookup = vi.fn(async () => "999");
    expect(await backfillPmidsByDoi(results, { lookup })).toBe(0);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("fails open: a lookup that throws leaves the result unchanged", async () => {
    const results = [paper({ doi: "10.1/a" }), paper({ doi: "10.1/b" })];
    const lookup = vi.fn(async (doi: string) => {
      if (doi === "10.1/a") throw new Error("NCBI down");
      return "1002";
    });
    const filled = await backfillPmidsByDoi(results, { lookup });
    expect(filled).toBe(1);
    expect(results[0].pmid).toBeUndefined();
    expect(results[1].pmid).toBe("1002");
  });

  it("does not overwrite an existing PMID", async () => {
    const results = [paper({ doi: "10.1/a", pmid: "EXISTING" })];
    const lookup = vi.fn(async () => "9999");
    await backfillPmidsByDoi(results, { lookup });
    expect(results[0].pmid).toBe("EXISTING");
  });
});
