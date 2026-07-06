/**
 * Outbound (client-side) rate limiter — a per-upstream token bucket.
 *
 * The cascade-to-empty failure mode is largely self-inflicted: with no outbound
 * throttle we fire past an upstream's rate limit, MANUFACTURE 429s, then layered
 * retries pin the source at 429 until its circuit breaker opens and the lane
 * returns nothing. Pacing requests to each source's documented rate prevents the
 * 429s at the source. (Generalizes the ad-hoc OpenAlex pacing.)
 *
 * In-memory per process: paces within a warm serverless instance. Cross-instance
 * coordination (Upstash) is a later upgrade; in-process pacing already removes
 * the dominant self-inflicted-burst case. Burst allows a few concurrent calls
 * (e.g. a source's lexical + semantic lanes) before pacing kicks in.
 */

/** Pure token math: tokens available now given elapsed time. Exposed for tests. */
export function refillTokens(
  tokens: number,
  lastMs: number,
  nowMs: number,
  ratePerSec: number,
  burst: number
): number {
  const refilled = tokens + ((nowMs - lastMs) / 1000) * ratePerSec;
  return Math.min(burst, refilled);
}

export interface OutboundLimiter {
  /** Resolves when a token is available (paces concurrent callers). */
  acquire(): Promise<void>;
  /** Tokens currently available (after refill) — for tests/metrics. */
  available(): number;
}

export function createOutboundLimiter(opts: {
  service: string;
  requestsPerSecond: number;
  /** Max tokens (concurrent burst). Default: ceil(rps), min 1. */
  burst?: number;
  /** Injectable clock for tests. Default: Date.now. */
  now?: () => number;
}): OutboundLimiter {
  const rate = Math.max(0.1, opts.requestsPerSecond);
  const burst = Math.max(1, opts.burst ?? Math.ceil(rate));
  const now = opts.now ?? Date.now;

  let tokens = burst;
  let last = now();
  // Serialize the "wait then take" so concurrent acquires don't all grab the
  // same token; each waiter is released in turn.
  let tail: Promise<void> = Promise.resolve();

  function take(): boolean {
    const t = now();
    tokens = refillTokens(tokens, last, t, rate, burst);
    last = t;
    if (tokens >= 1) {
      tokens -= 1;
      return true;
    }
    return false;
  }

  async function waitForToken(): Promise<void> {
    // Loop until a token frees up; sleep the minimum time to earn one.
    for (;;) {
      if (take()) return;
      const deficit = 1 - tokens;
      const waitMs = Math.max(5, Math.ceil((deficit / rate) * 1000));
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }

  return {
    acquire(): Promise<void> {
      // Chain on the tail so callers are paced in arrival order.
      const result = tail.then(() => waitForToken());
      tail = result.catch(() => undefined);
      return result;
    },
    available(): number {
      tokens = refillTokens(tokens, last, now(), rate, burst);
      last = now();
      return tokens;
    },
  };
}
