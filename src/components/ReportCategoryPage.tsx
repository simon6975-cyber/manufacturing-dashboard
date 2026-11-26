// src/components/ReportCategoryPage.tsx
// 리포트 공통 틀 — 분류(탭·그룹·항목) 구조만 보여주고, 수치는 데이터 연결 후 채운다
'use client';

import React, { useState } from 'react';
import { FileBarChart, Hammer } from 'lucide-react';

export interface ReportGroup { label?: string; items: string[] }
export interface ReportTab { key: string; label: string; groups: ReportGroup[] }

export default function ReportCategoryPage({ title, description, tabs }: { title: string; description: string; tabs: ReportTab[] }) {
  const [active, setActive] = useState(tabs[0]?.key);
  const tab = tabs.find(t => t.key === active) ?? tabs[0];

  return (
    <div className="p-5 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-100 flex items-center gap-2"><FileBarChart className="w-6 h-6 text-gray-400" />{title}</h1>
        <p className="text-xs text-gray-500 mt-1">{description}</p>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
        <Hammer className="w-3.5 h-3.5 shrink-0" />
        분류 구조만 준비된 화면입니다 — 주문·제작 데이터를 연결하면 부수·금액·비중이 채워집니다
      </div>

      {tabs.length > 1 && (
        <div className="flex gap-1 border-b border-gray-800">
          {tabs.map(t => (
            <button key={t.key} type="button" onClick={() => setActive(t.key)}
              className={`px-4 py-2 text-sm border-b-2 -mb-px transition-colors ${
                t.key === tab.key ? 'border-blue-500 text-gray-100 font-semibold' : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}>{t.label}</button>
          ))}
        </div>
      )}

      <div className={`grid gap-4 ${tab.groups.length > 1 ? 'md:grid-cols-2' : ''}`}>
        {tab.groups.map((g, gi) => (
          <div key={gi} className="bg-gray-900/60 border border-gray-800 rounded-lg overflow-hidden">
            {g.label && <h2 className="px-4 py-2.5 text-sm font-bold text-gray-200 border-b border-gray-800">{g.label}</h2>}
            {g.items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-600">세부 분류 정의 예정</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] text-gray-500 border-b border-gray-800">
                    <th className="text-left font-medium px-4 py-2">구분</th>
                    <th className="text-right font-medium px-4 py-2">부수</th>
                    <th className="text-right font-medium px-4 py-2">금액</th>
                    <th className="text-right font-medium px-4 py-2">비중</th>
                  </tr>
                </thead>
                <tbody>
                  {g.items.map(item => (
                    <tr key={item} className="border-b border-gray-800/50 last:border-0">
                      <td className="px-4 py-2 text-gray-200">{item}</td>
                      <td className="px-4 py-2 text-right text-gray-600">-</td>
                      <td className="px-4 py-2 text-right text-gray-600">-</td>
                      <td className="px-4 py-2 text-right text-gray-600">-</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
