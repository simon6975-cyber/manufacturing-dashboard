'use client';

import React, { useState, useMemo } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

interface MatRecord {
  client: string; orderCode: number; workCode: number; orderName: string;
  taskName: string; date: string; matType: string; matName: string; usage: number;
}

interface FilterState {
  division: string; dateFrom: string; dateTo: string; client: string;
  product: string; manager: string; taskSearch: string;
}

const PAGE_SIZE = 50;
function fmt(n: number) { return (n || 0).toLocaleString(); }

interface Props { data: MatRecord[]; filters: FilterState; loading: boolean; }

export default function MaterialsTable({ data, filters, loading }: Props) {
  const [page, setPage] = useState(0);
  const [sortCol, setSortCol] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const filtered = useMemo(() => {
    let d = data;
    if (filters.dateFrom) d = d.filter(r => r.date >= filters.dateFrom);
    if (filters.dateTo) d = d.filter(r => r.date <= filters.dateTo);
    if (filters.client) d = d.filter(r => r.client === filters.client);
    if (filters.taskSearch) {
      const s = filters.taskSearch.toLowerCase();
      d = d.filter(r => r.orderName.toLowerCase().includes(s) || r.taskName.toLowerCase().includes(s));
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

  const summary = useMemo(() => {
    const byType: Record<string, number> = {};
    let totalUsage = 0;
    filtered.forEach(r => {
      totalUsage += r.usage;
      byType[r.matType] = (byType[r.matType] || 0) + r.usage;
    });
    return { total: filtered.length, totalUsage, byType };
  }, [filtered]);

  useMemo(() => setPage(0), [filters, sortCol, sortDir]);

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortCol !== col) return <ArrowUpDown className="w-3 h-3 opacity-30 ml-1 inline" />;
    return sortDir === 'asc'
      ? <ArrowUp className="w-3 h-3 text-purple-400 ml-1 inline" />
      : <ArrowDown className="w-3 h-3 text-purple-400 ml-1 inline" />;
  };

  const matTypeColor: Record<string, string> = {
    '용지': 'bg-blue-500/12 text-blue-400 border-blue-500/20',
    '봉투': 'bg-amber-500/12 text-amber-400 border-amber-500/20',
    '삽지': 'bg-green-500/12 text-green-400 border-green-500/20',
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-500 pulse-soft text-sm">자재 데이터를 불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <div className="rounded-lg border px-4 py-3 bg-purple-500/10 border-purple-500/20 text-purple-400">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-0.5">총 레코드</p>
          <p className="text-xl font-bold tabular-nums">{fmt(summary.total)}</p>
        </div>
        <div className="rounded-lg border px-4 py-3 bg-blue-500/10 border-blue-500/20 text-blue-400">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-0.5">총 사용량</p>
          <p className="text-xl font-bold tabular-nums">{fmt(summary.totalUsage)}</p>
        </div>
        {Object.entries(summary.byType).slice(0, 3).map(([type, usage]) => (
          <div key={type} className="rounded-lg border px-4 py-3 bg-gray-800/50 border-gray-700/50">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-0.5">{type}</p>
            <p className="text-xl font-bold tabular-nums text-gray-200">{fmt(usage)}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto scroll-dark rounded-lg border border-gray-800">
        <table className="tx-table">
          <thead>
            <tr>
              <th style={{ width: 50 }}>No</th>
              <th className="sortable" onClick={() => toggleSort('date')}>작업일자<SortIcon col="date" /></th>
              <th className="sortable" onClick={() => toggleSort('client')}>고객사<SortIcon col="client" /></th>
              <th>업무의뢰서명</th>
              <th>작업이름</th>
              <th>자재종류</th>
              <th>자재명</th>
              <th className="sortable" onClick={() => toggleSort('usage')} style={{ textAlign: 'right' }}>사용량<SortIcon col="usage" /></th>
              <th>의뢰서코드</th>
              <th>작업코드</th>
            </tr>
          </thead>
          <tbody>
            {pageData.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ padding: 48, textAlign: 'center', color: '#6b7280' }}>
                  조건에 맞는 데이터가 없습니다.
                </td>
              </tr>
            ) : pageData.map((r, i) => (
              <tr key={`${r.workCode}-${i}`}>
                <td className="text-gray-600 text-xs">{page * PAGE_SIZE + i + 1}</td>
                <td className="whitespace-nowrap text-xs font-mono">{r.date}</td>
                <td className="text-xs font-medium">{r.client}</td>
                <td className="text-xs max-w-[200px] truncate" title={r.orderName}>{r.orderName}</td>
                <td className="text-xs text-gray-400 max-w-[160px] truncate" title={r.taskName}>{r.taskName}</td>
                <td>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${matTypeColor[r.matType] || 'bg-gray-800/50 text-gray-400 border-gray-700/50'}`}>
                    {r.matType}
                  </span>
                </td>
                <td className="text-[11px] text-gray-400 max-w-[200px] truncate" title={r.matName}>{r.matName}</td>
                <td className="text-right text-xs font-mono tabular-nums font-semibold">{fmt(r.usage)}</td>
                <td className="text-[11px] text-gray-600 font-mono">{r.orderCode}</td>
                <td className="text-[11px] text-gray-600 font-mono">{r.workCode}</td>
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
