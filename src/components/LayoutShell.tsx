// src/components/LayoutShell.tsx
'use client';

import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isTerminal = pathname.startsWith('/terminal');

  // 터미널 화면에서는 Sidebar 없이 풀스크린
  if (isTerminal) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen bg-black text-white overflow-hidden">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-auto">{children}</main>
    </div>
  );
}
