'use client';

import { useState } from 'react';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { BottomTabs } from './bottom-tabs';
import styles from './app-shell.module.css';

export type ShellUser = {
  name: string;
  plan: string;
};

export function AppShell({
  user,
  children,
}: {
  user: ShellUser;
  children: React.ReactNode;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className={styles.shell}>
      <Sidebar
        user={user}
        isCollapsed={isCollapsed}
        onToggleCollapse={() => setIsCollapsed((value) => !value)}
      />
      <div className={styles.main}>
        <Topbar user={user} />
        <main className={styles.content}>{children}</main>
      </div>
      <BottomTabs />
    </div>
  );
}
