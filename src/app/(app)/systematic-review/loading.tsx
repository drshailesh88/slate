import styles from './sr-home-status.module.css';

// Status shimmer for the SR home — never a spinner (design.md §8).
export default function SystematicReviewHomeLoading() {
  return (
    <div className={styles.wrap}>
      <div className={styles.shimmer} style={{ width: 140, height: 12 }} />
      <div
        className={styles.shimmer}
        style={{ width: 240, height: 28, marginTop: 10 }}
      />
      <div className={styles.cards}>
        {[0, 1, 2].map((row) => (
          <div
            key={row}
            className={styles.shimmer}
            style={{ height: 62, borderRadius: 12 }}
          />
        ))}
      </div>
    </div>
  );
}
