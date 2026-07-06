import { ExplorePageClient } from '@/components/explore/explore-page-client';
import styles from './explore.module.css';

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  return (
    <div className={styles.explore}>
      <ExplorePageClient initialQuery={q ?? ''} />
    </div>
  );
}
