import { describe, it, expect } from "vitest";
import { isTransientEmpty } from "../transient-empty";
import type { SourceStatusKind } from "@/lib/search/source-status";

const lane = (status: SourceStatusKind) => ({ status });

describe("isTransientEmpty", () => {
  it("flags an empty result with a rate-limited lane as recoverable", () => {
    expect(isTransientEmpty(0, [lane("ok"), lane("rate_limited")])).toBe(true);
  });

  it("flags an empty result with a timed-out lane as recoverable", () => {
    expect(isTransientEmpty(0, [lane("timeout")])).toBe(true);
  });

  it("flags an empty result with an upstream-error lane as recoverable", () => {
    expect(isTransientEmpty(0, [lane("error")])).toBe(true);
  });

  it("does NOT retry a genuinely empty query (every lane ok, just no papers)", () => {
    expect(isTransientEmpty(0, [lane("ok"), lane("ok")])).toBe(false);
  });

  it("does NOT retry when the only non-ok lane is dormant (missing_config)", () => {
    // A missing API key / unconfigured index will not recover on retry.
    expect(isTransientEmpty(0, [lane("ok"), lane("missing_config")])).toBe(false);
  });

  it("treats a DEGRADED pool (below minHealthy) with a transient lane as recoverable", () => {
    expect(isTransientEmpty(2, [lane("ok"), lane("timeout")])).toBe(true);
  });

  it("does NOT recover a HEALTHY pool even if a lane failed transiently", () => {
    // We already have enough results; a flaky lane is not worth a recovery pass.
    expect(isTransientEmpty(5, [lane("rate_limited")])).toBe(false);
  });

  it("respects a custom minHealthy threshold", () => {
    expect(isTransientEmpty(4, [lane("timeout")], { minHealthy: 6 })).toBe(true);
    expect(isTransientEmpty(6, [lane("timeout")], { minHealthy: 6 })).toBe(false);
  });

  it("returns false when there are no lanes to recover", () => {
    expect(isTransientEmpty(0, [])).toBe(false);
  });
});
