/**
 * Compact a natural-language query into content keywords for the discussion
 * verticals (Reddit/HN/Stack Exchange). Those APIs index terse thread titles and
 * AND-match terms, so prose-style queries with format/intent filler
 * ("peer review reform discussion", "...debate") return nothing. The discussions
 * tab already implies the FORMAT, so format words like "discussion"/"debate" and
 * common function words are noise here — stripping them is a semantic
 * normalization, not a hack. SearXNG (web/news) keeps the raw query.
 */
const STOPWORDS = new Set([
  // discussion-format / intent words (the tab already conveys this)
  "discussion", "discussions", "debate", "debates", "thread", "threads",
  "forum", "forums", "community", "opinion", "opinions", "news",
  // common English function words
  "a", "an", "the", "and", "or", "of", "in", "on", "to", "for", "vs",
  "versus", "about", "with", "is", "are", "be",
]);

export function toKeywordQuery(query: string): string {
  const terms = query
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !STOPWORDS.has(t.toLowerCase()));
  // Never strip away the entire query — fall back to the original if filtering
  // emptied it (e.g. a query made entirely of stopwords).
  return terms.length > 0 ? terms.join(" ") : query.trim();
}
