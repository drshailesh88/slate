export interface ResilientFetchOptions {
  /** Max retries on retriable errors (429, 503, 504, network error). Default: 3 */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff. Default: 500 */
  baseDelay?: number;
  /** Max delay cap in ms. Default: 10000 */
  maxDelay?: number;
  /** Request timeout in ms. Default: 15000 (15 seconds) */
  timeout?: number;
  /** Service name for logging. E.g. "PubMed", "SemanticScholar" */
  service: string;
  /** Optional: callback before retry (e.g., to rotate API keys) */
  onRetry?: (attempt: number, status: number) => void;
}

const RETRIABLE_STATUS_CODES = new Set([429, 503, 504]);

function isRetriableStatus(status: number): boolean {
  return RETRIABLE_STATUS_CODES.has(status);
}

/** Add ±20% jitter to a delay value to prevent thundering herd */
function addJitter(delay: number): number {
  const jitter = delay * 0.2;
  return delay + (Math.random() * 2 - 1) * jitter;
}

/**
 * Fetch with retry, timeout, and configurable resilience.
 *
 * Retries on: 429 (rate limit), 503 (service unavailable), 504 (gateway timeout), network errors
 * Does NOT retry on: 400, 401, 403, 404 (client errors — retrying won't help)
 *
 * Respects Retry-After header if present.
 * Enforces a timeout so no request hangs forever.
 * Logs warnings on retries and errors on final failure.
 */
export async function resilientFetch(
  url: string,
  init?: RequestInit,
  options?: ResilientFetchOptions
): Promise<Response> {
  const {
    maxRetries = 3,
    baseDelay = 500,
    maxDelay = 10000,
    timeout = 15000,
    service = "Unknown",
    onRetry,
  } = options ?? { service: "Unknown" };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        return response;
      }

      if (!isRetriableStatus(response.status)) {
        throw new Error(`[${service}] HTTP ${response.status}`);
      }

      // Retriable status — retry if we have attempts left
      if (attempt < maxRetries) {
        const retryAfter = response.headers.get("Retry-After");
        let delay: number;

        if (retryAfter) {
          const parsed = parseInt(retryAfter, 10);
          delay = isNaN(parsed) ? baseDelay * Math.pow(2, attempt) : parsed * 1000;
        } else {
          delay = baseDelay * Math.pow(2, attempt);
        }

        // ALWAYS cap the delay — a source can return an absurd Retry-After
        // (e.g. OpenAlex once returned ~44,500s), which would otherwise hang the
        // request for hours. Better to give up after maxDelay and fail open.
        delay = addJitter(Math.min(delay, maxDelay));

        console.warn(
          `[${service}] Retry ${attempt + 1}/${maxRetries} after ${response.status} (delay: ${Math.round(delay)}ms)`
        );

        onRetry?.(attempt + 1, response.status);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      // Out of retries
      console.error(
        `[${service}] Failed after ${maxRetries} retries: ${response.status}`
      );
      throw new Error(
        `[${service}] Failed after ${maxRetries} retries: ${response.status}`
      );
    } catch (error) {
      clearTimeout(timeoutId);

      // AbortController timeout or network error
      const isAbort =
        error instanceof DOMException && error.name === "AbortError";
      const isNetwork =
        error instanceof TypeError && error.message.includes("fetch");

      if (isAbort || isNetwork) {
        lastError = isAbort
          ? new Error(`[${service}] Request timed out after ${timeout}ms`)
          : (error as Error);

        if (attempt < maxRetries) {
          const delay = addJitter(
            Math.min(baseDelay * Math.pow(2, attempt), maxDelay)
          );

          console.warn(
            `[${service}] Retry ${attempt + 1}/${maxRetries} after ${isAbort ? "timeout" : "network error"} (delay: ${Math.round(delay)}ms)`
          );

          onRetry?.(attempt + 1, isAbort ? 0 : -1);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        console.error(
          `[${service}] Failed after ${maxRetries} retries: ${isAbort ? "timeout" : "network error"}`
        );
        throw lastError;
      }

      // Non-retriable error (e.g., 400/401/403/404 thrown above)
      throw error;
    }
  }

  // Should not be reached, but TypeScript needs it
  throw lastError ?? new Error(`[${service}] Unexpected failure`);
}
