'use client';

import styles from './greeting.module.css';

function timeOfDay(hour: number): 'morning' | 'afternoon' | 'evening' {
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

export function Greeting({ name }: { name: string }) {
  const now = new Date();
  const dateLabel = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className={styles.greeting}>
      <p className={styles.date} suppressHydrationWarning>
        {dateLabel}
      </p>
      <h1 className={styles.headline} suppressHydrationWarning>
        Good {timeOfDay(now.getHours())}, {name}.
      </h1>
      <p className={styles.subtitle}>
        Your research desk — find, organize, draft, and check.
      </p>
    </div>
  );
}
