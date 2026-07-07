'use client';

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

// Slice 1 wires only Academic; Slice 2 enables the rest — flip this set, no
// structural change needed.
const ENABLED_TABS: ReadonlySet<ExploreTab> = new Set<ExploreTab>(['academic']);

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
            {!isEnabled && <span className={styles.beta}>Beta</span>}
          </button>
        );
      })}
    </div>
  );
}
