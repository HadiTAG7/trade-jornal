import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { NAV_ITEMS } from './navItems';

/**
 * The header's search box was decorative: it held `searchQuery` in local state
 * that nothing read, so typing in it did nothing at all. It opens this instead.
 *
 * Searching by symbol goes through the trades page's existing `q` filter rather
 * than loading every trade here to build a symbol list.
 */

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  const go = (to: string) => {
    onOpenChange(false);
    setQuery('');
    navigate(to);
  };

  const symbol = query.trim().toUpperCase();

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search a symbol, or jump to a page…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>Nothing matches that.</CommandEmpty>

        {symbol && (
          <>
            <CommandGroup heading="Search">
              <CommandItem
                // cmdk filters on `value`; keep the typed text so this never
                // gets filtered out of its own results.
                value={`search ${symbol}`}
                onSelect={() => go(`/trades?q=${encodeURIComponent(symbol)}`)}
              >
                <Search className="mr-2 h-4 w-4" />
                Show {symbol} trades
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        <CommandGroup heading="Go to">
          {NAV_ITEMS.map((item) => (
            <CommandItem key={item.href} value={item.label} onSelect={() => go(item.href)}>
              <item.icon className="mr-2 h-4 w-4" />
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
