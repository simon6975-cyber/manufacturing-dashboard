// src/app/summary/equipment/page.tsx
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Factory, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { subscribeDailyProduction, todayKST, DailyProductionEntry } from '@/lib/production-daily';
import { useMachineDefs } from '@/lib/machine-defs';
import { getCountUnit } from '@/lib/count-unit';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

export default function EquipmentSummaryPage() {
  const [date, setDate] = useState(todayKST());
  const [entries, setEntries] = useState<DailyProductionEntry[]>([]);
  const { defs: machineDefs, allDefs } = useMachineDefs();

  // DSPM 실시간 (오늘인 경우만)
  const [dspmByMcno, setDspmByMcno] = useState<Record<number, number>>({});
  const isToday = date === todayKST();

  useEffect(() => {
    if (!isToday) { setDspmByMcno({}); return; }
    const unsub = onSnapshot(doc(db, 'dspm_live', 'snapshot'), (snap) => {
      if (!snap.exists()) return;
      const rawList = Array.isArray(snap.data().data) ? snap.data().data : [];
      const map: Record<number, number> = {};
      rawList.forEach((s: Record<string, unknown>) => {
        const mcno = typeof s.MCNO === 'string' ? parseInt(s.MCNO, 10) : Number(s.MCNO) || 0;
        if (mcno > 0) {
          map[mcno] = typeof s.DAYCOMCNT === 'number' ? s.DAYCOMCNT : typeof s.DAYCOMCNT === 'string' ? parseInt(s.DAYCOMCNT, 10) || 0 : 0;
        }
      });
      setDspmByMcno(map);
    });
    return unsub;
  }, [isToday]);

  // Firestore 저장된 데이터 구독
  useEffect(() => {
    const unsub = subscribeDailyProduction(date, setEntries);
    return unsub;
  }, [date]);

  // 장비별 데이터 통합
  const tableData = useMemo(() => {
    const entryMap = new Map<number, DailyProductionEntry>();
    entries.forEach(e => entryMap.set(e.machineNo, e));

    return allDefs.map(def => {
      const saved = entryMap.get(def.no);
      const eqGroup = def.equipmentGroup || def.name.replace(/\s*\d+호기$/, '').replace(/\s+/g, '');

      // 오늘이면 DSPM 실시간 값 우선, 아니면 저장된 값
      let count = saved?.dayCompletedCount ?? 0;
      if (isToday && def.mcno != null && dspmByMcno[def.mcno] != null) {
        count = dspmByMcno[def.mcno];
      }

      return {
        no: def.no,
        name: def.name,
        group: def.group,
        equipmentGroup: eqGroup,
        unit: getCountUnit(eqGroup),
        dayCompletedCount: count,
      };
    });
  }, [allDefs, entries, isToday, dspmByMcno, machineDefs]);

  // 그룹별 소계
  const groupTotals = useMemo(() => {
    const map: Record<string, { count: number; unit: string }> = {};
    tableData.forEach(r => {
      if (!map[r.group]) map[r.group] = { count: 0, unit: r.unit };
      map[r.group].count += r.dayCompletedCount;
    });
    return map;
  }, [tableData]);

  const totalCount = tableData.reduce((sum, r) => sum + r.dayCompletedCount, 0);

  const changeDate = (delta: number) => {
    const d = new Date(date + 'T00:00:00+09:00');
    d.setDate(d.getDate() + delta);
    setDate(d.toISOString().slice(0, 10));
  };

  const dayLabel = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00+09:00');
    return ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  };

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center">
            <Factory className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-100">장비별 생산현황</h1>
            <p className="text-xs text-gray-500 mt-0.5">일별 장비별 완료건수 집계</p>
          </div>
        </div>
        {/* 날짜 네비게이션 */}
        <div className="flex items-center gap-2">
          <button onClick={() => changeDate(-1)} className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 border border-gray-700 min-w-[180px] justify-center">
            <Calendar className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-200">{date}</span>
            <span className="text-xs text-gray-500">({dayLabel(date)})</span>
            {isToday && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">TODAY</span>}
          </div>
          <button onClick={() => changeDate(1)} disabled={isToday} className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
            <ChevronRight className="w-4 h-4" />
          </button>
          {!isToday && (
            <button onClick={() => setDate(todayKST())} className="px-3 py-2 rounded-lg bg-blue-500/20 text-blue-300 text-xs font-medium border border-blue-500/30 hover:bg-blue-500/30 transition-colors">
              오늘
            </button>
          )}
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-[11px] text-gray-500 mb-1">전체 합계</p>
          <p className="text-2xl font-bold text-white">{totalCount.toLocaleString()}</p>
        </div>
        {['내지', '표지', '제본', '포장'].map(g => (
          <div key={g} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-[11px] text-gray-500 mb-1">{g}</p>
            <p className="text-2xl font-bold text-white">{(groupTotals[g]?.count ?? 0).toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* 테이블 */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left text-[11px] text-gray-500 font-medium px-4 py-3 w-16">NO</th>
              <th className="text-left text-[11px] text-gray-500 font-medium px-4 py-3">장비명</th>
              <th className="text-left text-[11px] text-gray-500 font-medium px-4 py-3 w-20">공정</th>
              <th className="text-left text-[11px] text-gray-500 font-medium px-4 py-3 w-28">장비군</th>
              <th className="text-right text-[11px] text-gray-500 font-medium px-4 py-3 w-40">금일 완료건수</th>
              <th className="text-center text-[11px] text-gray-500 font-medium px-4 py-3 w-16">단위</th>
            </tr>
          </thead>
          <tbody>
            {tableData.map((row, idx) => (
              <tr key={row.no} className={`border-b border-gray-800/50 ${idx % 2 === 0 ? 'bg-gray-900' : 'bg-gray-950/50'} hover:bg-gray-800/40 transition-colors`}>
                <td className="px-4 py-3 text-xs text-gray-500 font-mono">{row.no}</td>
                <td className="px-4 py-3 text-sm text-gray-200 font-medium">{row.name}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded border ${
                    row.group === '내지' ? 'bg-sky-500/10 text-sky-300 border-sky-500/30' :
                    row.group === '표지' ? 'bg-pink-500/10 text-pink-300 border-pink-500/30' :
                    row.group === '제본' ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' :
                    'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
                  }`}>{row.group}</span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-400">{row.equipmentGroup}</td>
                <td className="px-4 py-3 text-right">
                  <span className={`text-lg font-bold tabular-nums ${row.dayCompletedCount > 0 ? 'text-white' : 'text-gray-600'}`}>
                    {row.dayCompletedCount > 0 ? row.dayCompletedCount.toLocaleString() : '-'}
                  </span>
                </td>
                <td className="px-4 py-3 text-center text-xs text-gray-500">{row.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
