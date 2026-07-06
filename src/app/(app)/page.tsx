import { Composer } from '@/components/home/composer';
import { Greeting } from '@/components/home/greeting';
import { getSessionUser } from '@/lib/auth/session';
import styles from './page.module.css';

export default async function HomePage() {
  const user = await getSessionUser();

  return (
    <div className={styles.home}>
      <Greeting name={user.name} />
      <Composer />
    </div>
  );
}
