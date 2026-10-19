// src/app/summary/period/page.tsx
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { CalendarDays, Search, BarChart3 } from 'lucide-react';
import { getDailyProduction, todayKST, DailyProductionEntry } from '@/lib/production-daily';
import { useMachineDefs } from '@/lib/machine-defs';
import { getCountUnit } from '@/lib/count-unit';

type ViewMode = 'daily' | 'weekly' | 'monthly';

// 날짜 범위 생성 유틸
function getDateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const cur = new Date(start + 'T00:00:00+09:00');
  const endD = new Date(end + 'T00:00:00+09:00');
  while (cur <= endD) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

// 이번 주 월~일 범위
function thisWeekRange(): [string, string] {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const day = kst.getUTCDay(); // 0=sun
  const mon = new Date(kst);
  mon.setUTCDate(kst.getUTCDate() - (day === 0 ? 6 : day - 1));
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  return [mon.toISOString().slice(0, 10), sun.toISOString().slice(0, 10)];
}

// 이번 달 범위
function thisMonthRange(): [string, string] {
  const today = todayKST();
  const start = today.slice(0, 8) + '01';
  return [start, today];
}

export default function PeriodSummaryPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('daily');
  const [startDate, setStartDate] = useState(() => {
    // 기본: 최근 7일
    const d = new Date();
    d.setDate(d.getDate() - 6);
    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(todayKST());
  const [allEntries, setAllEntries] = useState<DailyProductionEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const { allDefs } = useMachineDefs();

  // 프리셋 적용
  const applyPreset = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    if (mode === 'daily') {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
      setStartDate(kst.toISOString().slice(0, 10));
      setEndDate(todayKST());
    } else if (mode === 'weekly') {
      const [s, e] = thisWeekRange();
      setStartDate(s);
      setEndDate(e);
    } else {
      const [s, e] = thisMonthRange();
      setStartDate(s);
      setEndDate(e);
    }
  }, []);

  // 데이터 로드
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const dates = getDateRange(startDate, endDate);
      const results: DailyProductionEntry[] = [];
      // 병렬 로드 (최대 31일)
      const batches = await Promise.all(dates.map(d => getDailyProduction(d)));
      batches.forEach(b => results.push(...b));
      setAllEntries(results);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => { loadData(); }, [loadData]);

  // 날짜 목록
  const dateList = useMemo(() => getDateRange(startDate, endDate), [startDate, endDate]);

  // 날짜 × 장비 피벗 테이블
  const pivotData = useMemo(() => {
    // { [date]: { [machineNo]: count } }
    const map: Record<string, Record<number, number>> = {};
    dateList.forEach(d => { map[d] = {}; });
    allEntries.forEach(e => {
      if (!map[e.date]) map[e.date] = {};
      map[e.date][e.machineNo] = e.dayCompletedCount;
    });
    return map;
  }, [allEntries, dateList]);

  // 장비별 합계
  const machineTotals = useMemo(() => {
    const totals: Record<number, number> = {};
    allDefs.forEach(d => { totals[d.no] = 0; });
    allEntries.forEach(e => { totals[e.machineNo] = (totals[e.machineNo] || 0) + e.dayCompletedCount; });
    return totals;
  }, [allEntries, allDefs]);

  // 날짜별 합계
  const dateTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    dateList.forEach(d => { totals[d] = 0; });
    allEntries.forEach(e => { totals[e.date] = (totals[e.date] || 0) + e.dayCompletedCount; });
    return totals;
  }, [allEntries, dateList]);

  const dayLabel = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00+09:00');
    return ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  };

  const grandTotal = allEntries.reduce((s, e) => s + e.dayCompletedCount, 0);

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/30 flex items-center justify-center">
            <CalendarDays className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-100">기간별 생산현황</h1>
            <p className="text-xs text-gray-500 mt-0.5">기간별 장비 완료건수 피벗 집계</p>
          </div>
        </div>
      </div>

      {/* 컨트롤 바 */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        {/* 보기 모드 */}
        <div className="flex rounded-lg overflow-hidden border border-gray-700">
          {(['daily', 'weekly', 'monthly'] as ViewMode[]).map(m => (
            <button key={m} onClick={() => applyPreset(m)}
              className={`px-3 py-2 text-xs font-medium transition-colors ${viewMode === m ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
              {m === 'daily' ? '최근 7일' : m === 'weekly' ? '이번 주' : '이번 달'}
            </button>
          ))}
        </div>

        {/* 커스텀 날짜 */}
        <div className="flex items-center gap-2">
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm text-gray-200 focus:outline-none focus:border-blue-500" />
          <span className="text-gray-500 text-sm">~</span>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
            className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm text-gray-200 focus:outline-none focus:border-blue-500" />
          <button onClick={loadData} className="px-3 py-2 rounded-lg bg-blue-500/20 text-blue-300 text-xs font-medium border border-blue-500/30 hover:bg-blue-500/30 transition-colors flex items-center gap-1">
            <Search className="w-3 h-3" /> 조회
          </button>
        </div>

        {loading && <span className="text-xs text-gray-500 animate-pulse">로딩중...</span>}
      </div>

      {/* 요약 */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-[11px] text-gray-500 mb-1">조회기간</p>
          <p className="text-lg font-bold text-white">{dateList.length}일</p>
          <p className="text-[10px] text-gray-600 mt-1">{startDate} ~ {endDate}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-[11px] text-gray-500 mb-1">총 완료건수</p>
          <p className="text-2xl font-bold text-white">{grandTotal.toLocaleString()}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-[11px] text-gray-500 mb-1">일 평균</p>
          <p className="text-2xl font-bold text-white">{dateList.length > 0 ? Math.round(grandTotal / dateList.length).toLocaleString() : '0'}</p>
        </div>
      </div>

      {/* 피벗 테이블 */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-max">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left text-[11px] text-gray-500 font-medium px-3 py-3 sticky left-0 bg-gray-900 z-10 w-10">NO</th>
                <th className="text-left text-[11px] text-gray-500 font-medium px-3 py-3 sticky left-10 bg-gray-900 z-10 min-w-[120px]">장비명</th>
                <th className="text-center text-[11px] text-gray-500 font-medium px-3 py-3 w-14">단위</th>
                {dateList.map(d => (
                  <th key={d} className="text-right text-[10px] text-gray-500 font-medium px-3 py-3 min-w-[80px]">
                    <div>{d.slice(5)}</div>
                    <div className="text-gray-600">({dayLabel(d)})</div>
                  </th>
                ))}
                <th className="text-right text-[11px] text-gray-400 font-bold px-3 py-3 min-w-[90px] bg-gray-800/50">합계</th>
              </tr>
            </thead>
            <tbody>
              {allDefs.map((def, idx) => {
                const eqGroup = def.equipmentGroup || def.name.replace(/\s*\d+호기$/, '').replace(/\s+/g, '');
                const unit = getCountUnit(eqGroup);
                const total = machineTotals[def.no] || 0;
                return (
                  <tr key={def.no} className={`border-b border-gray-800/50 ${idx % 2 === 0 ? 'bg-gray-900' : 'bg-gray-950/50'} hover:bg-gray-800/40 transition-colors`}>
                    <td className="px-3 py-2.5 text-xs text-gray-500 font-mono sticky left-0 bg-inherit z-10">{def.no}</td>
                    <td className="px-3 py-2.5 text-sm text-gray-200 font-medium sticky left-10 bg-inherit z-10">{def.name}</td>
                    <td className="px-3 py-2.5 text-center text-[10px] text-gray-500">{unit}</td>
                    {dateList.map(d => {
                      const val = pivotData[d]?.[def.no] || 0;
                      return (
                        <td key={d} className="px-3 py-2.5 text-right">
                          <span className={`text-sm tabular-nums ${val > 0 ? 'text-gray-200' : 'text-gray-700'}`}>
                            {val > 0 ? val.toLocaleString() : '-'}
                          </span>
                        </td>
                      );
                    })}
                    <td className="px-3 py-2.5 text-right bg-gray-800/50">
                      <span className={`text-sm font-bold tabular-nums ${total > 0 ? 'text-white' : 'text-gray-600'}`}>
                        {total > 0 ? total.toLocaleString() : '-'}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {/* 날짜별 합계 행 */}
              <tr className="border-t-2 border-gray-700 bg-gray-800/50">
                <td className="px-3 py-3 sticky left-0 bg-gray-800/50 z-10"></td>
                <td className="px-3 py-3 text-sm font-bold text-gray-300 sticky left-10 bg-gray-800/50 z-10">합계</td>
                <td className="px-3 py-3"></td>
                {dateList.map(d => (
                  <td key={d} className="px-3 py-3 text-right">
                    <span className="text-sm font-bold tabular-nums text-white">{(dateTotals[d] || 0).toLocaleString()}</span>
                  </td>
                ))}
                <td className="px-3 py-3 text-right">
                  <span className="text-lg font-bold tabular-nums text-blue-300">{grandTotal.toLocaleString()}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
