/**
 * Canonical URL key for the non-academic (web/news/discussions) federation.
 * Strips scheme, leading "www.", and a trailing slash, lower-cased — so the
 * same page surfaced by two sources collapses to one fused row. Semantics match
 * the eval scorer's canonicalUrl (eval/web-search/metrics.ts) so serving-side
 * dedup and the dedup dimension agree.
 */
export function canonicalUrl(u: string): string {
  try {
    const url = new URL(u);
    const host = url.hostname.replace(/^www\./, "");
    const path = url.pathname.replace(/\/+$/, "");
    return `${host}${path}`.toLowerCase();
  } catch {
    return u.trim().toLowerCase();
  }
}
