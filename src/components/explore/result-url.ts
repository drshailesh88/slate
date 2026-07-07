import type { UnifiedSearchResult } from '@/types/search';

export function getResultUrl(result: UnifiedSearchResult): string | undefined {
  return (
    result.url ?? (result.doi ? `https://doi.org/${result.doi}` : undefined)
  );
}
