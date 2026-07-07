'use client';

import { NON_ACADEMIC_TABS } from './tab-meta';
import styles from './tab-bar.module.css';

export type ExploreTab = 'academic' | 'web' | 'news' | 'discussions' | 'videos';

const TAB_LABELS: Record<ExploreTab, string> = {
  academic: 'Academic',
  web: 'Web',
  news: 'News',
  discussions: 'Discussions',
  videos: 'Videos',
};

const TABS: ExploreTab[] = ['academic', 'web', 'news', 'discussions', 'videos'];

// All five tabs are interactive. Beta now marks "early quality," not
// "disabled" — see the tag rendered per-tab below.
const ENABLED_TABS: ReadonlySet<ExploreTab> = new Set<ExploreTab>(TABS);

export function TabBar({
  active,
  onSelect,
}: {
  active: ExploreTab;
  onSelect: (tab: ExploreTab) => void;
}) {
  return (
    <div className={styles.bar} role="tablist" aria-label="Explore result tabs">
      {TABS.map((tab) => {
        const isActive = tab === active;
        const isEnabled = ENABLED_TABS.has(tab);

        return (
          <button
            key={tab}
            type="button"
            role="tab"
            className={`${styles.tab} ${isActive ? styles.tabActive : ''}`}
            aria-selected={isActive}
            aria-disabled={!isEnabled}
            disabled={!isEnabled}
            onClick={isEnabled ? () => onSelect(tab) : undefined}
          >
            {TAB_LABELS[tab]}
            {NON_ACADEMIC_TABS.has(tab) && (
              <span className={styles.beta}>Beta</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
