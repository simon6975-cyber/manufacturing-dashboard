// src/app/analysis/page.tsx
// v2.10.8 — 정지/병목분석: Firebase 누적 데이터 기반 조회 (Vercel↔DSPM 직접호출 제거)
'use client';

import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  Activity, Calendar, Clock, Play, AlertTriangle, Pause,
  Search, Loader2, RefreshCw, CheckSquare, Square, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useMachineDefs } from '@/lib/machine-defs';
import { useStopCodes } from '@/lib/useStopCodes';

/* ── 타입 ── */
interface DspmEvent {
  state: string;
  startTime: string;
  endTime: string;
  durationSeconds: number;
}

interface StateAccum {
  totalSeconds: number;
  count: number;
}

interface DailySummary {
  date: string;
  states: Record<string, StateAccum>;
}

interface MachineResult {
  machineNo: number;
  machineName: string;
  mcno: number;
  events: DspmEvent[];
  states: Record<string, StateAccum>;
  dailySummary: DailySummary[];
  error?: string;
}

/* ── KST 날짜 유틸 ── */
function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function weekAgoKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000 - 6 * 24 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function formatSeconds(sec: number): string {
  if (sec <= 0) return '-';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  if (h > 0) return `${h}시간 ${m}분`;
  if (m > 0) return `${m}분 ${s}초`;
  return `${s}초`;
}

/* ── 상태 색상/라벨 ── */
const STATE_COLORS: Record<string, { bg: string; text: string; bar: string; solid: string }> = {
  RUN:  { bg: 'bg-emerald-500/15', text: 'text-emerald-400', bar: 'bg-emerald-500', solid: '#10b981' },
  IDLE: { bg: 'bg-amber-500/15',   text: 'text-amber-400',   bar: 'bg-amber-400',  solid: '#fbbf24' },
  S1:   { bg: 'bg-rose-500/15',    text: 'text-rose-400',    bar: 'bg-rose-500',   solid: '#f43f5e' },
  S2:   { bg: 'bg-rose-500/15',    text: 'text-rose-400',    bar: 'bg-rose-400',   solid: '#fb7185' },
  S3:   { bg: 'bg-orange-500/15',  text: 'text-orange-400',  bar: 'bg-orange-400', solid: '#fb923c' },
  S4:   { bg: 'bg-purple-500/15',  text: 'text-purple-400',  bar: 'bg-purple-400', solid: '#c084fc' },
  S5:   { bg: 'bg-blue-500/15',    text: 'text-blue-400',    bar: 'bg-blue-400',   solid: '#60a5fa' },
  S6:   { bg: 'bg-red-500/15',     text: 'text-red-400',     bar: 'bg-red-500',    solid: '#ef4444' },
  S7:   { bg: 'bg-pink-500/15',    text: 'text-pink-400',    bar: 'bg-pink-400',   solid: '#f472b6' },
  S8:   { bg: 'bg-slate-500/15',   text: 'text-slate-400',   bar: 'bg-slate-400',  solid: '#94a3b8' },
  S9:   { bg: 'bg-gray-500/15',    text: 'text-gray-400',    bar: 'bg-gray-500',   solid: '#6b7280' },
};

function getStateColor(state: string) {
  return STATE_COLORS[state] || STATE_COLORS.S9;
}

const STATE_LABELS: Record<string, string> = {
  RUN: '가동', IDLE: '대기',
};

