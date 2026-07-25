import { useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { LogOut, Menu, Moon, Search, Sun } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { navHref, PRIMARY_NAV, SECONDARY_NAV } from './navItems';

/**
 * Navigation for phones.
 *
 * The header's nav is `hidden md:flex` with nothing behind it, so on a phone —
 * and on the Fold's outer screen, which sits below the 768px breakpoint — the
 * only way to reach any page other than the current one was the browser's back
 * button. Five routes sit in the bar; the rest are behind "More".
 */

interface Props {
  onOpenSearch: () => void;
}

export function BottomNav({ onOpenSearch }: Props) {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [menuOpen, setMenuOpen] = useState(false);
  const { signOut, user } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const href = (to: string) => navHref(to, location.pathname, searchParams.toString());

  return (
    <nav
      className={cn(
        'app-safe-bottom fixed bottom-0 left-0 right-0 z-50 md:hidden',
        'border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80',
      )}
    >
      <div className="flex items-stretch justify-around">
        {PRIMARY_NAV.map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <Link
              key={item.href}
              to={href(item.href)}
              aria-current={isActive ? 'page' : undefined}
              // Tall enough to hit reliably with a thumb.
              className={cn(
                'flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px]',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="leading-none">{item.label}</span>
            </Link>
          );
        })}

        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger
            className="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] text-muted-foreground"
            aria-label="More"
          >
            <Menu className="h-5 w-5" />
            <span className="leading-none">More</span>
          </SheetTrigger>
          <SheetContent side="bottom" className="app-safe-bottom max-h-[85vh] overflow-y-auto">
            <SheetHeader className="text-left">
              <SheetTitle>Menu</SheetTitle>
            </SheetHeader>

            <div className="mt-4 grid grid-cols-3 gap-2">
              {SECONDARY_NAV.map((item) => (
                <Link
                  key={item.href}
                  to={href(item.href)}
                  onClick={() => setMenuOpen(false)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-lg border border-border/60 p-3 text-xs',
                    location.pathname === item.href ? 'text-primary' : 'text-foreground',
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </Link>
              ))}
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenSearch();
                }}
                className="flex flex-col items-center gap-1.5 rounded-lg border border-border/60 p-3 text-xs"
              >
                <Search className="h-5 w-5" />
                Search
              </button>
              <button
                type="button"
                onClick={toggleTheme}
                className="flex flex-col items-center gap-1.5 rounded-lg border border-border/60 p-3 text-xs"
              >
                {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                {theme === 'dark' ? 'Light' : 'Dark'}
              </button>
            </div>

            <div className="mt-4 border-t pt-4">
              <p className="text-xs text-muted-foreground">{user?.email}</p>
              <button
                type="button"
                onClick={signOut}
                className="mt-2 flex items-center gap-2 text-sm text-destructive"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
