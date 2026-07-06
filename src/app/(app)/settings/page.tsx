import { getSessionUser } from '@/lib/auth/session';
import { signOutAction } from '@/lib/auth/actions';
import styles from './page.module.css';

// Minimal Account pane. Full two-pane settings per
// docs/design/specs/global-auth-settings-states.md §C is a fast-follow.
export default async function SettingsPage() {
  const user = await getSessionUser();

  return (
    <div className={styles.settings}>
      <h1 className={styles.title}>Settings</h1>

      <section className={styles.section}>
        <div className="section-label">Account</div>
        <div className={styles.card}>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Name</span>
            <span className={styles.rowValue}>{user.name}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Email</span>
            <span className={styles.rowValue}>{user.email}</span>
          </div>
        </div>
        <p className={styles.note}>
          Name and email changes go through your sign-in provider, not here.
        </p>
        <form action={signOutAction}>
          <button type="submit" className={styles.signOut}>
            Sign out
          </button>
        </form>
      </section>
    </div>
  );
}
