import type { SearchResponse } from '@/types/search';
import { displaySources } from './source-display';

const group = (n: number) => n.toLocaleString('en-US');

export function honestCount(
  res: Pick<
    SearchResponse,
    'matchedTotal' | 'total' | 'sourceCounts' | 'sourceStatuses'
  >,
): string {
  const matched = res.matchedTotal ?? res.total;
  const sources = displaySources(res.sourceCounts, res.sourceStatuses).length;
  const sourceWord = sources === 1 ? 'source' : 'sources';
  const base = `${group(matched)} matched across ${sources} ${sourceWord}`;
  return matched > res.total
    ? `${base} · showing the top ${group(res.total)} by relevance`
    : base;
}
