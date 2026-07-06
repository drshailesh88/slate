// Rate limiting utility
// Uses in-memory sliding window when Upstash is not configured (dev),
// or @upstash/ratelimit + @upstash/redis in production.

import { NextResponse } from "next/server";

interface RateLimitConfig {
  /** Max requests allowed in the window */
  limit: number;
  /** Window duration in seconds */
  windowSeconds: number;
}

// In-memory rate limiter for dev / when Upstash is not configured
const windowMap = new Map<string, { count: number; resetAt: number }>();

function inMemoryCheck(
  key: string,
  config: RateLimitConfig
): { success: boolean; remaining: number } {
  const now = Date.now();
  const entry = windowMap.get(key);

  if (!entry || now > entry.resetAt) {
    windowMap.set(key, { count: 1, resetAt: now + config.windowSeconds * 1000 });
    return { success: true, remaining: config.limit - 1 };
  }

  if (entry.count >= config.limit) {
    return { success: false, remaining: 0 };
  }

  entry.count += 1;
  return { success: true, remaining: config.limit - entry.count };
}

// Periodically clean up expired entries to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of windowMap) {
    if (now > entry.resetAt) {
      windowMap.delete(key);
    }
  }
}, 60_000);

/**
 * Check rate limit for a given user/key.
 * Returns null if allowed, or a 429 Response if rate limited.
 */
export async function checkRateLimit(
  userId: string,
  endpoint: string,
  config: RateLimitConfig
): Promise<Response | null> {
  const key = `${userId}:${endpoint}`;

  // Use Upstash if configured
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      const { Ratelimit } = await import("@upstash/ratelimit");
      const { Redis } = await import("@upstash/redis");

      const redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });

      const ratelimit = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(config.limit, `${config.windowSeconds} s`),
        prefix: "scholarsync",
      });

      const { success, remaining } = await ratelimit.limit(key);
      if (!success) {
        return NextResponse.json(
          { error: "Rate limit exceeded. Please try again later." },
          {
            status: 429,
            headers: { "X-RateLimit-Remaining": String(remaining) },
          }
        );
      }
      return null;
    } catch {
      // Fall through to in-memory if Upstash fails
    }
  }

  // Fallback to in-memory rate limiting
  const { success, remaining } = inMemoryCheck(key, config);
  if (!success) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please try again later." },
      {
        status: 429,
        headers: { "X-RateLimit-Remaining": String(remaining) },
      }
    );
  }

  return null;
}

// Preset rate limit configs
export const RATE_LIMITS = {
  /** AI chat/generation endpoints: 60 requests per hour */
  ai: { limit: 60, windowSeconds: 3600 },
  /** Search endpoints: 120 requests per hour */
  search: { limit: 120, windowSeconds: 3600 },
  /** Export endpoints: 30 requests per hour */
  export: { limit: 30, windowSeconds: 3600 },
  /** Audio overview generation: 10 requests per hour */
  "audio-overview": { limit: 10, windowSeconds: 3600 },
  /** Plagiarism/integrity check: 20 requests per hour */
  analysis: { limit: 20, windowSeconds: 3600 },
  /** Embedding: 60 requests per hour */
  embed: { limit: 60, windowSeconds: 3600 },
  /** Write/save endpoints: 30 requests per hour */
  write: { limit: 30, windowSeconds: 3600 },
  /** Feed operations: 60 requests per hour */
  feeds: { limit: 60, windowSeconds: 3600 },
  /** Slide image generation: 20 requests per hour */
  "slide-images": { limit: 20, windowSeconds: 3600 },
} as const;
