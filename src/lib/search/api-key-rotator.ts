/**
 * Round-robin API key rotator.
 * Thread-safe for Node.js single-threaded event loop.
 *
 * Usage:
 *   const rotator = createKeyRotator(process.env.PUBMED_API_KEYS?.split(',') ?? []);
 *   const key = rotator.next(); // returns next key in rotation, or undefined if no keys
 */

export interface KeyRotator {
  /** Returns the next key in round-robin order, or undefined if no keys are configured. */
  next(): string | undefined;
  /** The number of keys available for rotation. */
  count: number;
}

export function createKeyRotator(keys: string[]): KeyRotator {
  const filtered = keys.map((k) => k.trim()).filter((k) => k.length > 0);
  let index = 0;

  return {
    next(): string | undefined {
      if (filtered.length === 0) return undefined;
      const key = filtered[index % filtered.length];
      console.debug(`[PubMed] Using key index: ${index % filtered.length}`);
      index = (index + 1) % filtered.length;
      return key;
    },
    get count() {
      return filtered.length;
    },
  };
}
