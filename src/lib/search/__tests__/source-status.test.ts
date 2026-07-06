import { describe, it, expect } from "vitest";
import {
  classifyFetchError,
  classifyRejectionReason,
  extractHttpStatus,
  moreSevereStatus,
  okStatus,
} from "@/lib/search/source-status";

describe("extractHttpStatus", () => {
  it("reads a direct HTTP code", () => {
    expect(extractHttpStatus("[PubMed] HTTP 403")).toBe(403);
  });

  it("reads a code from an exhausted-retries message", () => {
    expect(extractHttpStatus("[SemanticScholar] Failed after 3 retries: 429")).toBe(
      429
    );
  });

  it("returns null when there is no code", () => {
    expect(extractHttpStatus("network exploded")).toBeNull();
  });
});

describe("classifyFetchError", () => {
  it("classifies a timeout regardless of key", () => {
    const status = classifyFetchError(
      new Error("[PubMed] Request timed out after 15000ms")
    );
    expect(status.status).toBe("timeout");
  });

  it("treats 429 with a key as rate_limited", () => {
    const status = classifyFetchError(
      new Error("[SemanticScholar] Failed after 3 retries: 429"),
      { hasApiKey: true }
    );
    expect(status.status).toBe("rate_limited");
  });

  it("treats 429 without a key as missing_config", () => {
    const status = classifyFetchError(
      new Error("[SemanticScholar] Failed after 3 retries: 429"),
      { hasApiKey: false }
    );
    expect(status.status).toBe("missing_config");
  });

  it("treats 403 with a key as an error (invalid key)", () => {
    const status = classifyFetchError(new Error("[SemanticScholar] HTTP 403"), {
      hasApiKey: true,
    });
    expect(status.status).toBe("error");
    expect(status.message).toMatch(/API key/i);
  });

  it("treats 401/403 without a key as missing_config", () => {
    const status = classifyFetchError(new Error("[Source] HTTP 401"), {
      hasApiKey: false,
    });
    expect(status.status).toBe("missing_config");
  });

  it("classifies a circuit-open failure as error", () => {
    const status = classifyFetchError(new Error("[PubMed] circuit open"));
    expect(status.status).toBe("error");
  });

  it("falls back to a generic upstream error", () => {
    const status = classifyFetchError(new Error("[OpenAlex] HTTP 500"));
    expect(status.status).toBe("error");
    expect(status.message).toMatch(/500/);
  });
});

describe("classifyRejectionReason", () => {
  it("maps a route-level timeout rejection to timeout", () => {
    const status = classifyRejectionReason(
      new Error("PubMed timed out after 12000ms")
    );
    expect(status.status).toBe("timeout");
  });
});

describe("moreSevereStatus", () => {
  it("prefers a non-ok status over ok", () => {
    expect(moreSevereStatus(okStatus(), { status: "timeout" }).status).toBe(
      "timeout"
    );
  });

  it("keeps the more severe of two failures", () => {
    expect(
      moreSevereStatus({ status: "timeout" }, { status: "missing_config" }).status
    ).toBe("missing_config");
  });
});
