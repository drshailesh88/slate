import type { SearchResponse } from '@/types/search';
import { displaySources } from './source-display';
import { isAcademicTab, resultNoun } from './tab-meta';
import type { ExploreTab } from './tab-bar';

const group = (n: number) => n.toLocaleString('en-US');

export function honestCount(
  res: Pick<
    SearchResponse,
    'matchedTotal' | 'total' | 'sourceCounts' | 'sourceStatuses'
  >,
  // Defaults to academic so the pre-Task-6 caller (ResultHeader, which only
  // renders for the academic tab until tab switching lands) stays correct
  // without a required arg. Task 4 onward passes the active tab explicitly.
  tab: ExploreTab = 'academic',
): string {
  if (!isAcademicTab(tab)) {
    return `${group(res.total)} ${resultNoun(tab, res.total)}`;
  }
  const matched = res.matchedTotal ?? res.total;
  const sources = displaySources(res.sourceCounts, res.sourceStatuses).length;
  const sourceWord = sources === 1 ? 'source' : 'sources';
  const base = `${group(matched)} matched across ${sources} ${sourceWord}`;
  return matched > res.total
    ? `${base} · showing the top ${group(res.total)} by relevance`
    : base;
}
