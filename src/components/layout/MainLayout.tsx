import { ReactNode } from 'react';
import { Header } from './Header';

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="app-safe-body min-h-screen w-full max-w-full overflow-x-hidden bg-background">
      <Header />
      {/* Full width (no fixed container cap) so wide/landscape screens are
          used fully; wide content scrolls inside its own container. */}
      <main className="w-full max-w-[1800px] mx-auto px-4 py-6 lg:px-6 lg:py-8">
        {children}
      </main>
    </div>
  );
}
