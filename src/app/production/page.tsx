// src/app/production/page.tsx
// 생산현황 — 장비(복수)·기간·상태(RUN/IDLE/STOP)를 골라 장비별 생산량과 상태별 소요시간을 본다
// 데이터: production_daily(일별 생산량, 사내PC 스크립트 기록) + machine_status_daily(상태 이력)
'use client';

import React, { useMemo, useState } from 'react';
import { Factory, Search, Loader2, ChevronDown, ChevronRight, Calendar } from 'lucide-react';
import MultiSelectDropdown from '@/components/MultiSelectDropdown';
import { useMachineDefs } from '@/lib/machine-defs';
import { getCountUnit } from '@/lib/count-unit';
import { fetchApiJson, describeLoadError } from '@/lib/fetch-error';

type StateKey = 'RUN' | 'IDLE' | 'STOP';
const STATE_OPTIONS: { value: StateKey; label: string; color: string; bar: string }[] = [
  { value: 'RUN', label: 'RUN (가동)', color: 'text-emerald-400', bar: 'bg-emerald-500' },
  { value: 'IDLE', label: 'IDLE (대기)', color: 'text-amber-400', bar: 'bg-amber-400' },
  { value: 'STOP', label: 'STOP (정지)', color: 'text-rose-400', bar: 'bg-rose-500' },
];
const MAX_DAYS = 92; // 한 번에 조회할 최대 기간 (Firestore 읽기 보호)

// ── KST 날짜 유틸 ──
const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay(); // 0=일
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000) + 1;
const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

function presetRange(key: string): [string, string] {
  const today = kstToday();
  const monday = addDays(today, -((weekday(today) + 6) % 7));
  const monthStart = `${today.slice(0, 7)}-01`;
  switch (key) {
    case 'thisWeek': return [monday, today];
    case 'lastWeek': return [addDays(monday, -7), addDays(monday, -1)];
    case 'thisMonth': return [monthStart, today];
    case 'lastMonth': {
      const lastEnd = addDays(monthStart, -1);
      return [`${lastEnd.slice(0, 7)}-01`, lastEnd];
    }
    default: return [today, today];
  }
}
const PRESETS = [
  { key: 'today', label: '오늘' },
  { key: 'thisWeek', label: '이번 주' },
  { key: 'lastWeek', label: '지난 주' },
  { key: 'thisMonth', label: '이번 달' },
  { key: 'lastMonth', label: '지난 달' },
];

