export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerOptions {
  /** Number of consecutive failures before opening circuit. Default: 5 */
  failureThreshold?: number;
  /** How long to wait (ms) before trying again. Default: 30000 (30s) */
  resetTimeout?: number;
  /** Service name for logging */
  service: string;
}

/**
 * Simple circuit-breaker that prevents hammering a dead service.
 *
 * When closed: requests pass through normally
 * When open (too many failures): requests fail immediately with a clear error
 * After resetTimeout: moves to half-open, allows ONE request through
 *   - If it succeeds: back to closed
 *   - If it fails: back to open
 */
export function createCircuitBreaker(options: CircuitBreakerOptions) {
  const {
    failureThreshold = 5,
    resetTimeout = 30000,
    service,
  } = options;

  let state: CircuitState = "closed";
  let consecutiveFailures = 0;
  let lastFailureTime = 0;

  return {
    /** Call before making a request. Returns false if circuit is open. */
    canRequest(): boolean {
      if (state === "closed") {
        return true;
      }

      if (state === "open") {
        const elapsed = Date.now() - lastFailureTime;
        if (elapsed >= resetTimeout) {
          state = "half-open";
          console.warn(`[${service}] Circuit half-open — allowing test request`);
          return true;
        }
        return false;
      }

      // half-open: allow the single test request
      return true;
    },

    /** Call after a successful request */
    onSuccess(): void {
      if (state === "half-open") {
        console.warn(`[${service}] Circuit closed — service recovered`);
      }
      state = "closed";
      consecutiveFailures = 0;
    },

    /** Call after a failed request */
    onFailure(): void {
      consecutiveFailures++;
      lastFailureTime = Date.now();

      if (state === "half-open") {
        state = "open";
        console.warn(
          `[${service}] Circuit re-opened — test request failed`
        );
        return;
      }

      if (consecutiveFailures >= failureThreshold) {
        state = "open";
        console.warn(
          `[${service}] Circuit opened after ${consecutiveFailures} consecutive failures`
        );
      }
    },

    /** Current state for monitoring */
    get state(): CircuitState {
      return state;
    },
  };
}
