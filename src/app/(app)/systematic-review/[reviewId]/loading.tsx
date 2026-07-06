import styles from './sr-stage.module.css';

// Status shimmer for any SR stage — mirrors the funnel rhythm, never a spinner
// (design.md §8 — motion only does a job; loading is a Status job). Reduced
// motion collapses the shimmer via globals.css.
export default function SrStageLoading() {
  return (
    <div className={styles.stage}>
      <div className={styles.shimmer} style={{ width: 180, height: 12 }} />
      <div
        className={styles.shimmer}
        style={{ width: 320, height: 30, marginTop: 12 }}
      />
      <div
        className={styles.shimmer}
        style={{ width: 460, height: 14, marginTop: 14 }}
      />
      {[0, 1, 2, 3].map((row) => (
        <div
          key={row}
          className={styles.shimmer}
          style={{ height: 56, marginTop: 12, borderRadius: 12 }}
        />
      ))}
    </div>
  );
}