/* ── 메인 페이지 ── */
export default function AnalysisPage() {
  const [dateFrom, setDateFrom] = useState(weekAgoKST());
  const [dateTo, setDateTo] = useState(todayKST());
  const [selectedMachines, setSelectedMachines] = useState<Set<number>>(new Set());
  const [results, setResults] = useState<MachineResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [queried, setQueried] = useState(false); // 조회 수행 여부
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [groupFilter, setGroupFilter] = useState<string>('전체');
  const [searchText, setSearchText] = useState('');
  const [expandedMachine, setExpandedMachine] = useState<number | null>(null);

  const { defs: machineDefs, allDefs, loading: defsLoading } = useMachineDefs();
  const { codeMap: stopCodeMap } = useStopCodes();
  const abortRef = useRef<AbortController | null>(null);

  // 공정그룹 목록
  const groups = useMemo(() => {
    const s = new Set(allDefs.map(d => d.group));
    return ['전체', ...Array.from(s)];
  }, [allDefs]);

  // MCNO 매핑된 장비만 필터
  const filteredDefs = useMemo(() => {
    return allDefs.filter(d => {
      if (groupFilter !== '전체' && d.group !== groupFilter) return false;
      if (searchText && !d.name.includes(searchText) && !String(d.no).includes(searchText)) return false;
      return true;
    });
  }, [allDefs, groupFilter, searchText]);

  // MCNO가 있는 장비만 (조회 가능)
  const selectableDefs = useMemo(() => filteredDefs.filter(d => d.mcno != null), [filteredDefs]);

  // 전체선택/해제
  const handleSelectAll = useCallback(() => {
    if (selectedMachines.size === selectableDefs.length && selectableDefs.every(d => selectedMachines.has(d.no))) {
      setSelectedMachines(new Set());
    } else {
      setSelectedMachines(new Set(selectableDefs.map(d => d.no)));
    }
  }, [selectableDefs, selectedMachines]);

  // 개별 선택
  const toggleMachine = useCallback((no: number) => {
    setSelectedMachines(prev => {
      const next = new Set(prev);
      if (next.has(no)) next.delete(no);
      else next.add(no);
      return next;
    });
  }, []);

  // 조회 실행 — Firebase machine_status_daily 데이터 사용
  // (대시보드 동기화 스크립트가 DSPM → Firebase에 누적해둔 데이터를 읽음)
  const handleQuery = useCallback(async () => {
    if (selectedMachines.size === 0) return;
    if (dateFrom > dateTo) return;

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setQueried(true);
    setResults([]);
    setExpandedMachine(null);

    const machines = allDefs.filter(d => selectedMachines.has(d.no) && d.mcno != null);
    setProgress({ done: 0, total: machines.length });

    try {
      // Firebase machine_status_daily에서 기간 데이터를 한 번에 조회
      const url = `/api/status-daily?start=${dateFrom}&end=${dateTo}`;
      const res = await fetch(url, { signal: controller.signal });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        // 전체 실패 시 모든 장비에 에러 표시
        const errorMsg = json.error || `HTTP ${res.status}`;
        setResults(machines.map(def => ({
          machineNo: def.no,
          machineName: def.name,
          mcno: def.mcno!,
          events: [], states: {}, dailySummary: [],
          error: errorMsg,
        })));
        setLoading(false);
        return;
      }

      // entries: MachineStatusDaily[] — 장비×날짜별 레코드
      // machineNo 기준으로 그룹핑
      const entries: Array<{
        machineNo: number; machineName: string; date: string;
        states: Record<string, StateAccum>;
        events: Array<{ state: string; startTime: string; endTime: string; durationSeconds: number }>;
      }> = json.entries || [];

      const byMachine = new Map<number, typeof entries>();
      for (const entry of entries) {
        const list = byMachine.get(entry.machineNo) || [];
        list.push(entry);
        byMachine.set(entry.machineNo, list);
      }

      // 선택된 장비별로 MachineResult 조립
      const allResults: MachineResult[] = machines.map(def => {
        const dayEntries = byMachine.get(def.no) || [];

        // 전체 기간 이벤트 합치기
        const allEvents: DspmEvent[] = [];
        const totalStates: Record<string, StateAccum> = {};
        const dailySummary: DailySummary[] = [];

        // 날짜순 정렬
        dayEntries.sort((a, b) => a.date.localeCompare(b.date));

        for (const day of dayEntries) {
          // 이벤트에 날짜 정보 포함
          for (const evt of (day.events || [])) {
            allEvents.push({
              state: evt.state,
              startTime: `${day.date} ${evt.startTime}`,
              endTime: `${day.date} ${evt.endTime}`,
              durationSeconds: evt.durationSeconds,
            });
          }

          // 상태 합산
          for (const [state, accum] of Object.entries(day.states || {})) {
            if (!totalStates[state]) totalStates[state] = { totalSeconds: 0, count: 0 };
            totalStates[state].totalSeconds += accum.totalSeconds;
            totalStates[state].count += accum.count;
          }

          // 일별 요약 (데이터 있는 날만)
          if ((day.events || []).length > 0 || Object.keys(day.states || {}).length > 0) {
            dailySummary.push({ date: day.date, states: day.states || {} });
          }
        }

        return {
          machineNo: def.no,
          machineName: def.name,
          mcno: def.mcno!,
          events: allEvents,
          states: totalStates,
          dailySummary,
          error: dayEntries.length === 0 ? '해당 기간 누적 데이터 없음 (대시보드가 열려있어야 데이터가 쌓입니다)' : undefined,
        };
      });

      setProgress({ done: machines.length, total: machines.length });
      setResults(allResults);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        // 사용자 취소
      } else {
        setResults(machines.map(def => ({
          machineNo: def.no,
          machineName: def.name,
          mcno: def.mcno!,
          events: [], states: {}, dailySummary: [],
          error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
        })));
      }
    }

    setLoading(false);
  }, [selectedMachines, dateFrom, dateTo, allDefs]);

  // 전체 요약 (모든 장비 합산)
  const totalSummary = useMemo(() => {
    const states: Record<string, StateAccum> = {};
    for (const r of results) {
      if (r.error) continue;
      for (const [k, v] of Object.entries(r.states)) {
        if (!states[k]) states[k] = { totalSeconds: 0, count: 0 };
        states[k].totalSeconds += v.totalSeconds;
        states[k].count += v.count;
      }
    }
    const runSec = states.RUN?.totalSeconds || 0;
    const idleSec = states.IDLE?.totalSeconds || 0;
    let stopSec = 0;
    Object.entries(states).forEach(([k, v]) => {
      if (k !== 'RUN' && k !== 'IDLE') stopSec += v.totalSeconds;
    });
    const total = runSec + idleSec + stopSec;
    return { states, runSec, idleSec, stopSec, total, opRate: total > 0 ? (runSec / total * 100) : 0 };
  }, [results]);

  const isAllSelected = selectableDefs.length > 0 && selectableDefs.every(d => selectedMachines.has(d.no));

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* 헤더 */}
      <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-rose-500/10 flex items-center justify-center">
                <Activity className="w-5 h-5 text-rose-400" />
              </div>
              <div>
                <h1 className="text-lg font-bold">정지/병목 분석</h1>
                <p className="text-[11px] text-gray-500">
                  기간·장비를 선택하여 상태 이력 분석
                  <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-mono bg-emerald-500/15 text-emerald-400">
                    Firebase 누적
                  </span>
                  <a
                    href="/api/dspm/fix-mcno"
                    target="_blank"
                    className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-mono bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    MCNO확인
                  </a>
                </p>
              </div>
            </div>
          </div>

          {/* 기간 선택 + 조회 버튼 */}
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5">
              <Calendar className="w-4 h-4 text-gray-500" />
              <input
                type="date"
                value={dateFrom}
                max={dateTo || todayKST()}
                onChange={(e) => setDateFrom(e.target.value)}
                className="bg-transparent text-sm text-white outline-none"
              />
              <span className="text-gray-500 text-xs">~</span>
              <input
                type="date"
                value={dateTo}
                min={dateFrom}
                max={todayKST()}
                onChange={(e) => setDateTo(e.target.value)}
                className="bg-transparent text-sm text-white outline-none"
              />
            </div>
            <button
              onClick={() => { setDateFrom(todayKST()); setDateTo(todayKST()); }}
              className="text-xs text-gray-400 hover:text-blue-300 px-2 py-1 rounded hover:bg-blue-500/10 transition-colors"
            >
              오늘
            </button>
            <button
              onClick={() => setDateFrom(weekAgoKST())}
              className="text-xs text-gray-400 hover:text-blue-300 px-2 py-1 rounded hover:bg-blue-500/10 transition-colors"
            >
              최근7일
            </button>
            <button
              onClick={() => {
                const d = new Date();
                const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
                const y = kst.getFullYear();
                const m = String(kst.getMonth() + 1).padStart(2, '0');
                setDateFrom(`${y}-${m}-01`);
                setDateTo(todayKST());
              }}
              className="text-xs text-gray-400 hover:text-blue-300 px-2 py-1 rounded hover:bg-blue-500/10 transition-colors"
            >
              이번달
            </button>

            <div className="flex-1" />

            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">
                {selectedMachines.size}대 선택
              </span>
              <button
                onClick={handleQuery}
                disabled={loading || selectedMachines.size === 0 || dateFrom > dateTo}
                className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                  loading || selectedMachines.size === 0 || dateFrom > dateTo
                    ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-600/20'
                }`}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    조회 중 ({progress.done}/{progress.total})
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    조회
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* 메인 컨텐츠 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 좌측: 장비 선택 목록 */}
        <div className="w-72 border-r border-gray-800 flex flex-col bg-gray-950">
          {/* 필터 */}
          <div className="p-3 border-b border-gray-800 space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
              <input
                type="text"
                placeholder="장비 검색..."
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-gray-600 outline-none focus:border-gray-600"
              />
            </div>
            <div className="flex gap-1 flex-wrap">
              {groups.map(g => (
                <button
                  key={g}
                  onClick={() => setGroupFilter(g)}
                  className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                    groupFilter === g
                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                      : 'bg-gray-800 text-gray-500 border border-transparent hover:text-gray-300'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* 전체선택 */}
          <button
            onClick={handleSelectAll}
            className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-800 hover:bg-gray-900/80 transition-colors"
          >
            {isAllSelected ? (
              <CheckSquare className="w-4 h-4 text-blue-400" />
            ) : (
              <Square className="w-4 h-4 text-gray-600" />
            )}
            <span className="text-xs font-medium text-gray-300">
              전체선택
            </span>
            <span className="text-[10px] text-gray-600 ml-auto">
              {selectableDefs.length}대
            </span>
          </button>

          {/* 장비 리스트 */}
          <div className="flex-1 overflow-y-auto">
            {filteredDefs.map(def => {
              const hasMcno = def.mcno != null;
              const isChecked = selectedMachines.has(def.no);
              return (
                <button
                  key={def.no}
                  onClick={() => hasMcno && toggleMachine(def.no)}
                  disabled={!hasMcno}
                  className={`w-full text-left px-4 py-2.5 border-b border-gray-800/50 transition-colors ${
                    !hasMcno
                      ? 'opacity-40 cursor-not-allowed'
                      : isChecked
                        ? 'bg-blue-500/5 border-l-2 border-l-blue-500'
                        : 'hover:bg-gray-900/80 border-l-2 border-l-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {hasMcno ? (
                      isChecked ? (
                        <CheckSquare className="w-4 h-4 text-blue-400 shrink-0" />
                      ) : (
                        <Square className="w-4 h-4 text-gray-600 shrink-0" />
                      )
                    ) : (
                      <Square className="w-4 h-4 text-gray-800 shrink-0" />
                    )}
                    <span className="text-[10px] text-gray-600 font-mono w-5 shrink-0">
                      {String(def.no).padStart(2, '0')}
                    </span>
                    <span className={`text-xs truncate ${isChecked ? 'text-white font-medium' : 'text-gray-400'}`}>
                      {def.name}
                    </span>
                    {!hasMcno && (
                      <span className="text-[9px] text-gray-600 bg-gray-800 px-1 py-0.5 rounded shrink-0 ml-auto">
                        미연결
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="px-4 py-2 border-t border-gray-800 text-[10px] text-gray-600">
            전체 {allDefs.length}대 · 선택 {selectedMachines.size}대
          </div>
        </div>

        {/* 우측: 분석 결과 */}
        <div className="flex-1 overflow-y-auto">
          {!queried ? (
            /* 미조회 안내 */
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <Activity className="w-16 h-16 mb-4 text-gray-800" />
              <p className="text-sm font-medium text-gray-400">기간과 장비를 선택 후 조회하세요</p>
              <p className="text-xs text-gray-600 mt-1">
                좌측에서 장비를 선택하고 상단 [조회] 버튼을 클릭하세요
              </p>
            </div>
          ) : loading && results.length === 0 ? (
            /* 초기 로딩 */
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-3 text-gray-400">
                <Loader2 className="w-8 h-8 animate-spin" />
                <span className="text-sm">
                  DSPM 이력 조회 중... ({progress.done}/{progress.total})
                </span>
              </div>
            </div>
          ) : results.length === 0 && !loading ? (
            /* 결과 없음 */
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <Clock className="w-12 h-12 mb-3 text-gray-700" />
              <p className="text-sm">해당 기간에 데이터가 없습니다</p>
            </div>
          ) : (
            /* 결과 표시 */
            <div className="p-6 space-y-6">
              {/* 전체 요약 */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-base font-bold text-gray-200">
                      전체 요약
                    </h2>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      {dateFrom} ~ {dateTo} · {results.filter(r => !r.error).length}대 장비
                      {loading && <span className="text-blue-400 ml-2">조회 진행 중...</span>}
                    </p>
                  </div>
                  {!loading && (
                    <button
                      onClick={handleQuery}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 text-xs text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
                    >
                      <RefreshCw className="w-3 h-3" />
                      재조회
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <SummaryCard label="가동" value={formatSeconds(totalSummary.runSec)} sub={`${totalSummary.states.RUN?.count || 0}회`} color="emerald" icon={Play} />
                  <SummaryCard label="대기" value={formatSeconds(totalSummary.idleSec)} sub={`${totalSummary.states.IDLE?.count || 0}회`} color="amber" icon={Pause} />
                  <SummaryCard label="정지" value={formatSeconds(totalSummary.stopSec)} sub={`${Object.entries(totalSummary.states).filter(([k]) => k !== 'RUN' && k !== 'IDLE').reduce((a, [, v]) => a + v.count, 0)}회`} color="rose" icon={AlertTriangle} />
                  <SummaryCard label="가동률" value={`${totalSummary.opRate.toFixed(1)}%`} sub={`총 ${formatSeconds(totalSummary.total)}`} color="blue" icon={Activity} />
                </div>
              </div>

              {/* 장비별 결과 */}
              <div>
                <h3 className="text-sm font-semibold text-gray-300 mb-3">장비별 분석</h3>
                <div className="space-y-2">
                  {results.map(r => (
                    <MachineResultCard
                      key={r.machineNo}
                      result={r}
                      stopCodeMap={stopCodeMap}
                      expanded={expandedMachine === r.machineNo}
                      onToggle={() => setExpandedMachine(expandedMachine === r.machineNo ? null : r.machineNo)}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── 요약 카드 ── */
function SummaryCard({
  label, value, sub, color, icon: Icon,
}: {
  label: string; value: string; sub: string;
  color: 'emerald' | 'amber' | 'rose' | 'blue';
  icon: React.ComponentType<{ className?: string }>;
}) {
  const colorMap = {
    emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', icon: 'text-emerald-500' },
    amber:   { bg: 'bg-amber-500/10',   text: 'text-amber-400',   icon: 'text-amber-500' },
    rose:    { bg: 'bg-rose-500/10',     text: 'text-rose-400',    icon: 'text-rose-500' },
    blue:    { bg: 'bg-blue-500/10',     text: 'text-blue-400',    icon: 'text-blue-500' },
  };
  const c = colorMap[color];
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-7 h-7 rounded-lg ${c.bg} flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${c.icon}`} />
        </div>
        <span className="text-[11px] text-gray-500">{label}</span>
      </div>
      <p className={`text-xl font-bold ${c.text}`}>{value}</p>
      <p className="text-[10px] text-gray-600 mt-1">{sub}</p>
    </div>
  );
}

/* ── 장비별 결과 카드 ── */
function MachineResultCard({
  result: r,
  stopCodeMap,
  expanded,
  onToggle,
}: {
  result: MachineResult;
  stopCodeMap: Record<string, string>;
  expanded: boolean;
  onToggle: () => void;
}) {
  const runSec = r.states?.RUN?.totalSeconds || 0;
  const idleSec = r.states?.IDLE?.totalSeconds || 0;
  let stopSec = 0;
  Object.entries(r.states || {}).forEach(([k, v]) => {
    if (k !== 'RUN' && k !== 'IDLE') stopSec += v.totalSeconds;
  });
  const total = runSec + idleSec + stopSec;
  const opRate = total > 0 ? (runSec / total * 100) : 0;

  // 정지코드 랭킹
  const stopRanking = useMemo(() => {
    return Object.entries(r.states || {})
      .filter(([k]) => k !== 'RUN' && k !== 'IDLE')
      .map(([code, accum]) => ({
        code,
        name: stopCodeMap[code] || code,
        seconds: accum.totalSeconds,
        count: accum.count,
        pct: stopSec > 0 ? (accum.totalSeconds / stopSec * 100) : 0,
      }))
      .sort((a, b) => b.seconds - a.seconds);
  }, [r.states, stopCodeMap, stopSec]);

  if (r.error) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-gray-600 font-mono">{String(r.machineNo).padStart(2, '0')}</span>
          <span className="text-sm text-gray-300">{r.machineName}</span>
          <span className="text-[10px] text-amber-400 ml-auto">{r.error}</span>
        </div>
      </div>
    );
  }

  if (r.events.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-gray-600 font-mono">{String(r.machineNo).padStart(2, '0')}</span>
          <span className="text-sm text-gray-300">{r.machineName}</span>
          <span className="text-[10px] text-gray-600 ml-auto">데이터 없음</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      {/* 접히는 헤더 */}
      <button onClick={onToggle} className="w-full text-left px-5 py-4 hover:bg-gray-800/30 transition-colors">
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-gray-600 font-mono">{String(r.machineNo).padStart(2, '0')}</span>
          <span className="text-sm font-medium text-white">{r.machineName}</span>
          <span className="text-[10px] text-gray-600">MCNO {r.mcno}</span>

          <div className="flex-1" />

          {/* 미니 상태바 */}
          <div className="w-32 h-2.5 rounded-full overflow-hidden bg-gray-800 hidden sm:flex">
            {total > 0 && (
              <>
                {runSec > 0 && <div className="bg-emerald-500 h-full" style={{ width: `${(runSec / total) * 100}%` }} />}
                {idleSec > 0 && <div className="bg-amber-400 h-full" style={{ width: `${(idleSec / total) * 100}%` }} />}
                {stopSec > 0 && <div className="bg-rose-500 h-full" style={{ width: `${(stopSec / total) * 100}%` }} />}
              </>
            )}
          </div>

          <span className={`text-xs font-mono ${opRate >= 80 ? 'text-emerald-400' : opRate >= 50 ? 'text-amber-400' : 'text-rose-400'}`}>
            {opRate.toFixed(1)}%
          </span>
          <span className="text-[10px] text-gray-500">{formatSeconds(total)}</span>

          {expanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
        </div>
      </button>

      {/* 확장 내용 */}
      {expanded && (
        <div className="border-t border-gray-800 p-5 space-y-5">
          {/* 요약 수치 */}
          <div className="grid grid-cols-4 gap-3 text-center">
            <div>
              <p className="text-[10px] text-gray-500">가동</p>
              <p className="text-sm font-semibold text-emerald-400">{formatSeconds(runSec)}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500">대기</p>
              <p className="text-sm font-semibold text-amber-400">{formatSeconds(idleSec)}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500">정지</p>
              <p className="text-sm font-semibold text-rose-400">{formatSeconds(stopSec)}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500">가동률</p>
              <p className="text-sm font-semibold text-blue-400">{opRate.toFixed(1)}%</p>
            </div>
          </div>

          {/* 상태 비율 바 */}
          <div className="flex h-3 rounded-full overflow-hidden bg-gray-800">
            {total > 0 && (
              <>
                {runSec > 0 && <div className="bg-emerald-500" style={{ width: `${(runSec / total) * 100}%` }} />}
                {idleSec > 0 && <div className="bg-amber-400" style={{ width: `${(idleSec / total) * 100}%` }} />}
                {stopSec > 0 && <div className="bg-rose-500" style={{ width: `${(stopSec / total) * 100}%` }} />}
              </>
            )}
          </div>
          <div className="flex gap-4 text-[10px] text-gray-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />가동 {(runSec / Math.max(total, 1) * 100).toFixed(1)}%</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" />대기 {(idleSec / Math.max(total, 1) * 100).toFixed(1)}%</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" />정지 {(stopSec / Math.max(total, 1) * 100).toFixed(1)}%</span>
          </div>

          {/* 정지코드 분석 */}
          {stopRanking.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-400 mb-2">정지코드 분석</h4>
              <div className="space-y-2">
                {stopRanking.map((item, i) => (
                  <div key={item.code}>
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-600 font-mono w-4">{i + 1}</span>
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${getStateColor(item.code).bg} ${getStateColor(item.code).text}`}>
                          {item.code}
                        </span>
                        <span className="text-[11px] text-gray-300">{item.name}</span>
                      </div>
                      <span className="text-[11px] text-gray-500">{formatSeconds(item.seconds)} · {item.count}회</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden ml-6">
                      <div className={`h-full rounded-full ${getStateColor(item.code).bar}`} style={{ width: `${item.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 일별 요약 */}
          {r.dailySummary && r.dailySummary.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-400 mb-2">일별 요약</h4>
              <div className="max-h-60 overflow-y-auto">
                <table className="w-full text-[11px]">
                  <thead className="text-gray-500 bg-gray-900 sticky top-0">
                    <tr className="border-b border-gray-800">
                      <th className="text-left px-3 py-1.5 font-medium">날짜</th>
                      <th className="text-right px-3 py-1.5 font-medium">가동</th>
                      <th className="text-right px-3 py-1.5 font-medium">대기</th>
                      <th className="text-right px-3 py-1.5 font-medium">정지</th>
                      <th className="text-right px-3 py-1.5 font-medium">가동률</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.dailySummary.map(day => {
                      const dRun = day.states?.RUN?.totalSeconds || 0;
                      const dIdle = day.states?.IDLE?.totalSeconds || 0;
                      let dStop = 0;
                      Object.entries(day.states || {}).forEach(([k, v]) => {
                        if (k !== 'RUN' && k !== 'IDLE') dStop += v.totalSeconds;
                      });
                      const dTotal = dRun + dIdle + dStop;
                      const dRate = dTotal > 0 ? (dRun / dTotal * 100) : 0;
                      return (
                        <tr key={day.date} className="border-b border-gray-800/30 hover:bg-gray-800/20">
                          <td className="px-3 py-1.5 font-mono text-gray-300">{day.date}</td>
                          <td className="px-3 py-1.5 text-right text-emerald-400">{formatSeconds(dRun)}</td>
                          <td className="px-3 py-1.5 text-right text-amber-400">{formatSeconds(dIdle)}</td>
                          <td className="px-3 py-1.5 text-right text-rose-400">{formatSeconds(dStop)}</td>
                          <td className={`px-3 py-1.5 text-right font-medium ${dRate >= 80 ? 'text-emerald-400' : dRate >= 50 ? 'text-amber-400' : 'text-rose-400'}`}>
                            {dRate.toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 이벤트 이력 */}
          <div>
            <h4 className="text-xs font-semibold text-gray-400 mb-2">
              상태 변경 이력 <span className="text-gray-600 font-normal">({r.events.length}건)</span>
            </h4>
            <div className="max-h-60 overflow-y-auto">
              <table className="w-full text-[11px]">
                <thead className="text-gray-500 bg-gray-900 sticky top-0">
                  <tr className="border-b border-gray-800">
                    <th className="text-left px-3 py-1.5 font-medium">상태</th>
                    <th className="text-left px-3 py-1.5 font-medium">시작</th>
                    <th className="text-left px-3 py-1.5 font-medium">종료</th>
                    <th className="text-right px-3 py-1.5 font-medium">소요시간</th>
                  </tr>
                </thead>
                <tbody>
                  {r.events.slice().reverse().slice(0, 100).map((evt, i) => {
                    const label = STATE_LABELS[evt.state] || stopCodeMap[evt.state] || evt.state;
                    return (
                      <tr key={i} className="border-b border-gray-800/30 hover:bg-gray-800/20">
                        <td className="px-3 py-1.5">
                          <span className={`font-mono px-1.5 py-0.5 rounded ${getStateColor(evt.state).bg} ${getStateColor(evt.state).text}`}>
                            {evt.state}
                          </span>
                          <span className="text-gray-500 ml-1.5">{label}</span>
                        </td>
                        <td className="px-3 py-1.5 font-mono text-gray-400">{evt.startTime}</td>
                        <td className="px-3 py-1.5 font-mono text-gray-400">{evt.endTime}</td>
                        <td className="px-3 py-1.5 text-right text-gray-300">{formatSeconds(evt.durationSeconds)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {r.events.length > 100 && (
                <p className="text-[10px] text-gray-600 text-center py-2">
                  최근 100건만 표시 (전체 {r.events.length}건)
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
