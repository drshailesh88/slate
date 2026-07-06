import { createCircuitBreaker } from "@/lib/http/circuit-breaker";
import { resilientFetch } from "@/lib/http/resilient-fetch";

const breaker = createCircuitBreaker({ service: "Supadata", failureThreshold: 5 });

const ENDPOINT = "https://api.supadata.ai/v1/youtube/transcript";

/** A timestamped transcript segment. `offset`/`duration` are in milliseconds. */
export interface TranscriptSegment {
  text: string;
  offset: number;
  duration: number;
}

export interface YouTubeTranscript {
  /** Joined plain text — for the notes LLM and search. */
  text: string;
  /** Timestamped segments — for the transcript pane and every timestamp link. */
  segments: TranscriptSegment[];
  lang: string;
  availableLangs: string[];
}

interface SupadataSegment {
  text?: string;
  offset?: number;
  duration?: number;
}

interface SupadataResponse {
  /** Array of timestamped segments (default) or a plain string (`text=true`). */
  content?: SupadataSegment[] | string;
  lang?: string;
  availableLangs?: string[];
  error?: string;
  message?: string;
}

export type TranscriptResult =
  | { ok: true; transcript: YouTubeTranscript }
  | { ok: false; reason: "missing_config" | "no_transcript" | "error"; message: string };

/**
 * Fetch a YouTube transcript via Supadata's endpoint as TIMESTAMPED SEGMENTS (the
 * default `content` shape — an array of `{text, offset, duration}` in ms), preferring
 * English. Segments power the transcript pane and every timestamp link; their texts are
 * joined for the notes LLM. A video with no caption track is a normal outcome
 * (`no_transcript`), not a server fault, so the circuit breaker isn't tripped for it.
 */
export async function fetchYouTubeTranscript(videoId: string): Promise<TranscriptResult> {
  const key = process.env.SUPADATA_API_KEY;
  if (!key) {
    return { ok: false, reason: "missing_config", message: "SUPADATA_API_KEY not set" };
  }
  if (!breaker.canRequest()) {
    return { ok: false, reason: "error", message: "Circuit breaker open — recent Supadata failures" };
  }

  const url = new URL(ENDPOINT);
  url.searchParams.set("videoId", videoId);
  url.searchParams.set("lang", "en");

  try {
    const res = await resilientFetch(
      url.toString(),
      { headers: { "x-api-key": key, Accept: "application/json" } },
      { service: "Supadata", timeout: 30000, baseDelay: 800, maxRetries: 1 }
    );
    const data = (await res.json()) as SupadataResponse;

    // Normalize both shapes: segmented array (default) or plain string (legacy `text=true`).
    const rawSegments: SupadataSegment[] = Array.isArray(data.content)
      ? data.content
      : typeof data.content === "string" && data.content.trim()
        ? [{ text: data.content.trim(), offset: 0, duration: 0 }]
        : [];
    const segments: TranscriptSegment[] = rawSegments
      .map((s) => ({
        text: (s.text ?? "").trim(),
        offset: Number(s.offset) || 0,
        duration: Number(s.duration) || 0,
      }))
      .filter((s) => s.text.length > 0);
    const text = segments.map((s) => s.text).join(" ").trim();

    if (!text) {
      breaker.onSuccess(); // reachable API, just no captions for this video
      return {
        ok: false,
        reason: "no_transcript",
        message: data.error || data.message || "No transcript available for this video",
      };
    }

    breaker.onSuccess();
    return {
      ok: true,
      transcript: {
        text,
        segments,
        lang: data.lang ?? "en",
        availableLangs: data.availableLangs ?? [],
      },
    };
  } catch (error) {
    breaker.onFailure();
    console.error("[Supadata] transcript fetch failed:", error);
    return {
      ok: false,
      reason: "error",
      message: error instanceof Error ? error.message : "transcript fetch failed",
    };
  }
}
