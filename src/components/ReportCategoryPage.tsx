// src/components/ReportCategoryPage.tsx
// 리포트 공통 화면 — 기간 선택 + 분류별 [구분·수량 표 | 비율 도넛]
// 수치는 loadData(기간) 를 넘기면 채워진다. 아직 연결 전이면 '-' 와 빈 도넛을 보여준다
'use client';

import React, { useState } from 'react';
import { FileBarChart, Hammer, Search, Loader2 } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import DateRangeBar from '@/components/DateRangeBar';
import { presetRange, daysBetween } from '@/lib/date-range';

export interface ReportGroup { label?: string; items: string[] }
export interface ReportTab { key: string; label: string; groups: ReportGroup[] }
/** 기간 → { 구분명: 수량 } (그룹이 여럿이면 '그룹명/구분명' 키) */
export type ReportLoader = (start: string, end: string) => Promise<Record<string, number>>;

const SERIES = Array.from({ length: 8 }, (_, i) => `var(--series-${i + 1})`);
// 범주색은 항목 순서대로 고정 — 9번째(제품별 '기타')부터는 회색
const colorOf = (i: number) => (i < SERIES.length ? SERIES[i] : 'var(--series-other)');

function GroupCard({ group, quantities, loaded }: { group: ReportGroup; quantities: Record<string, number> | null; loaded: boolean }) {
  const key = (item: string) => (group.label ? `${group.label}/${item}` : item);
  const rows = group.items.map((item, i) => ({ item, qty: quantities?.[key(item)] ?? 0, color: colorOf(i) }));
  const total = rows.reduce((s, r) => s + r.qty, 0);
  const pieData = rows.filter(r => r.qty > 0);

  return (
    <div className="bg-gray-900/60 border border-gray-800 rounded-lg overflow-hidden">
      {group.label && <h2 className="px-4 py-2.5 text-sm font-bold text-gray-200 border-b border-gray-800">{group.label}</h2>}
      <div className="grid md:grid-cols-[minmax(0,1fr)_260px]">
        <table className="w-full text-sm self-start">
          <thead>
            <tr className="text-[11px] text-gray-500 border-b border-gray-800">
              <th className="text-left font-medium px-4 py-2">구분</th>
              <th className="text-right font-medium px-4 py-2">수량</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.item} className="border-b border-gray-800/50">
                <td className="px-4 py-2 text-gray-200">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm mr-2 align-middle" style={{ background: r.color }} />
                  {r.item}
                </td>
                <td className="px-4 py-2 text-right font-mono text-gray-100">{loaded ? r.qty.toLocaleString() : '-'}</td>
              </tr>
            ))}
            <tr>
              <td className="px-4 py-2 text-gray-400 font-semibold">합계</td>
              <td className="px-4 py-2 text-right font-mono font-semibold text-gray-100">{loaded ? total.toLocaleString() : '-'}</td>
            </tr>
          </tbody>
        </table>
        <div className="relative h-60 md:h-auto md:min-h-60 border-t md:border-t-0 md:border-l border-gray-800">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              {pieData.length > 0 ? (
                <Pie data={pieData} dataKey="qty" nameKey="item" innerRadius="55%" outerRadius="85%" paddingAngle={1}
                  stroke="var(--chart-surface)" strokeWidth={2} isAnimationActive={false}>
                  {pieData.map(r => <Cell key={r.item} fill={r.color} />)}
                </Pie>
              ) : (
                <Pie data={[{ item: '없음', qty: 1 }]} dataKey="qty" innerRadius="55%" outerRadius="85%" isAnimationActive={false}
                  fill="var(--series-other)" fillOpacity={0.2} stroke="none" />
              )}
              {pieData.length > 0 && (
                <Tooltip
                  contentStyle={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: 8, fontSize: 12 }}
                  itemStyle={{ color: '#f3f4f6' }}
                  formatter={(v, name) => [`${Number(v).toLocaleString()} (${total > 0 ? (Number(v) / total * 100).toFixed(1) : 0}%)`, String(name)]} />
              )}
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-[11px] text-gray-500 text-center leading-tight">
              {pieData.length > 0 ? <>합계<br /><span className="text-sm font-bold text-gray-200">{total.toLocaleString()}</span></> : loaded ? '수량 없음' : <>데이터<br />연결 후</>}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ReportCategoryPage({ title, description, tabs, loadData }: {
  title: string; description: string; tabs: ReportTab[]; loadData?: ReportLoader;
}) {
  const [active, setActive] = useState(tabs[0]?.key);
  const tab = tabs.find(t => t.key === active) ?? tabs[0];
  const [[start, end], setRange] = useState<[string, string]>(() => presetRange('thisMonth'));
  const [quantities, setQuantities] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rangeOk = !!start && !!end && daysBetween(start, end) > 0;

  const handleQuery = async () => {
    if (!loadData || !rangeOk) return;
    setLoading(true);
    setError(null);
    try { setQuantities(await loadData(start, end)); } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    setLoading(false);
  };

  return (
    <div className="p-5 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-100 flex items-center gap-2"><FileBarChart className="w-6 h-6 text-gray-400" />{title}</h1>
        <p className="text-xs text-gray-500 mt-1">{description}</p>
      </div>

      {/* 기간 — 리포트 공통 */}
      <div className="bg-gray-900/60 border border-gray-800 rounded-lg p-3 flex flex-wrap items-center gap-2">
        <DateRangeBar start={start} end={end} onChange={setRange} />
        <div className="flex-1" />
        <button type="button" onClick={handleQuery} disabled={!loadData || !rangeOk || loading}
          title={loadData ? undefined : '데이터 연결 후 사용할 수 있습니다'}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
            !loadData || !rangeOk || loading ? 'bg-gray-800 text-gray-600 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white'
          }`}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}조회
        </button>
      </div>

      {!loadData && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          <Hammer className="w-3.5 h-3.5 shrink-0" />
          분류 구조만 준비된 화면입니다 — 주문·제작 데이터를 연결하면 기간별 수량과 비율이 채워집니다
        </div>
      )}
      {error && <p className="text-sm text-amber-400">데이터를 불러오지 못했습니다 · {error}</p>}

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

      <div className="space-y-4">
        {tab.groups.map((g, gi) => <GroupCard key={`${tab.key}-${gi}`} group={g} quantities={quantities} loaded={quantities != null} />)}
      </div>
    </div>
  );
}
