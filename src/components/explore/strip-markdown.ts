/**
 * Strips common markdown formatting from a snippet for display as plain
 * prose. This is NOT a full markdown parser — it only removes the marker
 * punctuation Exa's web/news/discussions results commonly return (ATX
 * headings, emphasis, inline code, list/blockquote markers) while
 * preserving every word. Conservative by design: it must never throw and
 * must never drop actual words, only formatting punctuation.
 */
export function stripMarkdown(text?: string): string {
  if (!text) return '';

  return text
    .replace(/^[ \t]*[-*+>]\s+/gm, '')
    .replace(/^[ \t]*\d+\.\s+/gm, '')
    .replace(/#{1,6}/g, ' ')
    .replace(/(\*\*|__)/g, '')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
