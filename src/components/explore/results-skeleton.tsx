import styles from './results-skeleton.module.css';

const SKELETON_ROW_COUNT = 4;

/**
 * §8 Status shimmer, never a spinner: purely decorative placeholder rows, so
 * the whole list is `aria-hidden` rather than announced as "loading" text.
 */
export function ResultsSkeleton() {
  return (
    <div
      className={styles.list}
      aria-hidden="true"
      data-testid="results-skeleton"
    >
      {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
        <div key={index} className={styles.row}>
          <div className={`${styles.block} ${styles.title}`} />
          <div className={`${styles.block} ${styles.meta}`} />
          <div className={styles.badgeRow}>
            <div className={`${styles.block} ${styles.chip}`} />
            <div className={`${styles.block} ${styles.chip}`} />
          </div>
          <div className={`${styles.block} ${styles.snippet}`} />
          <div className={`${styles.block} ${styles.snippetShort}`} />
        </div>
      ))}
    </div>
  );
}
