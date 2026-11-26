// src/components/DateRangeBar.tsx
// 기간 선택 — 달력 두 칸 + 바로가기(오늘·이번 주·지난 주·이번 달·지난 달)
'use client';

import React from 'react';
import { Calendar } from 'lucide-react';
import { RANGE_PRESETS, presetRange } from '@/lib/date-range';

export default function DateRangeBar({ start, end, onChange }: {
  start: string; end: string; onChange: (range: [string, string]) => void;
}) {
  return (
    <>
      <div className="flex items-center gap-1.5 bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1">
        <Calendar className="w-3.5 h-3.5 text-gray-500" />
        <input type="date" value={start} onChange={e => onChange([e.target.value, end])}
          className="bg-transparent text-sm text-gray-100 outline-none" />
        <span className="text-gray-600">~</span>
        <input type="date" value={end} onChange={e => onChange([start, e.target.value])}
          className="bg-transparent text-sm text-gray-100 outline-none" />
      </div>
      <div className="flex items-center gap-0.5">
        {RANGE_PRESETS.map(p => (
          <button key={p.key} type="button" onClick={() => onChange(presetRange(p.key))}
            className="text-xs text-gray-400 hover:text-blue-300 px-2 py-1 rounded hover:bg-blue-500/10 transition-colors">{p.label}</button>
        ))}
      </div>
    </>
  );
}
