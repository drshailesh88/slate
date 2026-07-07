import { describe, it, expect } from 'vitest';
import {
  NON_ACADEMIC_TABS,
  isAcademicTab,
  resultNoun,
} from '@/components/explore/tab-meta';

describe('tab-meta', () => {
  it('classifies academic vs non-academic', () => {
    expect(isAcademicTab('academic')).toBe(true);
    expect(isAcademicTab('web')).toBe(false);
    expect(NON_ACADEMIC_TABS.has('videos')).toBe(true);
  });
  it('pluralizes result nouns', () => {
    expect(resultNoun('web', 43)).toBe('web results');
    expect(resultNoun('web', 1)).toBe('web result');
    expect(resultNoun('news', 1)).toBe('news result');
    expect(resultNoun('discussions', 21)).toBe('discussions');
    expect(resultNoun('discussions', 1)).toBe('discussion');
    expect(resultNoun('videos', 50)).toBe('videos');
    expect(resultNoun('videos', 1)).toBe('video');
  });
});
