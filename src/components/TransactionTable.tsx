'use client';

import React, { useState, useMemo } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

interface Record {
  mk: string; rg: string; rn: number; wn: number; task: string; date: string;
  wname: string; detail: string; semi: string; pCnt: string;
  sheets: number; cnt: number; oPages: number; bPages: number; client: string;
}

interface FilterState {
  division: string; dateFrom: string; dateTo: string; client: string;
  product: string; manager: string; taskSearch: string;
}

const DM_MANAGERS = ['김성수', '노재민', '강서윤', '임병민', '김희원'];
const PAGE_SIZE = 50;

function fmt(n: number) { return (n || 0).toLocaleString(); }

interface Props {
  data: Record[];
  filters: FilterState;
  loading: boolean;
}

export default function TransactionTable({ data, filters, loading }: Props) {
  const [page, setPage] = useState(0);
  const [sortCol, setSortCol] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const filtered = useMemo(() => {
    let d = data;
    if (filters.division) {
      const DM = DM_MANAGERS;
      const isDM = filters.division === 'DM사업부';
      d = d.filter(r => isDM ? DM.includes(r.mk) : !DM.includes(r.mk));
    }
    if (filters.dateFrom) d = d.filter(r => r.date >= filters.dateFrom);
    if (filters.dateTo) d = d.filter(r => r.date <= filters.dateTo);
    if (filters.client) d = d.filter(r => r.client === filters.client);
    if (filters.manager) d = d.filter(r => r.mk === filters.manager);
    if (filters.taskSearch) {
      const s = filters.taskSearch.toLowerCase();
      d = d.filter(r => r.task.toLowerCase().includes(s));
    }
    return d;
  }, [data, filters]);

  const sorted = useMemo(() => {
    if (!sortCol) return filtered;
    return [...filtered].sort((a, b) => {
      const av = (a as unknown as globalThis.Record<string, unknown>)[sortCol];
      const bv = (b as unknown as globalThis.Record<string, unknown>)[sortCol];
      if (typeof av === 'number' && typeof bv === 'number')
        return sortDir === 'asc' ? av - bv : bv - av;
      return sortDir === 'asc'
        ? String(av || '').localeCompare(String(bv || ''))
        : String(bv || '').localeCompare(String(av || ''));
    });
  }, [filtered, sortCol, sortDir]);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const pageData = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const summary = useMemo(() => ({
    total: filtered.length,
    sheets: filtered.reduce((a, r) => a + r.sheets, 0),
    cnt: filtered.reduce((a, r) => a + r.cnt, 0),
    oPages: filtered.reduce((a, r) => a + r.oPages, 0),
    bPages: filtered.reduce((a, r) => a + r.bPages, 0),
  }), [filtered]);

  // Reset page on filter/sort change
  useMemo(() => setPage(0), [filters, sortCol, sortDir]);

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortCol !== col) return <ArrowUpDown className="w-3 h-3 opacity-30 ml-1 inline" />;
    return sortDir === 'asc'
      ? <ArrowUp className="w-3 h-3 text-blue-400 ml-1 inline" />
      : <ArrowDown className="w-3 h-3 text-blue-400 ml-1 inline" />;
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-500 pulse-soft text-sm">데이터를 불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <SummaryCard label="총 건수" value={fmt(summary.total)} color="blue" />
        <SummaryCard label="총 장수" value={fmt(summary.sheets)} color="green" />
        <SummaryCard label="출력페이지" value={fmt(summary.oPages)} color="amber" />
        <SummaryCard label="청구페이지" value={fmt(summary.bPages)} color="purple" />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto scroll-dark rounded-lg border border-gray-800">
        <table className="tx-table">
          <thead>
            <tr>
              <th style={{ width: 50 }}>No</th>
              <th className="sortable" onClick={() => toggleSort('date')}>작업일자<SortIcon col="date" /></th>
              <th className="sortable" onClick={() => toggleSort('mk')}>담당자<SortIcon col="mk" /></th>
              <th>등록자</th>
              <th className="sortable" onClick={() => toggleSort('client')}>고객사<SortIcon col="client" /></th>
              <th>업무명</th>
              <th>작업명</th>
              <th>작업상세</th>
              <th style={{ textAlign: 'center' }}>반제품</th>
              <th style={{ textAlign: 'center' }}>P수</th>
              <th className="sortable" onClick={() => toggleSort('sheets')} style={{ textAlign: 'right' }}>장수<SortIcon col="sheets" /></th>
              <th className="sortable" onClick={() => toggleSort('cnt')} style={{ textAlign: 'right' }}>건수<SortIcon col="cnt" /></th>
              <th className="sortable" onClick={() => toggleSort('oPages')} style={{ textAlign: 'right' }}>출력페이지<SortIcon col="oPages" /></th>
              <th className="sortable" onClick={() => toggleSort('bPages')} style={{ textAlign: 'right' }}>청구페이지<SortIcon col="bPages" /></th>
              <th>의뢰서번호</th>
            </tr>
          </thead>
          <tbody>
            {pageData.length === 0 ? (
              <tr>
                <td colSpan={15} style={{ padding: 48, textAlign: 'center', color: '#6b7280' }}>
                  조건에 맞는 데이터가 없습니다.
                </td>
              </tr>
            ) : pageData.map((r, i) => (
              <tr key={`${r.wn}-${i}`}>
                <td className="text-gray-600 text-xs">{page * PAGE_SIZE + i + 1}</td>
                <td className="whitespace-nowrap text-xs font-mono">{r.date}</td>
                <td>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${DM_MANAGERS.includes(r.mk) ? 'badge-dm' : 'badge-n'}`}>
                    {r.mk}
                  </span>
                </td>
                <td className="text-xs text-gray-500">{r.rg}</td>
                <td className="text-xs font-medium">{r.client}</td>
                <td className="text-xs max-w-[180px] truncate" title={r.task}>{r.task}</td>
                <td className="text-xs text-gray-400 max-w-[140px] truncate" title={r.wname}>{r.wname}</td>
                <td className="text-[11px] text-gray-600 max-w-[160px] truncate" title={r.detail}>{r.detail}</td>
                <td className="text-center text-xs">
                  {r.semi === 'Y' ? <span className="text-blue-400 font-bold">Y</span> : <span className="text-gray-700">N</span>}
                </td>
                <td className="text-center text-xs text-gray-500">{r.pCnt}</td>
                <td className="text-right text-xs font-mono tabular-nums">{fmt(r.sheets)}</td>
                <td className="text-right text-xs font-mono tabular-nums">{fmt(r.cnt)}</td>
                <td className="text-right text-xs font-mono tabular-nums">{fmt(r.oPages)}</td>
                <td className="text-right text-xs font-mono tabular-nums">{fmt(r.bPages)}</td>
                <td className="text-[11px] text-gray-600 font-mono">{r.rn}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between pt-3 mt-3 border-t border-gray-800">
        <span className="text-xs text-gray-500">
          총 <span className="text-white font-semibold">{fmt(sorted.length)}</span>건
          {sorted.length > 0 && <span> · {page * PAGE_SIZE + 1}~{Math.min((page + 1) * PAGE_SIZE, sorted.length)}건 표시</span>}
        </span>
        <div className="flex gap-1.5">
          <button className="pg-btn" disabled={page === 0} onClick={() => setPage(0)}>≪</button>
          <button className="pg-btn" disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹ 이전</button>
          <span className="px-3 py-1 text-xs font-semibold text-white">{page + 1} / {totalPages || 1}</span>
          <button className="pg-btn" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>다음 ›</button>
          <button className="pg-btn" disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>≫</button>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: string; color: 'blue' | 'green' | 'amber' | 'purple' }) {
  const styles = {
    blue: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
    green: 'bg-green-500/10 border-green-500/20 text-green-400',
    amber: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
    purple: 'bg-purple-500/10 border-purple-500/20 text-purple-400',
  };
  return (
    <div className={`rounded-lg border px-4 py-3 ${styles[color]}`}>
      <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-0.5">{label}</p>
      <p className="text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
