import {
  BarChart3,
  BookOpen,
  Calendar,
  FileText,
  Import,
  LayoutDashboard,
  Settings,
  TrendingUp,
} from 'lucide-react';

/**
 * One nav definition for the header, the mobile bottom bar and the command
 * palette. They would otherwise drift apart, and a route reachable from only one
 * of them is effectively missing on the other.
 */

export interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Shown in the mobile bottom bar; the rest live behind "More". */
  primary?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, primary: true },
  { href: '/trades', label: 'Trades', icon: TrendingUp, primary: true },
  { href: '/calendar', label: 'Calendar', icon: Calendar, primary: true },
  { href: '/analytics', label: 'Analytics', icon: BarChart3, primary: true },
  { href: '/journal', label: 'Journal', icon: BookOpen },
  { href: '/reports', label: 'Reports', icon: FileText },
  { href: '/import', label: 'Import', icon: Import },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export const PRIMARY_NAV = NAV_ITEMS.filter((i) => i.primary);
export const SECONDARY_NAV = NAV_ITEMS.filter((i) => !i.primary);

/** Pages that share filter state, so navigating between them keeps the filters. */
const FILTER_SYNC_PAGES = ['/dashboard', '/trades'];

export function navHref(href: string, currentPath: string, search: string): string {
  const bothSynced = FILTER_SYNC_PAGES.includes(currentPath) && FILTER_SYNC_PAGES.includes(href);
  return bothSynced && search ? `${href}?${search}` : href;
}
