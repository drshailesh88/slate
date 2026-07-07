import type { ExploreTab } from './tab-bar';

export const NON_ACADEMIC_TABS: ReadonlySet<ExploreTab> = new Set<ExploreTab>([
  'web',
  'news',
  'discussions',
  'videos',
]);

export function isAcademicTab(tab: ExploreTab): boolean {
  return tab === 'academic';
}

export const TAB_LABELS: Record<ExploreTab, string> = {
  academic: 'Academic',
  web: 'Web',
  news: 'News',
  discussions: 'Discussions',
  videos: 'Videos',
};

export const WEB_CAVEAT =
  "Web results are early — we're still tuning quality. Academic is our strongest.";

const NOUNS: Record<Exclude<ExploreTab, 'academic'>, [string, string]> = {
  web: ['web result', 'web results'],
  news: ['news result', 'news results'],
  discussions: ['discussion', 'discussions'],
  videos: ['video', 'videos'],
};

export function resultNoun(tab: ExploreTab, count: number): string {
  if (tab === 'academic') return count === 1 ? 'result' : 'results';
  const [one, many] = NOUNS[tab];
  return count === 1 ? one : many;
}
