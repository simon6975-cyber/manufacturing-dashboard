// src/components/MultiSelectDropdown.tsx
// 체크박스 드롭다운 — 복수 선택 + 'ALL'(전체 선택/해제). 바깥을 누르거나 Esc 로 닫힘
'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, CheckSquare, Square } from 'lucide-react';

export interface DropdownOption { value: string; label: string; hint?: string }

export default function MultiSelectDropdown({
  label, options, selected, onChange, width = 'w-56', allLabel = 'ALL',
}: {
  label: string;
  options: DropdownOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  width?: string;
  allLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const allSelected = options.length > 0 && options.every(o => selected.includes(o.value));
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  const summary = allSelected ? allLabel
    : selected.length === 0 ? '선택 안 함'
    : selected.length === 1 ? (options.find(o => o.value === selected[0])?.label ?? selected[0])
    : `${options.find(o => o.value === selected[0])?.label ?? selected[0]} 외 ${selected.length - 1}`;

  return (
    <div ref={boxRef} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className={`${width} flex items-center gap-2 bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-left hover:border-gray-600 transition-colors`}>
        <span className="text-[11px] text-gray-500 shrink-0">{label}</span>
        <span className="flex-1 truncate text-gray-100">{summary}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-gray-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className={`absolute z-30 mt-1 ${width} max-h-80 overflow-y-auto bg-gray-900 border border-gray-700 rounded-lg shadow-2xl py-1`}>
          <button type="button" onClick={() => onChange(allSelected ? [] : options.map(o => o.value))}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-800 border-b border-gray-800">
            {allSelected ? <CheckSquare className="w-4 h-4 text-blue-400" /> : <Square className="w-4 h-4 text-gray-600" />}
            <span className="font-semibold text-gray-200">{allLabel}</span>
          </button>
          {options.map(o => {
            const on = selected.includes(o.value);
            return (
              <button type="button" key={o.value} onClick={() => toggle(o.value)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-800">
                {on ? <CheckSquare className="w-4 h-4 text-blue-400 shrink-0" /> : <Square className="w-4 h-4 text-gray-600 shrink-0" />}
                <span className={`truncate ${on ? 'text-gray-100' : 'text-gray-400'}`}>{o.label}</span>
                {o.hint && <span className="ml-auto text-[10px] text-gray-600 shrink-0">{o.hint}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
