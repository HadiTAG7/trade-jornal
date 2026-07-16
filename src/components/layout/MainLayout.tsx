import { ReactNode } from 'react';
import { Header } from './Header';

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="app-safe-body min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-6 lg:px-6 lg:py-8">
        {children}
      </main>
    </div>
  );
}
