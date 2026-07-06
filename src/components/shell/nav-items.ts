import {
  Folders,
  House,
  Inbox,
  Library,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const navItems: NavItem[] = [
  { href: '/', label: 'Home', icon: House },
  { href: '/projects', label: 'Projects', icon: Folders },
  { href: '/library', label: 'Library', icon: Library },
  { href: '/inbox', label: 'Inbox', icon: Inbox },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function pageLabelFor(pathname: string): string {
  const match = navItems.find((item) =>
    item.href === '/' ? pathname === '/' : pathname.startsWith(item.href),
  );
  return match?.label ?? 'Home';
}
