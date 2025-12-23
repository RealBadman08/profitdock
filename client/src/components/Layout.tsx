import Header from '@/components/Header';
import { ReactNode } from 'react';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-[#0E1C2F] flex flex-col font-sans">
      <Header />
      {/* Main Content Area - Full Width & Height */}
      <main className="flex-1 overflow-hidden h-[calc(100vh-48px)]">
        {children}
      </main>
    </div>
  );
}
