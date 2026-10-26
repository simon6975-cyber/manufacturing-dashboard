// src/app/analysis/page.tsx
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Activity, Calendar, ChevronLeft, ChevronRight,
  Clock, Play, Square, AlertTriangle, Pause,
} from 'lucide-react';
import { useMachineDefs } from '@/lib/machine-defs';
import { useStopCodes } from '@/lib/useStopCodes';
import type { MachineStatusDaily, StateAccum } from '@/lib/status-accumulation';

/* ── KST 기준 오늘 날짜 ── */
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
  const s = sec % 60;
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

/* ── 상태 색상 ── */
const STATE_COLORS: Record<string, { bg: string; text: string; bar: string }> = {
  RUN:  { bg: 'bg-emerald-500/15', text: 'text-emerald-400', bar: 'bg-emerald-500' },
  IDLE: { bg: 'bg-amber-500/15',   text: 'text-amber-400',   bar: 'bg-amber-400' },
  S1:   { bg: 'bg-rose-500/15',    text: 'text-rose-400',    bar: 'bg-rose-500' },
  S2:   { bg: 'bg-rose-500/15',    text: 'text-rose-400',    bar: 'bg-rose-400' },
  S3:   { bg: 'bg-orange-500/15',  text: 'text-orange-400',  bar: 'bg-orange-400' },
  S4:   { bg: 'bg-purple-500/15',  text: 'text-purple-400',  bar: 'bg-purple-400' },
  S5:   { bg: 'bg-blue-500/15',    text: 'text-blue-400',    bar: 'bg-blue-400' },
  S6:   { bg: 'bg-red-500/15',     text: 'text-red-400',     bar: 'bg-red-500' },
  S7:   { bg: 'bg-pink-500/15',    text: 'text-pink-400',    bar: 'bg-pink-400' },
  S8:   { bg: 'bg-slate-500/15',   text: 'text-slate-400',   bar: 'bg-slate-400' },
  S9:   { bg: 'bg-gray-500/15',    text: 'text-gray-400',    bar: 'bg-gray-500' },
};

const STATE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  RUN: Play, IDLE: Pause, STOP: AlertTriangle,
};

function getStateColor(state: string) {
  return STATE_COLORS[state] || STATE_COLORS.S9;
}

