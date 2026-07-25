import { ReactNode, useState } from 'react';
import { BottomNav } from './BottomNav';
import { CommandPalette } from './CommandPalette';
import { Header } from './Header';

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <div className="app-safe-body min-h-screen w-full max-w-full overflow-x-hidden bg-background">
      <Header onOpenSearch={() => setSearchOpen(true)} />
      {/* Full width (no fixed container cap) so wide/landscape screens are
          used fully; wide content scrolls inside its own container.
          The bottom padding clears the fixed mobile nav, which would otherwise
          sit on top of the last row of any table. */}
      <main className="w-full max-w-[1800px] mx-auto px-4 py-6 pb-24 lg:px-6 lg:py-8 md:pb-8">
        {children}
      </main>
      <BottomNav onOpenSearch={() => setSearchOpen(true)} />
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
