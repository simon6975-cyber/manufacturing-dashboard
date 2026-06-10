// src/components/Sidebar.tsx
'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  GitBranch,
  LayoutGrid,
  BarChart3,
  Pencil,
  Pause,
  Settings,
  FileSpreadsheet,
  ClipboardList,
} from 'lucide-react';

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  count?: number;
};

const sections: { title: string; items: NavItem[] }[] = [
  {
    title: '생산 현황',
    items: [
      { href: '/', label: '공정 흐름도', icon: GitBranch, badge: 'LIVE' },
      { href: '/dashboard', label: '일일 대시보드', icon: LayoutGrid, count: 19 },
      { href: '/analytics', label: '기간별 집계', icon: BarChart3 },
      { href: '/transaction', label: '거래명세서 관리', icon: ClipboardList },
    ],
  },
  {
    title: '데이터 입력',
    items: [{ href: '/input', label: '일일 생산 입력', icon: Pencil }],
  },
  {
    title: '설정',
    items: [
      { href: '/codes', label: '정지/병목 코드', icon: Pause },
      { href: '/master', label: '공정 마스터', icon: Settings },
      { href: '/sheets', label: 'Sheets 연결', icon: FileSpreadsheet },
    ],
  },
];

const Sidebar: React.FC = () => {
  const pathname = usePathname();

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const dayLabels = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const dayStr = dayLabels[today.getDay()];
  const hh = String(today.getHours()).padStart(2, '0');
  const min = String(today.getMinutes()).padStart(2, '0');
  const ampm = today.getHours() < 12 ? '오전' : '오후';

  return (
    <aside className="w-56 bg-gray-950 border-r border-gray-800 h-screen sticky top-0 p-5 flex flex-col shrink-0">
      {/* 헤더 */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="relative flex w-2 h-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          <h1 className="text-white font-bold text-base">Production Hub</h1>
        </div>
        <p className="text-[11px] text-gray-500 tracking-wider font-mono">
          {yyyy}.{mm}.{dd} · {dayStr}
        </p>
        <p className="text-[9px] text-gray-600 font-mono mt-0.5">v2.2</p>
      </div>

      {/* 메뉴 */}
      <nav className="space-y-6 flex-1 overflow-auto scroll-dark">
        {sections.map((section) => (
          <div key={section.title}>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2 px-2">
              {section.title}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2.5 px-2.5 py-2 rounded-md transition-colors text-sm ${
                      isActive
                        ? 'bg-blue-500/10 text-white border border-blue-500/40'
                        : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-200 border border-transparent'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="flex-1 font-medium">{item.label}</span>
                    {item.badge && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                        {item.badge}
                      </span>
                    )}
                    {item.count !== undefined && (
                      <span className="text-[10px] font-bold text-gray-500">
                        {item.count}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* 하단 동기화 상태 */}
      <div className="text-[10px] text-gray-600 mt-auto pt-4 border-t border-gray-800">
        동기화: {ampm} {hh}:{min}
      </div>
    </aside>
  );
};

export default Sidebar;
