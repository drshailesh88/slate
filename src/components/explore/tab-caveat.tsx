import type { ExploreTab } from './tab-bar';
import { WEB_CAVEAT } from './tab-meta';
import styles from './tab-caveat.module.css';

// Only the three tabs called out in design.md §3 ("Web/News/Discussions are
// measurably weaker than Academic") carry the caveat — Academic is the
// trust baseline and Videos isn't part of that comparison.
const CAVEAT_TABS: ReadonlySet<ExploreTab> = new Set<ExploreTab>([
  'web',
  'news',
  'discussions',
]);

export function TabCaveat({ tab }: { tab: ExploreTab }) {
  if (!CAVEAT_TABS.has(tab)) return null;

  return <p className={styles.caveat}>{WEB_CAVEAT}</p>;
}
