'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PanelLeft, Plus } from 'lucide-react';
import { Avatar } from './avatar';
import { navItems } from './nav-items';
import type { ShellUser } from './app-shell';
import styles from './sidebar.module.css';

export function Sidebar({
  user,
  isCollapsed,
  onToggleCollapse,
}: {
  user: ShellUser;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav
      className={`${styles.sidebar} ${isCollapsed ? styles.collapsed : ''}`}
      aria-label="Main navigation"
    >
      <div className={styles.head}>
        {!isCollapsed && <span className={styles.wordmark}>Slate</span>}
        <button
          type="button"
          className={styles.iconButton}
          onClick={onToggleCollapse}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <PanelLeft size={16} strokeWidth={1.75} />
        </button>
      </div>

      <Link
        href="/projects"
        className={styles.newProject}
        title={isCollapsed ? 'New project' : undefined}
      >
        <Plus size={15} strokeWidth={2} />
        {!isCollapsed && <span>New project</span>}
      </Link>

      <div className={styles.nav}>
        {navItems.map((item) => {
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.navRow} ${isActive ? styles.navRowActive : ''}`}
              aria-current={isActive ? 'page' : undefined}
              title={isCollapsed ? item.label : undefined}
            >
              <Icon size={16} strokeWidth={1.75} className={styles.navIcon} />
              {!isCollapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </div>

      {!isCollapsed && (
        <div className={styles.recent}>
          <div className="section-label">Recent</div>
          <p className={styles.recentEmpty}>
            Nothing yet — your searches and projects will collect here.
          </p>
        </div>
      )}

      <div className={styles.account}>
        <Avatar name={user.name} />
        {!isCollapsed && (
          <div className={styles.accountText}>
            <span className={styles.accountName}>{user.name}</span>
            <span className={styles.accountPlan}>{user.plan}</span>
          </div>
        )}
      </div>
    </nav>
  );
}
