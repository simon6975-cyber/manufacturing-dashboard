// src/components/LayoutShell.tsx
'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { applyStoredTheme } from '@/lib/theme-init';

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isTerminal = pathname.startsWith('/terminal');

  // 첫 화면은 layout 의 인라인 스크립트가 테마를 적용하지만, 하이드레이션 오류 등으로 React 가
  // 문서를 다시 그리면 <html data-theme> 이 지워지므로 마운트 후 한 번 더 적용한다
  useEffect(() => { applyStoredTheme(); }, []);

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