function formatSeconds(sec: number): string {
  if (sec <= 0) return '-';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}시간 ${m}분`;
  if (m > 0) return `${m}분`;
  return `${Math.round(sec)}초`;
}

interface DayRow { date: string; production: number; seconds: Record<StateKey, number> }
interface MachineRow { no: number; name: string; group: string; unit: string; days: DayRow[]; production: number; seconds: Record<StateKey, number> }

const stateOf = (code: string): StateKey => (code === 'RUN' ? 'RUN' : code === 'IDLE' || code === 'SETUP' ? 'IDLE' : 'STOP');

export default function ProductionPage() {
  const { allDefs } = useMachineDefs();
  const machineOptions = useMemo(() => [...allDefs].sort((a, b) => a.no - b.no).map(d => ({
    value: String(d.no), label: `${String(d.no).padStart(2, '0')} ${d.name}`, hint: d.equipmentGroup || d.group,
  })), [allDefs]);

  // 장비: 처음엔 전체(ALL). 사용자가 한 번이라도 고르면 그 선택을 쓴다
  const [pickedMachines, setPickedMachines] = useState<string[] | null>(null);
  const selectedMachines = pickedMachines ?? machineOptions.map(o => o.value);
  const [states, setStates] = useState<string[]>(['RUN', 'IDLE', 'STOP']);
  const [[startDate, endDate], setRange] = useState<[string, string]>(() => presetRange('thisWeek'));

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<MachineRow[] | null>(null);
  const [queried, setQueried] = useState<{ start: string; end: string } | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const rangeDays = startDate && endDate ? daysBetween(startDate, endDate) : 0;
  const rangeError = !startDate || !endDate ? '기간을 선택하세요'
    : rangeDays <= 0 ? '시작일이 종료일보다 늦습니다'
    : rangeDays > MAX_DAYS ? `기간은 최대 ${MAX_DAYS}일까지 조회할 수 있습니다` : null;

  const handleQuery = async () => {
    if (rangeError || selectedMachines.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      type ProdEntry = { machineNo: number; date: string; dayCompletedCount: number };
      type StatusEntry = { machineNo: number; date: string; states?: Record<string, { totalSeconds: number }> };
      const [prod, status] = await Promise.all([
        fetchApiJson<{ entries: ProdEntry[] }>(`/api/production-daily?start=${startDate}&end=${endDate}`),
        fetchApiJson<{ entries: StatusEntry[] }>(`/api/status-daily?start=${startDate}&end=${endDate}`),
      ]);
      const wanted = new Set(selectedMachines.map(Number));
      const dates: string[] = [];
      for (let d = startDate; d <= endDate; d = addDays(d, 1)) dates.push(d);

      const byMachine = new Map<number, Map<string, DayRow>>();
      const dayOf = (no: number, date: string) => {
        if (!byMachine.has(no)) byMachine.set(no, new Map());
        const m = byMachine.get(no)!;
        if (!m.has(date)) m.set(date, { date, production: 0, seconds: { RUN: 0, IDLE: 0, STOP: 0 } });
        return m.get(date)!;
      };
      for (const e of prod.entries || []) if (wanted.has(e.machineNo)) dayOf(e.machineNo, e.date).production += e.dayCompletedCount || 0;
      for (const e of status.entries || []) {
        if (!wanted.has(e.machineNo)) continue;
        const day = dayOf(e.machineNo, e.date);
        for (const [code, acc] of Object.entries(e.states || {})) day.seconds[stateOf(code)] += acc.totalSeconds || 0;
      }

      const result: MachineRow[] = [...allDefs].filter(d => wanted.has(d.no)).sort((a, b) => a.no - b.no).map(d => {
        const days = dates.map(date => byMachine.get(d.no)?.get(date) ?? { date, production: 0, seconds: { RUN: 0, IDLE: 0, STOP: 0 } });
        const seconds = { RUN: 0, IDLE: 0, STOP: 0 };
        let production = 0;
        for (const day of days) {
          production += day.production;
          for (const k of Object.keys(seconds) as StateKey[]) seconds[k] += day.seconds[k];
        }
        const eq = d.equipmentGroup || d.name;
        return { no: d.no, name: d.name, group: d.equipmentGroup || d.group, unit: getCountUnit(eq), days, production, seconds };
      });
      setRows(result);
      setQueried({ start: startDate, end: endDate });
      setExpanded(new Set());
    } catch (err) {
      setError(describeLoadError(err));
    }
    setLoading(false);
  };

  const shownStates = STATE_OPTIONS.filter(s => states.includes(s.value));
  const toggleRow = (no: number) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(no)) next.delete(no); else next.add(no);
    return next;
  });

  return (
    <div className="p-5 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-100 flex items-center gap-2"><Factory className="w-6 h-6 text-gray-400" />생산현황</h1>
        <p className="text-xs text-gray-500 mt-1">장비·기간·상태를 골라 장비별 생산량과 상태별 소요시간을 봅니다</p>
      </div>

      {/* 조회 조건 */}
      <div className="bg-gray-900/60 border border-gray-800 rounded-lg p-3 flex flex-wrap items-center gap-2">
        <MultiSelectDropdown label="장비" options={machineOptions} selected={selectedMachines} onChange={setPickedMachines} width="w-64" />
        <div className="flex items-center gap-1.5 bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1">
          <Calendar className="w-3.5 h-3.5 text-gray-500" />
          <input type="date" value={startDate} onChange={e => setRange([e.target.value, endDate])}
            className="bg-transparent text-sm text-gray-100 outline-none" />
          <span className="text-gray-600">~</span>
          <input type="date" value={endDate} onChange={e => setRange([startDate, e.target.value])}
            className="bg-transparent text-sm text-gray-100 outline-none" />
        </div>
        <div className="flex items-center gap-0.5">
          {PRESETS.map(p => (
            <button key={p.key} type="button" onClick={() => setRange(presetRange(p.key))}
              className="text-xs text-gray-400 hover:text-blue-300 px-2 py-1 rounded hover:bg-blue-500/10 transition-colors">{p.label}</button>
          ))}
        </div>
        <MultiSelectDropdown label="상태" options={STATE_OPTIONS} selected={states} onChange={setStates} width="w-52" />
        <div className="flex-1" />
        {rangeError && <span className="text-xs text-amber-400">{rangeError}</span>}
        <button type="button" onClick={handleQuery} disabled={loading || !!rangeError || selectedMachines.length === 0}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
            loading || rangeError || selectedMachines.length === 0 ? 'bg-gray-800 text-gray-600 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white'
          }`}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}조회
        </button>
      </div>

      {error && <p className="text-sm text-amber-400">데이터를 불러오지 못했습니다 · {error}</p>}

      {!rows && !error && (
        <p className="text-sm text-gray-500 text-center py-16">장비·기간·상태를 고른 뒤 [조회]를 누르세요</p>
      )}

      {rows && queried && (
        <div className="bg-gray-900/60 border border-gray-800 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-gray-500 border-b border-gray-800">
                <th className="text-left font-medium px-3 py-2 w-8"></th>
                <th className="text-left font-medium px-2 py-2">NO</th>
                <th className="text-left font-medium px-2 py-2">장비</th>
                <th className="text-left font-medium px-2 py-2">기간</th>
                <th className="text-right font-medium px-2 py-2">생산량</th>
                {shownStates.map(s => <th key={s.value} className={`text-right font-medium px-2 py-2 ${s.color}`}>{s.value} 소요시간</th>)}
                <th className="text-left font-medium px-3 py-2 w-40 hidden md:table-cell">상태 비율</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const total = r.seconds.RUN + r.seconds.IDLE + r.seconds.STOP;
                const open = expanded.has(r.no);
                return (
                  <React.Fragment key={r.no}>
                    <tr onClick={() => toggleRow(r.no)} className="border-b border-gray-800/60 hover:bg-gray-800/30 cursor-pointer">
                      <td className="px-3 py-2 text-gray-500">{open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}</td>
                      <td className="px-2 py-2 font-mono text-[11px] text-gray-500">{String(r.no).padStart(2, '0')}</td>
                      <td className="px-2 py-2"><span className="text-gray-100 font-medium">{r.name}</span><span className="ml-1.5 text-[10px] text-gray-500">{r.group}</span></td>
                      <td className="px-2 py-2 text-[11px] text-gray-400 font-mono">{queried.start} ~ {queried.end}</td>
                      <td className="px-2 py-2 text-right font-mono text-gray-100">{r.production > 0 ? `${r.production.toLocaleString()} ${r.unit}` : '-'}</td>
                      {shownStates.map(s => (
                        <td key={s.value} className="px-2 py-2 text-right text-gray-200">
                          {formatSeconds(r.seconds[s.value])}
                          {total > 0 && r.seconds[s.value] > 0 && <span className="ml-1 text-[10px] text-gray-500">{(r.seconds[s.value] / total * 100).toFixed(0)}%</span>}
                        </td>
                      ))}
                      <td className="px-3 py-2 hidden md:table-cell">
                        <div className="flex h-2 rounded-full overflow-hidden bg-gray-800">
                          {total > 0 && STATE_OPTIONS.map(s => r.seconds[s.value] > 0 && (
                            <div key={s.value} className={s.bar} style={{ width: `${r.seconds[s.value] / total * 100}%` }} />
                          ))}
                        </div>
                      </td>
                    </tr>
                    {open && r.days.map(d => {
                      const wd = weekday(d.date);
                      return (
                        <tr key={d.date} className="border-b border-gray-800/30 bg-gray-950/40 text-[12px]">
                          <td />
                          <td />
                          <td />
                          <td className={`px-2 py-1 font-mono ${wd === 0 || wd === 6 ? 'text-rose-400/80' : 'text-gray-400'}`}>{d.date} ({WEEKDAY_KO[wd]})</td>
                          <td className="px-2 py-1 text-right font-mono text-gray-300">{d.production > 0 ? d.production.toLocaleString() : '-'}</td>
                          {shownStates.map(s => <td key={s.value} className="px-2 py-1 text-right text-gray-400">{formatSeconds(d.seconds[s.value])}</td>)}
                          <td className="hidden md:table-cell" />
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          <p className="text-[11px] text-gray-600 px-3 py-2 border-t border-gray-800">
            행을 누르면 일별로 펼쳐집니다 · 생산량은 DSPM 금일 완료량 기준(수동 장비는 없음) · STOP 은 정지코드(S1~S9) 합계
          </p>
        </div>
      )}
    </div>
  );
}
