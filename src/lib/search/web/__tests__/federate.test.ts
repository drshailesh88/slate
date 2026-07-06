import { describe, expect, it, vi } from "vitest";
import { federateWith, braveSourceForTab, type WebSource } from "../federate";
import { okStatus } from "@/lib/search/source-status";
import { sourceBudget } from "../source-budget";
import type { UnifiedSearchResult } from "@/types/search";

vi.mock("@/lib/search/sources/brave", () => ({
  searchBrave: vi.fn(async () => ({ results: [], total: 0, status: { status: "ok" } })),
}));
import { searchBrave } from "@/lib/search/sources/brave";

function row(url: string, title: string): UnifiedSearchResult {
  return { title, authors: [], journal: "", year: 0, url, sources: ["discussions"], citationCount: 0, publicationTypes: ["discussions"], isOpenAccess: false };
}

function okSource(id: string, results: UnifiedSearchResult[]): WebSource {
  return { id, label: id, run: async () => ({ results, total: results.length, status: okStatus() }) };
}

function failSource(id: string): WebSource {
  return { id, label: id, run: async () => { throw new Error(`[${id}] HTTP 403`); } };
}

function emptyOkSource(id: string): WebSource {
  return { id, label: id, run: async () => ({ results: [], total: 0, status: okStatus() }) };
}

describe("federateWith", () => {
  it("passes a single source through unchanged (no reorder, no rrfScore)", async () => {
    const results = [row("https://a.com/1", "one"), row("https://a.com/2", "two")];
    const fed = await federateWith("q", "discussions", [okSource("searxng", results)]);
    expect(fed.results).toEqual(results); // identical objects, identical order
    expect(fed.results[0].rrfScore).toBeUndefined();
    expect(fed.degraded).toBe(false);
  });

  it("RRF-fuses when more than one source contributes", async () => {
    const fed = await federateWith("q", "discussions", [
      okSource("hn", [row("https://hn/1", "a")]),
      okSource("se", [row("https://se/1", "b")]),
    ]);
    expect(fed.results).toHaveLength(2);
    expect(fed.results[0].rrfScore).toBeGreaterThan(0);
  });

  it("is fail-open: a throwing source never zeroes the tab", async () => {
    const fed = await federateWith("q", "discussions", [
      failSource("reddit"),
      okSource("hn", [row("https://hn/1", "a"), row("https://hn/2", "b")]),
    ]);
    expect(fed.results).toHaveLength(2); // hn survives reddit's 403
    expect(fed.degraded).toBe(false);
    expect(fed.perSource.find((s) => s.id === "reddit")!.status.status).not.toBe("ok");
    expect(fed.perSource.find((s) => s.id === "hn")!.count).toBe(2);
  });

  it("marks degraded only when every source fails AND nothing is returned", async () => {
    const fed = await federateWith("q", "discussions", [failSource("reddit"), failSource("hn")]);
    expect(fed.results).toEqual([]);
    expect(fed.degraded).toBe(true);
  });

  it("is not degraded when sources are healthy but genuinely empty", async () => {
    const fed = await federateWith("q", "discussions", [emptyOkSource("hn"), emptyOkSource("se")]);
    expect(fed.results).toEqual([]);
    expect(fed.degraded).toBe(false);
  });

  it("drops a source that exceeds the per-source timeout without blocking", async () => {
    const slow: WebSource = {
      id: "slow",
      label: "slow",
      run: () => new Promise((resolve) => setTimeout(() => resolve({ results: [row("https://x/1", "x")], total: 1, status: okStatus() }), 1000)),
    };
    const fed = await federateWith("q", "discussions", [slow, okSource("hn", [row("https://hn/1", "a")])], { timeoutMs: 50 });
    expect(fed.results).toHaveLength(1);
    expect(fed.results[0].url).toBe("https://hn/1");
    expect(fed.perSource.find((s) => s.id === "slow")!.status.status).toBe("timeout");
  });
});

describe("federateWith — primary-led ordering", () => {
  function primarySource(id: string, results: UnifiedSearchResult[]): WebSource {
    return { id, label: id, primary: true, run: async () => ({ results, total: results.length, status: okStatus() }) };
  }

  it("leads with the primary source's native order, then appends the deduped tail", async () => {
    const exa = [row("https://exa/1", "e1"), row("https://exa/2", "e2")];
    const kw = [row("https://exa/1", "dup of e1"), row("https://kw/1", "k1")];
    const fed = await federateWith("q", "web", [
      okSource("searxng", kw),
      primarySource("exa", exa),
    ]);
    expect(fed.primaryLed).toBe(true);
    // Exa's two results lead in native order; only the non-duplicate keyword row tails.
    expect(fed.results.map((r) => r.url)).toEqual([
      "https://exa/1",
      "https://exa/2",
      "https://kw/1",
    ]);
    // The primary head is the SAME objects, unreordered (no rrfScore stamped on it).
    expect(fed.results[0]).toBe(exa[0]);
    expect(fed.results[0].rrfScore).toBeUndefined();
  });

  it("falls back to RRF (primaryLed false) when the primary source returns nothing", async () => {
    const fed = await federateWith("q", "web", [
      okSource("searxng", [row("https://kw/1", "k1")]),
      primarySource("exa", []), // unkeyed / empty
    ]);
    expect(fed.primaryLed).toBe(false);
    expect(fed.results.map((r) => r.url)).toEqual(["https://kw/1"]);
  });
});

describe("federateWith — paid-source budget guardrail", () => {
  it("skips a source over its daily budget (marks it rate_limited) without ever calling it, and still serves the free lanes", async () => {
    const cappedRun = vi.fn(async () => ({
      results: [row("https://exa/1", "exa result")],
      total: 1,
      status: okStatus(),
    }));
    const capped: WebSource = { id: "exa", label: "Exa", run: cappedRun };
    const free = okSource("searxng", [row("https://sx/1", "free result")]);

    const spy = vi
      .spyOn(sourceBudget, "canSpend")
      .mockImplementation(async (id: string) => id !== "exa");

    const fed = await federateWith("q", "web", [capped, free]);

    expect(cappedRun).not.toHaveBeenCalled();
    expect(fed.perSource.find((s) => s.id === "exa")?.status.status).toBe("rate_limited");
    expect(fed.results.some((r) => r.url === "https://sx/1")).toBe(true);

    spy.mockRestore();
  });
});

describe("braveSourceForTab", () => {
  const mockBrave = vi.mocked(searchBrave);

  it("web tab hits the web endpoint", async () => {
    const src = braveSourceForTab("web");
    expect(src.id).toBe("brave");
    await src.run("crispr base editing", { limit: 10 });
    expect(mockBrave).toHaveBeenCalledWith(
      "crispr base editing",
      expect.objectContaining({ kind: "web", limit: 10 })
    );
  });

  it("news tab hits the news endpoint and forwards the freshness window", async () => {
    const src = braveSourceForTab("news");
    expect(src.id).toBe("brave-news");
    await src.run("ozempic shortage", { limit: 10, timeRange: "week" });
    expect(mockBrave).toHaveBeenCalledWith(
      "ozempic shortage",
      expect.objectContaining({ kind: "news", timeRange: "week" })
    );
  });

  it("discussions tab scopes to reddit.com and tags results as discussions", async () => {
    const src = braveSourceForTab("discussions");
    expect(src.id).toBe("brave-reddit");
    await src.run("phd burnout", { limit: 10 });
    expect(mockBrave).toHaveBeenCalledWith(
      "phd burnout",
      expect.objectContaining({ kind: "web", siteFilter: "reddit.com", tag: "discussions" })
    );
  });
});
