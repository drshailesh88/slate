import styles from './no-results.module.css';

/**
 * Slice 1: neither action is wired yet — Clear filters has nothing to clear
 * (FilterPills are inert this slice) and Search the Web has nowhere to go
 * (Web is disabled/Beta in TabBar). Both stay fully legible but disabled, the
 * same "present, not yet active" treatment FilterPills already uses, so
 * nothing here fakes a working control.
 */
export function NoResults({ query }: { query: string }) {
  return (
    <div className={styles.wrap}>
      <p
        className={styles.headline}
      >{`No papers matched "${query}" in Academic.`}</p>
      <p className={styles.body}>
        Try broader terms, widen the time window, or search the Web.
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
          disabled
          aria-disabled="true"
        >
          Search the Web →
        </button>
      </div>
    </div>
  );
}
