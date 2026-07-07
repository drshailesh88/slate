import { describe, it, expect } from "vitest";
import { settleWithinDeadline } from "../run-search";
import type { UnifiedSearchResult } from "@/types/search";

const ok = (source: string) => ({
  source,
  results: [] as UnifiedSearchResult[],
  total: 1,
  status: { status: "ok" as const },
});

describe("settleWithinDeadline", () => {
  it("returns lanes that resolve before the deadline as-is", async () => {
    const fast = Promise.resolve(ok("pubmed"));
    const res = await settleWithinDeadline([fast], ["pubmed"], 100);
    expect(res[0].source).toBe("pubmed");
    expect(res[0].total).toBe(1);
    expect(res[0].status.status).toBe("ok");
  });

  it("drops lanes still pending at the deadline (partial results, labelled timeout)", async () => {
    const fast = Promise.resolve(ok("pubmed"));
    const slow = new Promise<ReturnType<typeof ok>>((r) => setTimeout(() => r(ok("openalex")), 300));
    const res = await settleWithinDeadline([fast, slow], ["pubmed", "openalex"], 50);
    expect(res[0].source).toBe("pubmed"); // resolved in time
    // slow lane dropped but labelled + marked degraded (partial-not-empty contract)
    expect(res[1].source).toBe("openalex");
    expect(res[1].total).toBe(0);
    expect(res[1].status.status).toBe("timeout");
  });

  it("never blocks past the deadline even if all lanes are slow", async () => {
    const slow = () => new Promise<ReturnType<typeof ok>>((r) => setTimeout(() => r(ok("x")), 1000));
    const start = Date.now();
    const res = await settleWithinDeadline([slow(), slow()], ["a", "b"], 40);
    expect(Date.now() - start).toBeLessThan(400); // returned ~at deadline, not 1000ms
    expect(res.every((r) => r.status.status === "timeout")).toBe(true);
  });
});
