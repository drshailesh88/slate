import type { ExploreTab } from './tab-bar';
import { resultNoun } from './tab-meta';
import styles from './no-results.module.css';

/**
 * Clear filters stays disabled always — FilterPills are still inert
 * (Slice 2c). The switch-tab action is gated on `onSwitchTab` being passed;
 * the only caller (`explore-page-client.tsx`) always supplies `tab` and
 * `onSwitchTab`, so `tab` and `onSwitchTab` default only for other
 * call sites (e.g. tests) that omit them.
 */
export function NoResults({
  query,
  tab = 'academic',
  onSwitchTab,
}: {
  query: string;
  tab?: ExploreTab;
  onSwitchTab?: (tab: ExploreTab) => void;
}) {
  const isAcademic = tab === 'academic';
  const headline = isAcademic
    ? `No papers matched "${query}" in Academic.`
    : `No ${resultNoun(tab, 0)} for "${query}".`;
  const actionLabel = isAcademic ? 'Search the Web →' : 'Search Academic →';
  const targetTab: ExploreTab = isAcademic ? 'web' : 'academic';

  return (
    <div className={styles.wrap}>
      <p className={styles.headline}>{headline}</p>
      <p className={styles.body}>
        {isAcademic
          ? 'Try broader terms, widen the time window, or search the Web.'
          : 'Try broader terms or widen the time window.'}
      </p>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.action}
          disabled
          aria-disabled="true"
        >
          Clear filters
        </button>
        <button
          type="button"
          className={styles.action}
          disabled={!onSwitchTab}
          aria-disabled={!onSwitchTab}
          onClick={onSwitchTab ? () => onSwitchTab(targetTab) : undefined}
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}
