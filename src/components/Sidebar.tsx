// src/components/Sidebar.tsx
'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Workflow,
  Activity,
  Factory,
  CalendarDays,
  Building2,
  Package,
  ClipboardList,
  FileText,
  SlidersHorizontal,
  ListChecks,
  FileSpreadsheet,
} from 'lucide-react';

const APP_VERSION = 'v2.2';

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
};

const sections: { title: string; items: NavItem[] }[] = [
  {
    title: '워크플로우',
    items: [
      { href: '/', label: '공정흐름도', icon: Workflow, badge: 'LIVE' },
      { href: '/analysis', label: '정지/병목 분석', icon: Activity },
    ],
  },
  {
    title: '생산현황집계',
    items: [
      { href: '/summary/equipment', label: '장비별', icon: Factory },
      { href: '/summary/period', label: '기간별', icon: CalendarDays },
      { href: '/summary/department', label: '부서별', icon: Building2 },
      { href: '/summary/product', label: '제품별', icon: Package },
      { href: '/summary/transaction', label: '거래명세서 관리', icon: ClipboardList },
    ],
  },
  {
    title: '리포트',
    items: [
      { href: '/report/weekly', label: '주간', icon: FileText },
      { href: '/report/monthly', label: '월간', icon: FileText },
      { href: '/report/quarterly', label: '분기', icon: FileText },
      { href: '/report/custom', label: '기간설정', icon: SlidersHorizontal },
    ],
  },
  {
    title: '설정',
    items: [
      { href: '/codes', label: '정지/병목코드', icon: ListChecks },
      { href: '/sheets', label: '시트 연결', icon: FileSpreadsheet },
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
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="relative flex w-2 h-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          <h1 className="text-white font-bold text-base">Production Hub</h1>
        </div>
        <div className="flex items-center gap-2 px-4">
          <span className="text-[10px] text-gray-600 font-mono">{APP_VERSION}</span>
        </div>
        <p className="text-[11px] text-gray-500 tracking-wider font-mono mt-1">
          {yyyy}.{mm}.{dd} · {dayStr}
        </p>
      </div>

      {/* 메뉴 */}
      <nav className="space-y-5 flex-1 overflow-y-auto -mr-2 pr-2">
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
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* 하단 */}
      <div className="text-[10px] text-gray-600 mt-auto pt-4 border-t border-gray-800">
        동기화: {ampm} {hh}:{min}
      </div>
    </aside>
  );
};

export default Sidebar;
