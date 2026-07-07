/**
 * Two-tier result cache with request coalescing + stale-if-error.
 *
 * Why: literature-search results are slow-changing, but each query fans out to
 * 6-8 rate-limited upstream APIs. Caching cuts both latency AND upstream-call
 * pressure (the rate-limit relief that prevents cascade-to-empty).
 *
 *  - Tier 1: in-process Map (warm serverless instance) — ~0ms.
 *  - Tier 2: Upstash Redis when configured (shared across instances) — ~1-2ms.
 *  - Request coalescing (single-flight): concurrent identical queries await one
 *    compute instead of each fanning out (per instance).
 *  - stale-if-error: if compute throws, serve a still-retained stale entry.
 *  - `shouldCache`: NEVER cache degraded/empty results (so a throttled empty
 *    response can't poison the cache).
 *
 * No new dependency: uses the already-installed `@upstash/redis`, falling back to
 * memory-only when Upstash env vars are absent (dev / unconfigured).
 */

interface Entry<T> {
  value: T;
  /** Hard expiry: after this, a fresh compute is required (unless error → stale). */
  expiresAt: number;
  /** Retained-until: kept past expiry purely for stale-if-error fallback. */
  staleUntil: number;
}

export interface ResultCacheOptions<T> {
  ttlSeconds: number;
  /** Extra seconds to retain an expired entry for stale-if-error. Default: 6h. */
  staleSeconds?: number;
  /** Only cache values that pass this guard (e.g. non-empty, non-degraded). */
  shouldCache?: (value: T) => boolean;
}

export type CacheHit = "memory" | "redis" | "stale" | "miss";

interface RedisLike {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, opts: { ex: number }): Promise<unknown>;
}

export function createResultCache(deps?: {
  now?: () => number;
  redis?: RedisLike | null;
}) {
  const now = deps?.now ?? Date.now;
  const mem = new Map<string, Entry<unknown>>();
  const inflight = new Map<string, Promise<unknown>>();

  // Resolve Upstash lazily once. `deps.redis` overrides (tests / DI).
  let redis: RedisLike | null | undefined =
    deps && "redis" in deps ? deps.redis ?? null : undefined;
  function getRedis(): RedisLike | null {
    if (redis !== undefined) return redis;
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    redis = null;
    if (url && token) {
      try {
        // Lazy require keeps the dep out of the hot path when unconfigured.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { Redis } = require("@upstash/redis");
        redis = new Redis({ url, token }) as RedisLike;
      } catch {
        redis = null;
      }
    }
    return redis;
  }

  async function getOrCompute<T>(
    key: string,
    compute: () => Promise<T>,
    opts: ResultCacheOptions<T>
  ): Promise<{ value: T; hit: CacheHit }> {
    const t = now();
    const staleSeconds = opts.staleSeconds ?? 6 * 3600;

    // Tier 1: fresh in-memory entry.
    const m = mem.get(key) as Entry<T> | undefined;
    if (m && m.expiresAt > t) return { value: m.value, hit: "memory" };

    // Coalesce concurrent identical computes (per instance).
    const existing = inflight.get(key) as Promise<T> | undefined;
    if (existing) return { value: await existing, hit: "memory" };

    const promise = (async (): Promise<T> => {
      // Tier 2: Redis.
      const r = getRedis();
      if (r) {
        try {
          const cached = await r.get(key);
          if (cached != null) {
            const value = cached as T;
            mem.set(key, { value, expiresAt: t + opts.ttlSeconds * 1000, staleUntil: t + (opts.ttlSeconds + staleSeconds) * 1000 });
            return value;
          }
        } catch {
          /* Redis read failed — fall through to compute. */
        }
      }

      // Miss → compute.
      try {
        const value = await compute();
        if (!opts.shouldCache || opts.shouldCache(value)) {
          mem.set(key, {
            value,
            expiresAt: t + opts.ttlSeconds * 1000,
            staleUntil: t + (opts.ttlSeconds + staleSeconds) * 1000,
          });
          if (r) {
            try {
              await r.set(key, value, { ex: opts.ttlSeconds + staleSeconds });
            } catch {
              /* best-effort write */
            }
          }
        }
        return value;
      } catch (err) {
        // stale-if-error: serve a retained (expired-but-not-purged) entry.
        const stale = mem.get(key) as Entry<T> | undefined;
        if (stale && stale.staleUntil > t) return stale.value;
        throw err;
      }
    })();

    inflight.set(key, promise as Promise<unknown>);
    try {
      const value = await promise;
      // Distinguish stale (served from an expired-but-retained entry) for callers.
      const after = mem.get(key) as Entry<T> | undefined;
      const hit: CacheHit = after && after.expiresAt > t ? "miss" : "stale";
      return { value, hit };
    } finally {
      inflight.delete(key);
    }
  }

  return { getOrCompute, _mem: mem };
}

/** Stable cache key: schema-versioned + normalized params (key order independent). */
export function buildCacheKey(prefix: string, params: Record<string, unknown>): string {
  const normalized: Record<string, unknown> = {};
  for (const k of Object.keys(params).sort()) {
    const v = params[k];
    if (v === undefined || v === null) continue;
    normalized[k] = typeof v === "string" ? v.trim().toLowerCase() : v;
  }
  return `${prefix}:${JSON.stringify(normalized)}`;
}

/** Shared default instance for the search path. */
export const searchResultCache = createResultCache();
