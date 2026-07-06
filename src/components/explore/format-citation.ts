import type { UnifiedSearchResult } from '@/types/search';

/**
 * Plain-text citation for the Cite action: `Authors (Year). Title. Journal.`
 * plus a DOI link when one is present. Pure — no formatting library, no
 * locale awareness beyond what the source data already carries.
 */
export function formatCitation(result: UnifiedSearchResult): string {
  const authors = result.authors.join(', ');
  const base = `${authors} (${result.year}). ${result.title}. ${result.journal}.`;
  return result.doi ? `${base} https://doi.org/${result.doi}` : base;
}
