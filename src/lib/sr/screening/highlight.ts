// Ported near-verbatim from the ScholarSync precursor (src/lib/sr/highlight.ts).
// PURE: splits abstract text into plain / inclusion / exclusion segments so the
// reference card can highlight inclusion terms Jade and exclusion terms Tomato
// (design.md decision colors). No client-trust here — the terms come from the
// locked protocol, resolved server-side.

export type HighlightKind = 'plain' | 'include' | 'exclude';

export interface HighlightSegment {
  text: string;
  kind: HighlightKind;
}

export interface HighlightTerms {
  include: string[];
  exclude: string[];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function highlightAbstract(
  text: string,
  terms: HighlightTerms,
): HighlightSegment[] {
  if (!text) return [];

  const entries = [
    ...terms.include.map((term) => ({ term, kind: 'include' as const })),
    ...terms.exclude.map((term) => ({ term, kind: 'exclude' as const })),
  ].filter((entry) => entry.term.length > 0);

  if (entries.length === 0) return [{ text, kind: 'plain' }];

  const kindByLower = new Map(
    entries.map((entry) => [entry.term.toLowerCase(), entry.kind]),
  );
  const pattern = new RegExp(
    `(${entries.map((entry) => escapeRegExp(entry.term)).join('|')})`,
    'gi',
  );

  const segments: HighlightSegment[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      segments.push({ text: text.slice(lastIndex, start), kind: 'plain' });
    }
    segments.push({
      text: match[0],
      kind: kindByLower.get(match[0].toLowerCase()) ?? 'plain',
    });
    lastIndex = start + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), kind: 'plain' });
  }

  return segments;
}
