import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { LogOut, Moon, Search, Settings, Sun, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { navHref, NAV_ITEMS } from './navItems';

interface HeaderProps {
  onOpenSearch: () => void;
}

export function Header({ onOpenSearch }: HeaderProps) {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { signOut, user } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const href = (to: string) => navHref(to, location.pathname, searchParams.toString());

  // Settings has its own header button and lives in the mobile menu, so it would
  // be a duplicate in the desktop row.
  const headerNav = NAV_ITEMS.filter((item) => item.href !== '/settings');

  return (
    <header className="app-safe-header sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center px-4 lg:px-6">
        {/* Logo */}
        <Link to={href('/dashboard')} className="flex shrink-0 items-center gap-2 mr-4 lg:mr-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <TrendingUp className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-semibold text-foreground">TradeLog</span>
        </Link>

        {/* Navigation — phones use the bottom bar instead. Scrolls rather than
            overflowing: at the Fold's unfolded width seven items plus the action
            buttons don't fit, and the buttons were being pushed off-screen. */}
        <nav className="no-scrollbar hidden md:flex items-center gap-1 min-w-0 flex-1 overflow-x-auto">
          {headerNav.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.href}
                to={href(item.href)}
                className={cn('nav-item shrink-0', isActive && 'active')}
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Search & Actions */}
        <div className="flex shrink-0 items-center gap-2 ml-auto pl-2">
          {/* Opens the command palette. This used to be an input bound to state
              nothing read, so typing in it did nothing. */}
          <button
            type="button"
            onClick={onOpenSearch}
            className="hidden lg:flex w-64 items-center gap-2 rounded-md border border-border/50 bg-secondary/50 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary"
          >
            <Search className="h-4 w-4" />
            <span>Search trades…</span>
            <kbd className="ml-auto rounded border border-border/60 px-1.5 py-0.5 text-[10px]">
              ⌘K
            </kbd>
          </button>

          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenSearch}
            aria-label="Search"
            className="lg:hidden text-muted-foreground hover:text-foreground"
          >
            <Search className="h-5 w-5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="hidden md:inline-flex text-muted-foreground hover:text-foreground"
          >
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Settings"
                className="hidden md:inline-flex text-muted-foreground hover:text-foreground"
              >
                <Settings className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-1.5 text-sm text-muted-foreground">{user?.email}</div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/settings" className="cursor-pointer">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={signOut}
                className="text-destructive focus:text-destructive cursor-pointer"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
