import scimagoData from "@/data/scimago-medicine-2023.json";

interface ScimagoEntry {
  title: string;
  titleOriginal: string;
  quartile: "Q1" | "Q2" | "Q3" | "Q4" | null;
  citesPerDoc2y: number;
  sjr: number;
  hIndex: number;
}

export interface JournalQuality {
  quartile: "Q1" | "Q2" | "Q3" | "Q4" | null;
  citesPerDoc2y: number | null;
  sjr: number | null;
  hIndex: number | null;
  quartileColor: string | null;
}

const QUARTILE_COLORS: Record<string, string> = {
  Q1: "emerald",
  Q2: "sky",
  Q3: "amber",
  Q4: "orange",
};

// Build lookup map once on first import (module-scoped cache)
const journalMap = new Map<string, ScimagoEntry>();

for (const entry of scimagoData as ScimagoEntry[]) {
  journalMap.set(entry.title, entry);
}

function normalizeTitle(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/^the\s+/, "")
    .replace(/\s+/g, " ");
}

const JOURNAL_STOPWORDS = new Set(["the", "of", "and", "for", "in", "on", "a", "an"]);

function journalTokens(s: string): string[] {
  return s
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0 && !JOURNAL_STOPWORDS.has(t));
}

/**
 * True when `abbrevTokens` is the ISO/NLM abbreviation of `fullTokens`: after
 * dropping stopwords from both, the two have the same token count and each
 * abbreviation token is a prefix of the full-title token in the same position.
 * Bridges "n engl j med" → "new england journal of medicine" and "j am coll
 * cardiol" → "journal of the american college of cardiology" — the case the
 * substring fallbacks can never catch because the abbreviation is not a substring
 * of the full name. Positional + equal-length keeps false positives near zero.
 */
function isIsoAbbreviation(abbrevTokens: string[], fullTokens: string[]): boolean {
  if (abbrevTokens.length === 0 || abbrevTokens.length !== fullTokens.length) {
    return false;
  }
  return abbrevTokens.every((t, i) => fullTokens[i].startsWith(t));
}

/**
 * Look up journal quality data by journal name.
 *
 * Tries exact match first (after normalization), then falls back to
 * startsWith and includes checks for fuzzy matching.
 *
 * Returns null for unknown journals (graceful fallback).
 */
export function lookupJournalQuality(
  journalName: string,
): JournalQuality | null {
  const normalized = normalizeTitle(journalName);
  // Empty/whitespace journal → no quartile (never let `startsWith("")`/`includes("")`
  // match the first map entry and fabricate a bogus quartile).
  if (!normalized) return null;

  // Exact match (O(1) via Map)
  let entry = journalMap.get(normalized);

  // Fuzzy fallback: startsWith
  if (!entry) {
    for (const [key, val] of journalMap) {
      if (key.startsWith(normalized) || normalized.startsWith(key)) {
        entry = val;
        break;
      }
    }
  }

  // Fuzzy fallback: includes
  if (!entry) {
    for (const [key, val] of journalMap) {
      if (normalized.includes(key) || key.includes(normalized)) {
        entry = val;
        break;
      }
    }
  }

  // Abbreviation fallback: ISO/NLM journal abbreviations (e.g. "N Engl J Med"),
  // which are not substrings of the full Scimago title.
  if (!entry) {
    const abbrevTokens = journalTokens(normalized);
    for (const [key, val] of journalMap) {
      if (isIsoAbbreviation(abbrevTokens, journalTokens(key))) {
        entry = val;
        break;
      }
    }
  }

  if (!entry) return null;

  return {
    quartile: entry.quartile,
    citesPerDoc2y: entry.citesPerDoc2y ?? null,
    sjr: entry.sjr ?? null,
    hIndex: entry.hIndex ?? null,
    quartileColor: entry.quartile ? (QUARTILE_COLORS[entry.quartile] ?? null) : null,
  };
}
