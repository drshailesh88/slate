import { describe, it, expect, vi } from "vitest";
import { createKeyRotator } from "../api-key-rotator";

describe("createKeyRotator", () => {
  it("returns keys in round-robin order", () => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
    const rotator = createKeyRotator(["key1", "key2", "key3"]);
    expect(rotator.next()).toBe("key1");
    expect(rotator.next()).toBe("key2");
    expect(rotator.next()).toBe("key3");
    expect(rotator.next()).toBe("key1");
  });

  it("returns undefined for empty keys", () => {
    const rotator = createKeyRotator([]);
    expect(rotator.next()).toBeUndefined();
  });

  it("filters empty strings", () => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
    const rotator = createKeyRotator(["key1", "", "  ", "key2"]);
    expect(rotator.count).toBe(2);
    expect(rotator.next()).toBe("key1");
    expect(rotator.next()).toBe("key2");
  });

  it("trims whitespace from keys", () => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
    const rotator = createKeyRotator(["  key1  ", "key2 "]);
    expect(rotator.next()).toBe("key1");
    expect(rotator.next()).toBe("key2");
  });

  it("reports correct count", () => {
    const rotator = createKeyRotator(["a", "b", "c"]);
    expect(rotator.count).toBe(3);
  });

  it("handles single key", () => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
    const rotator = createKeyRotator(["only"]);
    expect(rotator.next()).toBe("only");
    expect(rotator.next()).toBe("only");
    expect(rotator.count).toBe(1);
  });

  it("wraps around correctly after many calls", () => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
    const rotator = createKeyRotator(["a", "b"]);
    for (let i = 0; i < 100; i++) {
      const key = rotator.next();
      expect(key).toBe(i % 2 === 0 ? "a" : "b");
    }
  });
});
