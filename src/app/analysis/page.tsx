// src/app/analysis/page.tsx
// v2.10.3 — 정지/병목분석 전면 개편: 장비 선택 → DSPM 온디맨드 조회
'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Activity, Calendar, ChevronLeft, ChevronRight,
  Clock, Play, Square, AlertTriangle, Pause,
  Search, Loader2, RefreshCw, ChevronDown,
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

interface MachineAnalysis {
  events: DspmEvent[];
  states: Record<string, StateAccum>;
  totalSeconds: number;
}

/* ── KST 날짜 유틸 ── */
function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
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

function formatSecondsShort(sec: number): string {
  if (sec <= 0) return '0:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}`;
  return `${m}분`;
}

function formatTime(time: string): string {
  // HH:MM:SS → HH:MM
  return time.slice(0, 5);
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
  const [date, setDate] = useState(todayKST());
  const [selectedMachine, setSelectedMachine] = useState<number | null>(null);
  const [analysis, setAnalysis] = useState<MachineAnalysis | null>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState<string>('전체');
  const [searchText, setSearchText] = useState('');
  const { defs: machineDefs, allDefs, loading: defsLoading } = useMachineDefs();
  const { codes: stopCodes, codeMap: stopCodeMap } = useStopCodes();
  const abortRef = useRef<AbortController | null>(null);

  // 공정그룹 목록
  const groups = useMemo(() => {
    const s = new Set(allDefs.map(d => d.group));
    return ['전체', ...Array.from(s)];
  }, [allDefs]);

  // 필터링된 장비 목록
  const filteredDefs = useMemo(() => {
    return allDefs.filter(d => {
      if (groupFilter !== '전체' && d.group !== groupFilter) return false;
      if (searchText && !d.name.includes(searchText) && !String(d.no).includes(searchText)) return false;
      return true;
    });
  }, [allDefs, groupFilter, searchText]);

  // 장비 선택 시 DSPM 로그 조회
  const fetchAnalysis = useCallback(async (machineNo: number, targetDate: string) => {
    const def = machineDefs[machineNo];
    if (!def?.mcno) {
      setAnalysis({ events: [], states: {}, totalSeconds: 0 });
      setError('DSPM 매핑 없음 (mcno 미설정)');
      return;
    }

    // 이전 요청 취소
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoadingAnalysis(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/dspm/log?mcno=${def.mcno}&date=${targetDate}`,
        { signal: controller.signal }
      );
      const json = await res.json();

      if (!res.ok || !json.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }

      const events: DspmEvent[] = json.events || [];
      const states: Record<string, StateAccum> = json.states || {};
      let totalSeconds = 0;
      Object.values(states).forEach(s => { totalSeconds += (s as StateAccum).totalSeconds; });

      setAnalysis({ events, states, totalSeconds });
      setError(null);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : String(err));
      setAnalysis(null);
    } finally {
      setLoadingAnalysis(false);
    }
  }, [machineDefs]);

  // 장비 또는 날짜 변경 시 조회
  useEffect(() => {
    if (selectedMachine !== null) {
      fetchAnalysis(selectedMachine, date);
    }
    return () => { abortRef.current?.abort(); };
  }, [selectedMachine, date, fetchAnalysis]);

  // 장비 선택 핸들러
  const handleSelectMachine = (no: number) => {
    if (selectedMachine === no) return; // 같은 장비 재클릭 무시
    setSelectedMachine(no);
    setAnalysis(null);
  };

  // 분석 데이터 계산
  const runSeconds = (analysis?.states?.RUN as StateAccum)?.totalSeconds || 0;
  const idleSeconds = (analysis?.states?.IDLE as StateAccum)?.totalSeconds || 0;
  let stopSeconds = 0;
  if (analysis?.states) {
    Object.entries(analysis.states).forEach(([k, v]) => {
      if (k !== 'RUN' && k !== 'IDLE') stopSeconds += (v as StateAccum).totalSeconds;
    });
  }
  const totalSeconds = runSeconds + idleSeconds + stopSeconds;
  const opRate = totalSeconds > 0 ? (runSeconds / totalSeconds * 100) : 0;

  // 정지코드 랭킹
  const stopRanking = useMemo(() => {
    if (!analysis?.states) return [];
    return Object.entries(analysis.states)
      .filter(([k]) => k !== 'RUN' && k !== 'IDLE')
      .map(([code, accum]) => {
        const a = accum as StateAccum;
        return {
          code,
          name: stopCodeMap[code] || code,
          seconds: a.totalSeconds,
          count: a.count,
          pct: stopSeconds > 0 ? (a.totalSeconds / stopSeconds * 100) : 0,
        };
      })
      .sort((a, b) => b.seconds - a.seconds);
  }, [analysis, stopCodeMap, stopSeconds]);

  const selectedDef = selectedMachine !== null ? machineDefs[selectedMachine] : null;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* 헤더 */}
      <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-rose-500/10 flex items-center justify-center">
              <Activity className="w-5 h-5 text-rose-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold">정지/병목 분석</h1>
              <p className="text-[11px] text-gray-500">
                장비를 선택하여 DSPM 상태 이력 분석
                <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-mono bg-blue-500/15 text-blue-400">
                  DSPM LOG
                </span>
              </p>
            </div>
          </div>

          {/* 날짜 선택 */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDate(shiftDate(date, -1))}
              className="p-1.5 rounded-md hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5">
              <Calendar className="w-4 h-4 text-gray-500" />
              <input
                type="date"
                value={date}
                max={todayKST()}
                onChange={(e) => setDate(e.target.value)}
                className="bg-transparent text-sm text-white outline-none"
              />
            </div>
            <button
              onClick={() => { if (date < todayKST()) setDate(shiftDate(date, 1)); }}
              className={`p-1.5 rounded-md transition-colors ${
                date >= todayKST()
                  ? 'text-gray-600 cursor-not-allowed'
                  : 'hover:bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setDate(todayKST())}
              className="text-xs text-blue-400 hover:text-blue-300 px-2 py-1 rounded hover:bg-blue-500/10 transition-colors"
            >
              오늘
            </button>
          </div>
        </div>
      </header>

      {/* 메인 컨텐츠 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 좌측: 장비 목록 */}
        <div className="w-72 border-r border-gray-800 flex flex-col bg-gray-950">
          {/* 필터 */}
          <div className="p-3 border-b border-gray-800 space-y-2">
            {/* 검색 */}
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
            {/* 공정 필터 */}
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

          {/* 장비 리스트 */}
          <div className="flex-1 overflow-y-auto">
            {filteredDefs.map(def => {
              const isSelected = selectedMachine === def.no;
              const hasMcno = def.mcno != null;
              return (
                <button
                  key={def.no}
                  onClick={() => handleSelectMachine(def.no)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-800/50 transition-colors ${
                    isSelected
                      ? 'bg-blue-500/10 border-l-2 border-l-blue-500'
                      : 'hover:bg-gray-900/80 border-l-2 border-l-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] text-gray-600 font-mono w-5 shrink-0">
                        {String(def.no).padStart(2, '0')}
                      </span>
                      <span className={`text-sm font-medium truncate ${isSelected ? 'text-white' : 'text-gray-300'}`}>
                        {def.name}
                      </span>
                    </div>
                    {!hasMcno && (
                      <span className="text-[9px] text-gray-600 bg-gray-800 px-1 py-0.5 rounded shrink-0">
                        미연결
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 pl-7">
                    <span className="text-[10px] text-gray-600">{def.group}</span>
                    {def.model && (
                      <span className="text-[10px] text-gray-700">{def.model}</span>
                    )}
                  </div>
                </button>
              );
            })}
            {filteredDefs.length === 0 && (
              <div className="p-6 text-center text-xs text-gray-600">
                검색 결과 없음
              </div>
            )}
          </div>

          {/* 장비 수 */}
          <div className="px-4 py-2 border-t border-gray-800 text-[10px] text-gray-600">
            전체 {allDefs.length}대 · 표시 {filteredDefs.length}대
          </div>
        </div>

        {/* 우측: 분석 결과 */}
        <div className="flex-1 overflow-y-auto">
          {selectedMachine === null ? (
            /* 미선택 안내 */
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <Activity className="w-16 h-16 mb-4 text-gray-800" />
              <p className="text-sm font-medium text-gray-400">장비를 선택하세요</p>
              <p className="text-xs text-gray-600 mt-1">
                좌측 목록에서 장비를 클릭하면 해당 날짜의 DSPM 이력을 분석합니다
              </p>
            </div>
          ) : loadingAnalysis ? (
            /* 로딩 */
            <div className="flex items-center justify-center h-full">
              <div className="flex items-center gap-3 text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">
                  {selectedDef?.name} 이력 조회 중...
                </span>
              </div>
            </div>
          ) : error ? (
            /* 에러 */
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <AlertTriangle className="w-12 h-12 mb-3 text-amber-500/50" />
              <p className="text-sm text-amber-400">{error}</p>
              {selectedDef?.mcno == null && (
                <p className="text-xs text-gray-600 mt-2">
                  장비 관리에서 DSPM 설비번호(MCNO)를 매핑해주세요
                </p>
              )}
              <button
                onClick={() => fetchAnalysis(selectedMachine, date)}
                className="mt-4 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 text-xs text-gray-300 hover:bg-gray-700 transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                재시도
              </button>
            </div>
          ) : analysis && analysis.events.length === 0 ? (
            /* 데이터 없음 */
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <Clock className="w-12 h-12 mb-3 text-gray-700" />
              <p className="text-sm">
                <span className="text-gray-300">{selectedDef?.name}</span>의 {date} 이력이 없습니다
              </p>
              <p className="text-xs text-gray-600 mt-1">
                해당 날짜에 장비 가동 기록이 DSPM에 없습니다
              </p>
            </div>
          ) : analysis ? (
            /* 분석 결과 */
            <div className="p-6 space-y-6">
              {/* 장비 헤더 */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold flex items-center gap-2">
                    <span className="text-gray-500 font-mono text-sm">
                      {String(selectedMachine).padStart(2, '0')}
                    </span>
                    {selectedDef?.name}
                  </h2>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {selectedDef?.group} · {selectedDef?.model} · MCNO {selectedDef?.mcno}
                    <span className="ml-2">· {date}</span>
                  </p>
                </div>
                <button
                  onClick={() => fetchAnalysis(selectedMachine, date)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 text-xs text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  새로고침
                </button>
              </div>

              {/* 요약 카드 */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <SummaryCard label="가동" value={formatSeconds(runSeconds)} sub={`${(analysis.states?.RUN as StateAccum)?.count || 0}회`} color="emerald" icon={Play} />
                <SummaryCard label="대기" value={formatSeconds(idleSeconds)} sub={`${(analysis.states?.IDLE as StateAccum)?.count || 0}회`} color="amber" icon={Pause} />
                <SummaryCard label="정지" value={formatSeconds(stopSeconds)} sub={`${stopRanking.reduce((a, b) => a + b.count, 0)}회`} color="rose" icon={AlertTriangle} />
                <SummaryCard label="가동률" value={`${opRate.toFixed(1)}%`} sub={`총 ${formatSeconds(totalSeconds)}`} color="blue" icon={Activity} />
              </div>

              {/* 타임라인 바 */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h3 className="text-sm font-semibold mb-4">일간 타임라인</h3>
                <TimelineBar events={analysis.events} stopCodeMap={stopCodeMap} />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {/* 상태별 내역 */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-800">
                    <h3 className="text-sm font-semibold">상태별 누적</h3>
                  </div>
                  <div className="p-5 space-y-3">
                    {/* 가동/대기/정지 바 */}
                    <div className="flex h-3 rounded-full overflow-hidden bg-gray-800">
                      {totalSeconds > 0 && (
                        <>
                          {runSeconds > 0 && <div className="bg-emerald-500" style={{ width: `${(runSeconds / totalSeconds) * 100}%` }} />}
                          {idleSeconds > 0 && <div className="bg-amber-400" style={{ width: `${(idleSeconds / totalSeconds) * 100}%` }} />}
                          {stopSeconds > 0 && <div className="bg-rose-500" style={{ width: `${(stopSeconds / totalSeconds) * 100}%` }} />}
                        </>
                      )}
                    </div>
                    <div className="flex gap-4 text-[10px] text-gray-500 mb-2">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />가동 {(runSeconds / Math.max(totalSeconds, 1) * 100).toFixed(1)}%</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" />대기 {(idleSeconds / Math.max(totalSeconds, 1) * 100).toFixed(1)}%</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" />정지 {(stopSeconds / Math.max(totalSeconds, 1) * 100).toFixed(1)}%</span>
                    </div>

                    {/* 각 상태 상세 */}
                    {Object.entries(analysis.states)
                      .sort(([, a], [, b]) => (b as StateAccum).totalSeconds - (a as StateAccum).totalSeconds)
                      .map(([key, accum]) => {
                        const a = accum as StateAccum;
                        const pct = totalSeconds > 0 ? (a.totalSeconds / totalSeconds * 100) : 0;
                        const label = STATE_LABELS[key] || stopCodeMap[key] || key;
                        return (
                          <div key={key} className="flex items-center gap-3">
                            <span className={`text-[10px] font-mono w-8 text-center px-1 py-0.5 rounded ${getStateColor(key).bg} ${getStateColor(key).text}`}>
                              {key}
                            </span>
                            <div className="flex-1">
                              <div className="flex justify-between text-[11px] mb-0.5">
                                <span className="text-gray-300">{label}</span>
                                <span className="text-gray-500">{formatSeconds(a.totalSeconds)} · {a.count}회 · {pct.toFixed(1)}%</span>
                              </div>
                              <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
                                <div className={`h-full rounded-full ${getStateColor(key).bar}`} style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* 정지코드 분석 */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-800">
                    <h3 className="text-sm font-semibold">정지코드 분석</h3>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      총 정지 {formatSeconds(stopSeconds)}
                    </p>
                  </div>
                  <div className="p-5">
                    {stopRanking.length === 0 ? (
                      <p className="text-xs text-gray-600 text-center py-4">정지 기록 없음</p>
                    ) : (
                      <div className="space-y-3">
                        {stopRanking.map((item, i) => (
                          <div key={item.code}>
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-gray-600 font-mono w-4">{i + 1}</span>
                                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${getStateColor(item.code).bg} ${getStateColor(item.code).text}`}>
                                  {item.code}
                                </span>
                                <span className="text-xs text-gray-300">{item.name}</span>
                              </div>
                              <div className="text-right">
                                <span className="text-xs text-gray-400">{formatSeconds(item.seconds)}</span>
                                <span className="text-[10px] text-gray-600 ml-2">{item.count}회</span>
                              </div>
                            </div>
                            <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden ml-6">
                              <div
                                className={`h-full rounded-full transition-all ${getStateColor(item.code).bar}`}
                                style={{ width: `${item.pct}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 상태 변경 이력 */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-gray-500" />
                      상태 변경 이력
                    </h3>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      {analysis.events.length}건 · 최신순
                    </p>
                  </div>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  <table className="w-full text-[11px]">
                    <thead className="text-gray-500 bg-gray-900 sticky top-0">
                      <tr className="border-b border-gray-800">
                        <th className="text-left px-5 py-2 font-medium">상태</th>
                        <th className="text-left px-3 py-2 font-medium">시작</th>
                        <th className="text-left px-3 py-2 font-medium">종료</th>
                        <th className="text-right px-5 py-2 font-medium">소요시간</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.events.slice().reverse().map((evt, i) => {
                        const label = STATE_LABELS[evt.state] || stopCodeMap[evt.state] || evt.state;
                        return (
                          <tr key={i} className="border-b border-gray-800/30 hover:bg-gray-800/20">
                            <td className="px-5 py-2">
                              <span className={`font-mono px-1.5 py-0.5 rounded ${getStateColor(evt.state).bg} ${getStateColor(evt.state).text}`}>
                                {evt.state}
                              </span>
                              <span className="text-gray-400 ml-2">{label}</span>
                            </td>
                            <td className="px-3 py-2 font-mono text-gray-400">{evt.startTime}</td>
                            <td className="px-3 py-2 font-mono text-gray-400">{evt.endTime}</td>
                            <td className="px-5 py-2 text-right text-gray-300">{formatSeconds(evt.durationSeconds)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}
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

/* ── 타임라인 바 ── */
function TimelineBar({ events, stopCodeMap }: { events: DspmEvent[]; stopCodeMap: Record<string, string> }) {
  if (events.length === 0) return <p className="text-xs text-gray-600 text-center">이벤트 없음</p>;

  // 24시간(86400초) 기준 타임라인
  const DAY_SECONDS = 86400;

  function timeToSeconds(time: string): number {
    const [h, m, s] = time.split(':').map(Number);
    return h * 3600 + m * 60 + (s || 0);
  }

  // 시간 눈금
  const hourMarks = [0, 3, 6, 9, 12, 15, 18, 21, 24];

  return (
    <div>
      {/* 타임라인 바 */}
      <div className="relative h-8 bg-gray-800 rounded-lg overflow-hidden">
        {events.map((evt, i) => {
          const startSec = timeToSeconds(evt.startTime);
          const endSec = timeToSeconds(evt.endTime);
          const duration = endSec > startSec ? endSec - startSec : evt.durationSeconds;
          const left = (startSec / DAY_SECONDS) * 100;
          const width = Math.max((duration / DAY_SECONDS) * 100, 0.2); // 최소 표시
          const color = getStateColor(evt.state).solid;
          const label = evt.state === 'RUN' ? '가동' : evt.state === 'IDLE' ? '대기' : (stopCodeMap[evt.state] || evt.state);
          return (
            <div
              key={i}
              className="absolute top-0 h-full transition-opacity hover:opacity-80"
              style={{ left: `${left}%`, width: `${width}%`, backgroundColor: color }}
              title={`${label}: ${evt.startTime}→${evt.endTime} (${formatSeconds(evt.durationSeconds)})`}
            />
          );
        })}
      </div>
      {/* 시간 눈금 */}
      <div className="relative h-5 mt-1">
        {hourMarks.map(h => (
          <div
            key={h}
            className="absolute text-[9px] text-gray-600 font-mono -translate-x-1/2"
            style={{ left: `${(h / 24) * 100}%` }}
          >
            {h === 24 ? '' : `${String(h).padStart(2, '0')}:00`}
          </div>
        ))}
      </div>
    </div>
  );
}
