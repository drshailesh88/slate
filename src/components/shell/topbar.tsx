'use client';

import { usePathname } from 'next/navigation';
import { Search } from 'lucide-react';
import { Avatar } from './avatar';
import { pageLabelFor } from './nav-items';
import type { ShellUser } from './app-shell';
import styles from './topbar.module.css';

export function Topbar({ user }: { user: ShellUser }) {
  const pathname = usePathname();

  return (
    <header className={styles.topbar}>
      <span className={styles.pageLabel}>{pageLabelFor(pathname)}</span>
      <button type="button" className={styles.searchLauncher}>
        <Search size={14} strokeWidth={1.75} />
        <span>Search</span>
        <kbd className={styles.kbd}>⌘K</kbd>
      </button>
      <span className={styles.mobileAccount}>
        <Avatar name={user.name} />
      </span>
    </header>
  );
}
