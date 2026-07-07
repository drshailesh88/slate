/**
 * Per-source daily spend guardrail for the paid non-academic search sources.
 *
 * The paid tabs fan out to metered upstreams (Exa, Brave, NewsData). This bounds how
 * many paid calls each billing family can make per day; once a family hits its cap the
 * federation simply drops that source and runs on the remaining (free) lanes — cost
 * becomes a dial, not a surprise (IMPROVEMENT-PLAN §1). Counting is best-effort and
 * fail-open: if the counter store errors, the call is ALLOWED (search availability wins
 * over a perfectly-enforced cap). Shared Upstash counter in prod; per-instance in-memory
 * fallback when Upstash is absent.
 */

export type BudgetFamily = "exa" | "brave" | "newsdata";

/** Map a federation source id to its billing family, or null if the source is free. */
export function budgetFamily(sourceId: string): BudgetFamily | null {
  if (sourceId.startsWith("exa")) return "exa";
  if (sourceId.startsWith("brave")) return "brave";
  if (sourceId === "newsdata") return "newsdata";
  return null;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function defaultCaps(): Record<BudgetFamily, number> {
  return {
    exa: envInt("BUDGET_EXA_DAILY", 2000),
    brave: envInt("BUDGET_BRAVE_DAILY", 800),
    newsdata: envInt("BUDGET_NEWSDATA_DAILY", 180),
  };
}

interface RedisLike {
  get(key: string): Promise<unknown>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
}

const TWO_DAYS_SECONDS = 2 * 24 * 3600;

export function createSourceBudget(deps?: {
  now?: () => number;
  redis?: RedisLike | null;
  caps?: Partial<Record<BudgetFamily, number>>;
}) {
  const now = deps?.now ?? Date.now;
  const caps = { ...defaultCaps(), ...deps?.caps };
  const mem = new Map<string, number>();

  let redis: RedisLike | null | undefined =
    deps && "redis" in deps ? deps.redis ?? null : undefined;
  function getRedis(): RedisLike | null {
    if (redis !== undefined) return redis;
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    redis = null;
    if (url && token) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { Redis } = require("@upstash/redis");
        redis = new Redis({ url, token }) as RedisLike;
      } catch {
        redis = null;
      }
    }
    return redis;
  }

  function dayKey(family: BudgetFamily): string {
    const day = new Date(now()).toISOString().slice(0, 10);
    return `budget:${family}:${day}`;
  }

  async function count(family: BudgetFamily): Promise<number> {
    const key = dayKey(family);
    const r = getRedis();
    if (r) {
      const raw = await r.get(key);
      return typeof raw === "number" ? raw : Number(raw ?? 0) || 0;
    }
    return mem.get(key) ?? 0;
  }

  async function canSpend(sourceId: string): Promise<boolean> {
    const family = budgetFamily(sourceId);
    if (!family) return true;
    const cap = caps[family];
    if (!cap || cap <= 0) return true;
    try {
      return (await count(family)) < cap;
    } catch {
      return true; // fail-open: never block search on a counter error
    }
  }

  async function recordSpend(sourceId: string): Promise<void> {
    const family = budgetFamily(sourceId);
    if (!family) return;
    const key = dayKey(family);
    try {
      const r = getRedis();
      if (r) {
        await r.incr(key);
        await r.expire(key, TWO_DAYS_SECONDS);
      } else {
        mem.set(key, (mem.get(key) ?? 0) + 1);
      }
    } catch {
      // fail-open: a counter error must not break the search path.
    }
  }

  return { canSpend, recordSpend };
}

export const sourceBudget = createSourceBudget();
