import { describe, it, expect, vi } from "vitest";
import { createResultCache, buildCacheKey } from "../result-cache";

const opts = { ttlSeconds: 60 };

describe("buildCacheKey", () => {
  it("is order-independent and normalizes strings", () => {
    const a = buildCacheKey("s", { query: "  TAVR Low Risk ", page: 0, sources: ["pubmed"] });
    const b = buildCacheKey("s", { sources: ["pubmed"], page: 0, query: "tavr low risk" });
    expect(a).toBe(b);
  });
  it("drops null/undefined", () => {
    expect(buildCacheKey("s", { q: "x", y: undefined, z: null })).toBe(buildCacheKey("s", { q: "x" }));
  });
});

describe("createResultCache", () => {
  it("computes on miss, then serves from memory within TTL", async () => {
    const t = 0;
    const cache = createResultCache({ now: () => t, redis: null });
    const compute = vi.fn(async () => ({ n: 1 }));
    const r1 = await cache.getOrCompute("k", compute, opts);
    expect(r1.hit).toBe("miss");
    const r2 = await cache.getOrCompute("k", compute, opts);
    expect(r2.hit).toBe("memory");
    expect(compute).toHaveBeenCalledTimes(1); // served from cache
  });

  it("recomputes after TTL expiry", async () => {
    let t = 0;
    const cache = createResultCache({ now: () => t, redis: null });
    const compute = vi.fn(async () => ({ n: t }));
    await cache.getOrCompute("k", compute, opts);
    t = 61_000; // past 60s TTL
    await cache.getOrCompute("k", compute, opts);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent identical computes (single-flight)", async () => {
    const cache = createResultCache({ now: () => 0, redis: null });
    let resolve!: (v: { n: number }) => void;
    const compute = vi.fn(() => new Promise<{ n: number }>((r) => (resolve = r)));
    const p1 = cache.getOrCompute("k", compute, opts);
    const p2 = cache.getOrCompute("k", compute, opts);
    resolve({ n: 42 });
    const [a, b] = await Promise.all([p1, p2]);
    expect(compute).toHaveBeenCalledTimes(1); // both awaited one compute
    expect(a.value).toEqual({ n: 42 });
    expect(b.value).toEqual({ n: 42 });
  });

  it("does NOT cache values failing shouldCache (e.g. degraded/empty)", async () => {
    const t = 0;
    const cache = createResultCache({ now: () => t, redis: null });
    const compute = vi.fn(async () => ({ results: [] as number[] }));
    const guard = { ttlSeconds: 60, shouldCache: (v: { results: number[] }) => v.results.length > 0 };
    await cache.getOrCompute("k", compute, guard);
    await cache.getOrCompute("k", compute, guard);
    expect(compute).toHaveBeenCalledTimes(2); // empty result never cached
  });

  it("serves stale-if-error after TTL when compute throws", async () => {
    let t = 0;
    const cache = createResultCache({ now: () => t, redis: null });
    let mode: "ok" | "throw" = "ok";
    const compute = vi.fn(async () => {
      if (mode === "throw") throw new Error("upstream down");
      return { n: 1 };
    });
    await cache.getOrCompute("k", compute, { ttlSeconds: 60, staleSeconds: 3600 });
    t = 61_000; // expired, but within staleUntil
    mode = "throw";
    const r = await cache.getOrCompute("k", compute, { ttlSeconds: 60, staleSeconds: 3600 });
    expect(r.value).toEqual({ n: 1 }); // stale served instead of throwing
    expect(r.hit).toBe("stale");
  });
});