export default function AnalysisPage() {
  const [date, setDate] = useState(todayKST());
  const [entries, setEntries] = useState<MachineStatusDaily[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState<number | null>(null);
  const { defs: machineDefs, allDefs } = useMachineDefs();
  const { codes: stopCodes, codeMap: stopCodeMap } = useStopCodes();

  // 데이터 소스 (DSPM 로그 우선, 실패 시 Firestore fallback)
  const [dataSource, setDataSource] = useState<'dspm' | 'firestore' | ''>('');

  // 데이터 로드 — 두 소스를 병렬로 가져와 병합 (DSPM 로그 우선)
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 양쪽 소스 병렬 요청
      const [dspmResult, firestoreResult] = await Promise.allSettled([
        fetch(`/api/dspm-log-daily?date=${date}`).then(r => r.json()),
        fetch(`/api/status-daily?date=${date}`).then(r => r.json()),
      ]);

      const dspmEntries: MachineStatusDaily[] =
        dspmResult.status === 'fulfilled' && dspmResult.value?.ok && Array.isArray(dspmResult.value.entries)
          ? dspmResult.value.entries : [];
      const fsEntries: MachineStatusDaily[] =
        firestoreResult.status === 'fulfilled' && firestoreResult.value?.ok && Array.isArray(firestoreResult.value.entries)
          ? firestoreResult.value.entries : [];

      // 병합: 장비번호 기준, DSPM 데이터 우선 (이벤트가 더 정확)
      const merged = new Map<number, MachineStatusDaily>();

      // Firestore 먼저 (베이스)
      for (const e of fsEntries) {
        merged.set(e.machineNo, e);
      }
      // DSPM 로그가 있으면 덮어쓰기 (더 정확한 소스)
      for (const e of dspmEntries) {
        merged.set(e.machineNo, e);
      }

      const mergedArray = Array.from(merged.values());
      setEntries(mergedArray);

      // 데이터 소스 표시
      if (dspmEntries.length > 0 && fsEntries.length > 0) {
        setDataSource('dspm'); // 병합됨 (DSPM 우선)
      } else if (dspmEntries.length > 0) {
        setDataSource('dspm');
      } else if (fsEntries.length > 0) {
        setDataSource('firestore');
      } else {
        setDataSource('');
      }
    } catch {
      setEntries([]);
      setDataSource('');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { loadData(); }, [loadData]);

  // 전체 요약 계산
  const summary = useMemo(() => {
    let totalRun = 0, totalIdle = 0, totalStop = 0;
    let runCount = 0, idleCount = 0, stopCount = 0;
    const stopCodeBreakdown: Record<string, { seconds: number; count: number }> = {};

    entries.forEach(e => {
      const states = e.states || {};
      Object.entries(states).forEach(([key, accum]) => {
        const a = accum as StateAccum;
        if (key === 'RUN') {
          totalRun += a.totalSeconds;
          runCount += a.count;
        } else if (key === 'IDLE') {
          totalIdle += a.totalSeconds;
          idleCount += a.count;
        } else {
          // S1~S9 (정지코드)
          totalStop += a.totalSeconds;
          stopCount += a.count;
          if (!stopCodeBreakdown[key]) {
            stopCodeBreakdown[key] = { seconds: 0, count: 0 };
          }
          stopCodeBreakdown[key].seconds += a.totalSeconds;
          stopCodeBreakdown[key].count += a.count;
        }
      });
    });

    const totalTime = totalRun + totalIdle + totalStop;
    const operatingRate = totalTime > 0 ? (totalRun / totalTime * 100) : 0;

    // 정지코드 순위
    const stopCodeRanking = Object.entries(stopCodeBreakdown)
      .map(([code, data]) => ({
        code,
        name: stopCodeMap[code] || code,
        seconds: data.seconds,
        count: data.count,
        percentage: totalStop > 0 ? (data.seconds / totalStop * 100) : 0,
      }))
      .sort((a, b) => b.seconds - a.seconds);

    return {
      totalRun, totalIdle, totalStop, totalTime,
      runCount, idleCount, stopCount,
      operatingRate,
      stopCodeRanking,
      machineCount: entries.length,
      totalMachineCount: allDefs.length,
    };
  }, [entries, stopCodeMap, allDefs]);

  // 장비별 데이터
  const machineData = useMemo(() => {
    return allDefs.map(def => {
      const entry = entries.find(e => e.machineNo === def.no);
      const states = entry?.states || {};
      const run = (states.RUN as StateAccum)?.totalSeconds || 0;
      const idle = (states.IDLE as StateAccum)?.totalSeconds || 0;
      let stop = 0;
      Object.entries(states).forEach(([key, accum]) => {
        if (key !== 'RUN' && key !== 'IDLE') {
          stop += (accum as StateAccum).totalSeconds;
        }
      });
      const total = run + idle + stop;
      const opRate = total > 0 ? (run / total * 100) : 0;
      return { def, entry, run, idle, stop, total, opRate, states };
    }).sort((a, b) => {
      // 데이터 있는 장비 우선, 그 안에서 가동률 순
      if (a.total > 0 && b.total === 0) return -1;
      if (a.total === 0 && b.total > 0) return 1;
      if (a.total === 0 && b.total === 0) return a.def.no - b.def.no;
      return b.total - a.total;
    });
  }, [allDefs, entries]);

  // 선택한 장비의 상세 정보
  const selectedDetail = useMemo(() => {
    if (selectedMachine === null) return null;
    return machineData.find(d => d.def.no === selectedMachine) || null;
  }, [selectedMachine, machineData]);

  const selectedEvents = useMemo(() => {
    if (selectedMachine === null) return [];
    const entry = entries.find(e => e.machineNo === selectedMachine);
    return entry?.events || [];
  }, [selectedMachine, entries]);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
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
                장비별 가동·정지 상태 누적 분석
                {dataSource && (
                  <span className={`ml-2 px-1.5 py-0.5 rounded text-[9px] font-mono ${
                    dataSource === 'dspm'
                      ? 'bg-blue-500/15 text-blue-400'
                      : 'bg-gray-700 text-gray-400'
                  }`}>
                    {dataSource === 'dspm' ? 'DSPM LOG' : 'FIRESTORE'}
                  </span>
                )}
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

      <div className="p-6 space-y-6">
        {loading ? (
          <div className="flex items-center justify-center h-64 text-gray-500">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-gray-600 border-t-blue-500 rounded-full animate-spin" />
              <span className="text-sm">데이터 로딩 중...</span>
            </div>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <Activity className="w-12 h-12 mb-3 text-gray-700" />
            <p className="text-sm">해당 날짜의 상태 누적 데이터가 없습니다</p>
            <p className="text-xs text-gray-600 mt-1">
              대시보드가 열려있는 동안 장비 상태 변경이 자동으로 기록됩니다
            </p>
          </div>
        ) : (
          <>
            {/* 요약 카드 */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <SummaryCard
                label="가동 시간"
                value={formatSeconds(summary.totalRun)}
                sub={`${summary.runCount}회`}
                color="emerald"
                icon={Play}
              />
              <SummaryCard
                label="대기 시간"
                value={formatSeconds(summary.totalIdle)}
                sub={`${summary.idleCount}회`}
                color="amber"
                icon={Pause}
              />
              <SummaryCard
                label="정지 시간"
                value={formatSeconds(summary.totalStop)}
                sub={`${summary.stopCount}회`}
                color="rose"
                icon={AlertTriangle}
              />
              <SummaryCard
                label="가동률"
                value={`${summary.operatingRate.toFixed(1)}%`}
                sub={`${summary.machineCount}/${summary.totalMachineCount}대 장비`}
                color="blue"
                icon={Activity}
              />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              {/* 장비별 가동 현황 */}
              <div className="xl:col-span-2">
                <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-800">
                    <h2 className="text-sm font-semibold">장비별 가동 현황</h2>
                    <p className="text-[11px] text-gray-500 mt-0.5">클릭하여 상세 분석</p>
                  </div>
                  <div className="divide-y divide-gray-800/50">
                    {machineData.map(({ def, run, idle, stop, total, opRate }) => (
                      <button
                        key={def.no}
                        onClick={() => setSelectedMachine(selectedMachine === def.no ? null : def.no)}
                        className={`w-full text-left px-5 py-3 hover:bg-gray-800/40 transition-colors ${
                          selectedMachine === def.no ? 'bg-blue-500/5 border-l-2 border-l-blue-500' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-600 font-mono w-5">
                              {String(def.no).padStart(2, '0')}
                            </span>
                            <span className="text-sm font-medium">{def.name}</span>
                            <span className="text-[10px] text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded">
                              {def.group}
                            </span>
                          </div>
                          <span className={`text-xs font-mono ${
                            total === 0 ? 'text-gray-600' : opRate >= 70 ? 'text-emerald-400' : opRate >= 40 ? 'text-amber-400' : 'text-rose-400'
                          }`}>
                            {total === 0 ? '대기중' : `${opRate.toFixed(1)}%`}
                          </span>
                        </div>
                        {/* 가동 바 */}
                        <div className="flex h-2 rounded-full overflow-hidden bg-gray-800">
                          {total > 0 && (
                            <>
                              {run > 0 && (
                                <div
                                  className="bg-emerald-500 transition-all"
                                  style={{ width: `${(run / total) * 100}%` }}
                                  title={`가동: ${formatSeconds(run)}`}
                                />
                              )}
                              {idle > 0 && (
                                <div
                                  className="bg-amber-400 transition-all"
                                  style={{ width: `${(idle / total) * 100}%` }}
                                  title={`대기: ${formatSeconds(idle)}`}
                                />
                              )}
                              {stop > 0 && (
                                <div
                                  className="bg-rose-500 transition-all"
                                  style={{ width: `${(stop / total) * 100}%` }}
                                  title={`정지: ${formatSeconds(stop)}`}
                                />
                              )}
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-1.5 text-[10px] text-gray-500">
                          <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            가동 {formatSecondsShort(run)}
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                            대기 {formatSecondsShort(idle)}
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                            정지 {formatSecondsShort(stop)}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 우측 패널: 정지코드 분석 + 장비 상세 */}
              <div className="space-y-6">
                {/* 정지코드 분포 */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-800">
                    <h2 className="text-sm font-semibold">정지코드 분포</h2>
                    <p className="text-[11px] text-gray-500 mt-0.5">전체 장비 합산</p>
                  </div>
                  <div className="p-5 space-y-3">
                    {summary.stopCodeRanking.length === 0 ? (
                      <p className="text-xs text-gray-600 text-center py-4">정지 기록 없음</p>
                    ) : (
                      summary.stopCodeRanking.map(item => (
                        <div key={item.code}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
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
                          <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${getStateColor(item.code).bar}`}
                              style={{ width: `${item.percentage}%` }}
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* 선택 장비 상세 */}
                {selectedDetail && (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-800">
                      <h2 className="text-sm font-semibold">{selectedDetail.def.name}</h2>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {selectedDetail.def.group} · {selectedDetail.def.model}
                      </p>
                    </div>
                    <div className="p-5 space-y-4">
                      {/* 상태별 내역 */}
                      <div className="space-y-2">
                        {Object.entries(selectedDetail.states)
                          .sort(([, a], [, b]) => (b as StateAccum).totalSeconds - (a as StateAccum).totalSeconds)
                          .map(([key, accum]) => {
                            const a = accum as StateAccum;
                            const pct = selectedDetail.total > 0 ? (a.totalSeconds / selectedDetail.total * 100) : 0;
                            const label = key === 'RUN' ? '가동' : key === 'IDLE' ? '대기' : (stopCodeMap[key] || key);
                            return (
                              <div key={key} className="flex items-center gap-3">
                                <span className={`text-[10px] font-mono w-6 text-center px-1 py-0.5 rounded ${getStateColor(key).bg} ${getStateColor(key).text}`}>
                                  {key}
                                </span>
                                <div className="flex-1">
                                  <div className="flex justify-between text-[11px] mb-0.5">
                                    <span className="text-gray-300">{label}</span>
                                    <span className="text-gray-500">{formatSeconds(a.totalSeconds)} · {a.count}회</span>
                                  </div>
                                  <div className="h-1 rounded-full bg-gray-800 overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${getStateColor(key).bar}`}
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                      </div>

                      {/* 이벤트 로그 */}
                      {selectedEvents.length > 0 && (
                        <div>
                          <h3 className="text-[11px] text-gray-500 font-medium mb-2 flex items-center gap-1.5">
                            <Clock className="w-3 h-3" />
                            상태 변경 이력
                          </h3>
                          <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                            {selectedEvents.slice().reverse().map((evt, i) => (
                              <div key={i} className="flex items-center gap-2 text-[11px]">
                                <span className={`font-mono w-6 text-center px-1 py-0.5 rounded ${getStateColor(evt.state).bg} ${getStateColor(evt.state).text}`}>
                                  {evt.state}
                                </span>
                                <span className="text-gray-500 font-mono">
                                  {evt.startTime}→{evt.endTime}
                                </span>
                                <span className="text-gray-400">
                                  {formatSeconds(evt.durationSeconds)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── 요약 카드 컴포넌트 ── */
function SummaryCard({
  label, value, sub, color, icon: Icon,
}: {
  label: string;
  value: string;
  sub: string;
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
      <div className="flex items-center gap-2 mb-3">
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
