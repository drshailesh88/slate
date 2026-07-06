import type { SourceStatusKind } from "@/lib/search/source-status";

/**
 * Lane statuses a retry can plausibly recover from. A throttled, timed-out, or
 * transiently-erroring lane may yield results on a second attempt — unlike a
 * dormant lane (`missing_config`: no API key / unconfigured index), which will
 * fail identically, or an `ok` lane that simply found nothing.
 */
const TRANSIENT_KINDS: ReadonlySet<SourceStatusKind> = new Set([
  "timeout",
  "rate_limited",
  "error",
]);

export interface LaneHealth {
  status: SourceStatusKind;
}

/**
 * Decide whether an empty/degraded fused result is plausibly RECOVERABLE — i.e.
 * caused by a transient lane failure (timeout / rate-limit / upstream error)
 * rather than a genuine zero-result. A legitimately empty query (every lane
 * returned `ok` with no papers) must NOT trigger a retry, or we would loop and
 * waste the fan-out budget on questions that truly have no answer. A dormant
 * lane (`missing_config`) is likewise non-transient: a retry cannot fix it.
 *
 * @param fusedCount how many candidates survived fusion
 * @param lanes the per-lane health for this query's fan-out
 * @param opts.minHealthy pool size at/above which no recovery is warranted (default 3)
 */
export function isTransientEmpty(
  fusedCount: number,
  lanes: readonly LaneHealth[],
  opts: { minHealthy?: number } = {}
): boolean {
  const minHealthy = opts.minHealthy ?? 3;
  if (fusedCount >= minHealthy) return false;
  return lanes.some((l) => TRANSIENT_KINDS.has(l.status));
}
