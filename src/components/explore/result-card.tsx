import type { UnifiedSearchResult } from '@/types/search';
import type { ExploreTab } from './tab-bar';
import { AcademicResultCard } from './academic-result-card';
import { VideoResultCard } from './video-result-card';
import { WebResultCard } from './web-result-card';

/**
 * Per-tab card dispatch: Academic and Videos have their own layouts;
 * Web/News/Discussions share `WebResultCard`, distinguished only by
 * `variant` (source label vs. platform+engagement, per design.md §4).
 */
export function ResultCard({
  result,
  tab,
}: {
  result: UnifiedSearchResult;
  tab: ExploreTab;
}) {
  if (tab === 'academic') {
    return <AcademicResultCard result={result} />;
  }
  if (tab === 'videos') {
    return <VideoResultCard result={result} />;
  }
  return <WebResultCard result={result} variant={tab} />;
}
