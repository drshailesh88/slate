/**
 * Per-source health status for the unified search fan-out.
 *
 * A source returning zero results is ambiguous: it can mean "no matching
 * papers" (a true zero) or "the source failed" (timeout, rate limit, missing
 * config, upstream error). Collapsing both into `0 results` hides outages from
 * users. These helpers classify a failure so the API and UI can distinguish a
 * genuine empty result set from a degraded source.
 */

export type SourceStatusKind =
  | "ok"
  | "timeout"
  | "rate_limited"
  | "error"
  | "missing_config";

export interface SourceStatus {
  status: SourceStatusKind;
  /** Human-readable, key-safe explanation. Never contains secrets. */
  message?: string;
}

export function okStatus(): SourceStatus {
  return { status: "ok" };
}

/**
 * Pull an HTTP status code out of a resilient-fetch error message such as
 * "[PubMed] HTTP 403" or "[SemanticScholar] Failed after 3 retries: 429".
 */
export function extractHttpStatus(message: string): number | null {
  const direct = message.match(/HTTP (\d{3})/);
  if (direct) return parseInt(direct[1], 10);
  const afterRetries = message.match(/retries:\s*(\d{3})/);
  if (afterRetries) return parseInt(afterRetries[1], 10);
  return null;
}

function isTimeoutMessage(message: string): boolean {
  return /timed out|timeout|aborted|aborterror/i.test(message);
}

/**
 * Classify an error thrown by a source adapter (or its underlying fetch) into a
 * user-facing status. `hasApiKey` lets us tell "rate limited despite a key"
 * (rate_limited) apart from "rate limited because no key is configured"
 * (missing_config).
 */
export function classifyFetchError(
  error: unknown,
  opts: { hasApiKey?: boolean } = {}
): SourceStatus {
  const message = error instanceof Error ? error.message : String(error);

  if (isTimeoutMessage(message)) {
    return { status: "timeout", message: "Source timed out before responding" };
  }

  if (/circuit (open|breaker)/i.test(message)) {
    return {
      status: "error",
      message: "Temporarily disabled after repeated failures",
    };
  }

  const httpStatus = extractHttpStatus(message);

  if (httpStatus === 429) {
    return opts.hasApiKey
      ? { status: "rate_limited", message: "Rate limited by the source (HTTP 429)" }
      : {
          status: "missing_config",
          message: "Rate limited — no API key configured (HTTP 429)",
        };
  }

  if (httpStatus === 401 || httpStatus === 403) {
    return opts.hasApiKey
      ? {
          status: "error",
          message: `Authentication rejected (HTTP ${httpStatus}) — verify the API key`,
        }
      : {
          status: "missing_config",
          message: `Access denied (HTTP ${httpStatus}) — an API key is required`,
        };
  }

  return {
    status: "error",
    message: httpStatus ? `Upstream error (HTTP ${httpStatus})` : "Upstream error",
  };
}

/**
 * Classify a rejected `withSourceTimeout` reason at the route level. The route
 * wraps each source in a race against a timer, so a rejection is either our own
 * timeout or an error the adapter re-threw.
 */
export function classifyRejectionReason(reason: unknown): SourceStatus {
  const message = reason instanceof Error ? reason.message : String(reason);
  if (isTimeoutMessage(message)) {
    return { status: "timeout", message: "Source timed out before responding" };
  }
  return classifyFetchError(reason);
}

const NON_OK_SEVERITY: Record<Exclude<SourceStatusKind, "ok">, number> = {
  missing_config: 4,
  error: 3,
  rate_limited: 2,
  timeout: 1,
};

/** Pick the more severe of two non-ok statuses (for merging duplicate sources). */
export function moreSevereStatus(a: SourceStatus, b: SourceStatus): SourceStatus {
  if (a.status === "ok") return b;
  if (b.status === "ok") return a;
  return NON_OK_SEVERITY[a.status] >= NON_OK_SEVERITY[b.status] ? a : b;
}
