// src/app/analysis/page.tsx
// v2.10.9 — 정지/병목분석: 온디맨드 DSPM 이력 조회
// 1차: Firebase 캐시 확인 → 있으면 즉시 표시
// 2차: 없으면 dspm_sync_requests 생성 → 사내PC 스크립트가 DSPM에서 가져와 Firebase 저장 → 표시
'use client';

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  Activity, Calendar, Clock, Play, AlertTriangle, Pause,
  Search, Loader2, RefreshCw, CheckSquare, Square, ChevronDown, ChevronUp,
  Download, Wifi, WifiOff,
} from 'lucide-react';
import { useMachineDefs } from '@/lib/machine-defs';
import { useStopCodes } from '@/lib/useStopCodes';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

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
  hasData: boolean; // Firebase에 데이터 존재 여부
}

type SyncStatus = 'idle' | 'requesting' | 'pending' | 'processing' | 'completed' | 'error' | 'timeout';

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
  const [queried, setQueried] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [groupFilter, setGroupFilter] = useState<string>('전체');
  const [searchText, setSearchText] = useState('');
  const [expandedMachine, setExpandedMachine] = useState<number | null>(null);

  // 동기화 요청 상태
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [syncRequestId, setSyncRequestId] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<{ total: number; done: number; currentMachine: string } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [missingMachineCount, setMissingMachineCount] = useState(0);

  const { defs: machineDefs, allDefs, loading: defsLoading } = useMachineDefs();
  const { codeMap: stopCodeMap } = useStopCodes();
  const abortRef = useRef<AbortController | null>(null);
  const unsubSyncRef = useRef<(() => void) | null>(null);

  // 동기화 요청 감시 해제
  useEffect(() => {
    return () => {
      if (unsubSyncRef.current) unsubSyncRef.current();
    };
  }, []);

  // 공정그룹 목록
  const groups = useMemo(() => {
    const s = new Set(allDefs.map(d => d.group));
    return ['전체', ...Array.from(s)];
  }, [allDefs]);

  // 필터된 장비
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

  // Firebase에서 데이터 조회
  const fetchFirebaseData = useCallback(async (signal: AbortSignal) => {
    const url = `/api/status-daily?start=${dateFrom}&end=${dateTo}`;
    const res = await fetch(url, { signal });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      throw new Error(json.error || `HTTP ${res.status}`);
    }
    return json.entries || [];
  }, [dateFrom, dateTo]);

  // Firebase 데이터를 MachineResult[]로 변환
  const buildResults = useCallback((
    entries: Array<{
      machineNo: number; machineName: string; date: string;
      states: Record<string, StateAccum>;
      events: Array<{ state: string; startTime: string; endTime: string; durationSeconds: number }>;
    }>,
    machines: Array<{ no: number; name: string; mcno?: number }>
  ): MachineResult[] => {
    const byMachine = new Map<number, typeof entries>();
    for (const entry of entries) {
      const list = byMachine.get(entry.machineNo) || [];
      list.push(entry);
      byMachine.set(entry.machineNo, list);
    }

    return machines.map(def => {
      const dayEntries = byMachine.get(def.no) || [];
      const allEvents: DspmEvent[] = [];
      const totalStates: Record<string, StateAccum> = {};
      const dailySummary: DailySummary[] = [];

      dayEntries.sort((a, b) => a.date.localeCompare(b.date));

      for (const day of dayEntries) {
        for (const evt of (day.events || [])) {
          allEvents.push({
            state: evt.state,
            startTime: `${day.date} ${evt.startTime}`,
            endTime: `${day.date} ${evt.endTime}`,
            durationSeconds: evt.durationSeconds,
          });
        }
        for (const [state, accum] of Object.entries(day.states || {})) {
          if (!totalStates[state]) totalStates[state] = { totalSeconds: 0, count: 0 };
          totalStates[state].totalSeconds += accum.totalSeconds;
          totalStates[state].count += accum.count;
        }
        if ((day.events || []).length > 0 || Object.keys(day.states || {}).length > 0) {
          dailySummary.push({ date: day.date, states: day.states || {} });
        }
      }

      const hasData = dayEntries.length > 0;
      return {
        machineNo: def.no,
        machineName: def.name,
        mcno: def.mcno!,
        events: allEvents,
        states: totalStates,
        dailySummary,
        hasData,
        error: hasData ? undefined : undefined, // 데이터 없는 건 동기화 요청 UI로 처리
      };
    });
  }, []);

  // 1단계: 조회 실행 — Firebase 캐시 먼저 확인
  const handleQuery = useCallback(async () => {
    if (selectedMachines.size === 0) return;
    if (dateFrom > dateTo) return;

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // 동기화 상태 초기화
    setSyncStatus('idle');
    setSyncRequestId(null);
    setSyncProgress(null);
    setSyncError(null);
    if (unsubSyncRef.current) { unsubSyncRef.current(); unsubSyncRef.current = null; }

    setLoading(true);
    setQueried(true);
    setResults([]);
    setExpandedMachine(null);

    const machines = allDefs.filter(d => selectedMachines.has(d.no) && d.mcno != null);
    setProgress({ done: 0, total: machines.length });

    try {
      const entries = await fetchFirebaseData(controller.signal);
      const allResults = buildResults(entries, machines);
      const missing = allResults.filter(r => !r.hasData).length;
      setMissingMachineCount(missing);
      setProgress({ done: machines.length, total: machines.length });
      setResults(allResults);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setResults(machines.map(def => ({
        machineNo: def.no,
        machineName: def.name,
        mcno: def.mcno!,
        events: [], states: {}, dailySummary: [],
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
        hasData: false,
      })));
    }

    setLoading(false);
  }, [selectedMachines, dateFrom, dateTo, allDefs, fetchFirebaseData, buildResults]);

  // 2단계: DSPM 동기화 요청
  const handleSyncRequest = useCallback(async () => {
    const machines = allDefs
      .filter(d => selectedMachines.has(d.no) && d.mcno != null)
      .map(d => ({ no: d.no, mcno: d.mcno!, name: d.name }));

    if (machines.length === 0) return;

    setSyncStatus('requesting');
    setSyncError(null);

    try {
      const res = await fetch('/api/dspm/sync-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateFrom, dateTo, machines }),
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }

      const requestId = json.requestId;
      setSyncRequestId(requestId);
      setSyncStatus('pending');

      // Firebase onSnapshot으로 요청 상태 실시간 감시
      const unsub = onSnapshot(
        doc(db, 'dspm_sync_requests', requestId),
        (snap) => {
          if (!snap.exists()) return;
          const data = snap.data();
          const status = data.status as SyncStatus;

          setSyncStatus(status);
          if (data.progress) {
            setSyncProgress(data.progress);
          }
          if (data.error) {
            setSyncError(data.error);
          }

          // 완료되면 데이터 다시 로드
          if (status === 'completed') {
            unsub();
            unsubSyncRef.current = null;
            // 약간의 딜레이 후 재조회 (Firebase 쓰기 전파 대기)
            setTimeout(async () => {
              try {
                const controller = new AbortController();
                const entries = await fetchFirebaseData(controller.signal);
                const machinesForResults = allDefs.filter(d => selectedMachines.has(d.no) && d.mcno != null);
                const newResults = buildResults(entries, machinesForResults);
                const missing = newResults.filter(r => !r.hasData).length;
                setMissingMachineCount(missing);
                setResults(newResults);
              } catch {
                // 재조회 실패 시 수동 재조회 안내
              }
            }, 1500);
          }

          if (status === 'error') {
            unsub();
            unsubSyncRef.current = null;
          }
        },
        () => {
          setSyncStatus('error');
          setSyncError('동기화 요청 상태 감시 실패');
        }
      );

      unsubSyncRef.current = unsub;

      // 2분 타임아웃
      setTimeout(() => {
        if (unsubSyncRef.current === unsub) {
          // 아직 감시 중이면 타임아웃
          setSyncStatus(prev => {
            if (prev === 'pending' || prev === 'processing') {
              unsub();
              unsubSyncRef.current = null;
              return 'timeout';
            }
            return prev;
          });
        }
      }, 120000);

    } catch (err) {
      setSyncStatus('error');
      setSyncError(err instanceof Error ? err.message : String(err));
    }
  }, [allDefs, selectedMachines, dateFrom, dateTo, fetchFirebaseData, buildResults]);

  // 전체 요약 (데이터 있는 장비만)
  const totalSummary = useMemo(() => {
    const states: Record<string, StateAccum> = {};
    for (const r of results) {
      if (!r.hasData) continue;
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
  const dataExistCount = results.filter(r => r.hasData).length;

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
                  <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-mono bg-cyan-500/15 text-cyan-400">
                    온디맨드
                  </span>
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
                    조회 중...
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
              <div className="mt-6 p-4 rounded-xl bg-gray-900/50 border border-gray-800 max-w-md">
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  <span className="text-cyan-400 font-medium">💡 온디맨드 조회 방식</span><br/>
                  Firebase에 캐시된 데이터를 먼저 확인합니다.<br/>
                  데이터가 없는 기간은 사내PC의 동기화 스크립트를 통해<br/>
                  DSPM에서 과거 이력을 가져올 수 있습니다.
                </p>
              </div>
            </div>
          ) : loading && results.length === 0 ? (
            /* 초기 로딩 */
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-3 text-gray-400">
                <Loader2 className="w-8 h-8 animate-spin" />
                <span className="text-sm">Firebase 데이터 확인 중...</span>
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
              {/* 동기화 요청 배너 — 데이터 없는 장비가 있을 때 */}
              {missingMachineCount > 0 && (
                <SyncBanner
                  missingCount={missingMachineCount}
                  totalCount={results.length}
                  syncStatus={syncStatus}
                  syncProgress={syncProgress}
                  syncError={syncError}
                  onSyncRequest={handleSyncRequest}
                  onRetryQuery={handleQuery}
                />
              )}

              {/* 전체 요약 */}
              {dataExistCount > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-base font-bold text-gray-200">전체 요약</h2>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {dateFrom} ~ {dateTo} · {dataExistCount}대 장비 (데이터 있음)
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
              )}

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
                      syncStatus={syncStatus}
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

/* ── 동기화 요청 배너 ── */
function SyncBanner({
  missingCount,
  totalCount,
  syncStatus,
  syncProgress,
  syncError,
  onSyncRequest,
  onRetryQuery,
}: {
  missingCount: number;
  totalCount: number;
  syncStatus: SyncStatus;
  syncProgress: { total: number; done: number; currentMachine: string } | null;
  syncError: string | null;
  onSyncRequest: () => void;
  onRetryQuery: () => void;
}) {
  if (syncStatus === 'completed') {
    return (
      <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <Wifi className="w-5 h-5 text-emerald-400" />
          <div className="flex-1">
            <p className="text-sm font-medium text-emerald-300">동기화 완료</p>
            <p className="text-[11px] text-emerald-400/60 mt-0.5">
              DSPM 이력 데이터가 Firebase에 저장되었습니다
            </p>
          </div>
          <button
            onClick={onRetryQuery}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-xs text-emerald-300 hover:bg-emerald-500/20 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            새로고침
          </button>
        </div>
      </div>
    );
  }

  if (syncStatus === 'error') {
    return (
      <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-400" />
          <div className="flex-1">
            <p className="text-sm font-medium text-rose-300">동기화 오류</p>
            <p className="text-[11px] text-rose-400/60 mt-0.5">{syncError || '알 수 없는 오류'}</p>
          </div>
          <button
            onClick={onSyncRequest}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 text-xs text-rose-300 hover:bg-rose-500/20 transition-colors"
          >
            재시도
          </button>
        </div>
      </div>
    );
  }

  if (syncStatus === 'timeout') {
    return (
      <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <WifiOff className="w-5 h-5 text-amber-400" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-300">동기화 응답 없음</p>
            <p className="text-[11px] text-amber-400/60 mt-0.5">
              사내PC에서 <code className="font-mono bg-amber-500/10 px-1 rounded">dspm-log-sync</code> 스크립트가 실행 중인지 확인해주세요
            </p>
          </div>
          <button
            onClick={onSyncRequest}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 text-xs text-amber-300 hover:bg-amber-500/20 transition-colors"
          >
            재시도
          </button>
        </div>
      </div>
    );
  }

  if (syncStatus === 'pending' || syncStatus === 'processing' || syncStatus === 'requesting') {
    return (
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-300">
              {syncStatus === 'requesting' ? 'DSPM 동기화 요청 중...' :
               syncStatus === 'pending' ? '사내PC 스크립트 대기 중...' :
               'DSPM 이력 데이터 가져오는 중...'}
            </p>
            {syncProgress && (
              <div className="mt-2">
                <div className="flex items-center justify-between text-[11px] text-blue-400/60 mb-1">
                  <span>{syncProgress.currentMachine}</span>
                  <span>{syncProgress.done} / {syncProgress.total}</span>
                </div>
                <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-500"
                    style={{ width: `${syncProgress.total > 0 ? (syncProgress.done / syncProgress.total * 100) : 0}%` }}
                  />
                </div>
              </div>
            )}
            {syncStatus === 'pending' && (
              <p className="text-[11px] text-blue-400/40 mt-1">
                사내PC에서 dspm-log-sync 스크립트가 실행 중이어야 합니다
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // idle — 동기화 미요청 상태
  return (
    <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-xl p-4">
      <div className="flex items-center gap-3">
        <Download className="w-5 h-5 text-cyan-400" />
        <div className="flex-1">
          <p className="text-sm font-medium text-cyan-300">
            {missingCount}대 장비의 데이터가 없습니다
          </p>
          <p className="text-[11px] text-cyan-400/60 mt-0.5">
            사내PC에서 DSPM 과거 이력을 가져와 Firebase에 저장할 수 있습니다
          </p>
        </div>
        <button
          onClick={onSyncRequest}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 text-sm font-semibold text-white hover:bg-cyan-500 transition-colors shadow-lg shadow-cyan-600/20"
        >
          <Download className="w-4 h-4" />
          DSPM 동기화 요청
        </button>
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
  syncStatus,
}: {
  result: MachineResult;
  stopCodeMap: Record<string, string>;
  expanded: boolean;
  onToggle: () => void;
  syncStatus: SyncStatus;
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

  // 데이터 없는 장비 — 동기화 상태에 따라 표시
  if (!r.hasData) {
    const isSyncing = syncStatus === 'pending' || syncStatus === 'processing' || syncStatus === 'requesting';
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-gray-600 font-mono">{String(r.machineNo).padStart(2, '0')}</span>
          <span className="text-sm text-gray-300">{r.machineName}</span>
          <span className="text-[10px] text-gray-600">MCNO {r.mcno}</span>
          <span className={`text-[10px] ml-auto ${isSyncing ? 'text-blue-400' : 'text-gray-600'}`}>
            {isSyncing ? (
              <span className="flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                동기화 중...
              </span>
            ) : syncStatus === 'completed' ? (
              <span className="text-emerald-400">동기화 완료 — 새로고침하세요</span>
            ) : (
              '데이터 없음'
            )}
          </span>
        </div>
      </div>
    );
  }

  if (r.events.length === 0 && Object.keys(r.states).length === 0) {
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
