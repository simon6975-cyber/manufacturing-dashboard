// src/app/summary/transaction/page.tsx
'use client';

import React, { useState, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  Search, Download, Filter, Upload, FileSpreadsheet,
  ChevronLeft, ChevronRight, X,
} from 'lucide-react';

// ============================================
// 타입
// ============================================
interface TransactionRow {
  발행여부: string;
  고객사: string;
  계약명: string;
  업무명: string;
  업무의뢰서명: string;
  작업내역서명: string;
  생산지시서명: string;
  발급일자: string;
  영업담당: string;
  운영담당: string;
}

// ============================================
// 유틸
// ============================================
const formatDate = (raw: any): string => {
  if (!raw) return '';
  if (typeof raw === 'number') {
    const d = XLSX.SSF.parse_date_code(raw);
    return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
  }
  const s = String(raw);
  if (s.length >= 10) return s.slice(0, 10);
  return s;
};

const PAGE_SIZE = 30;

// ============================================
// 드롭다운 필터
// ============================================
const SelectFilter: React.FC<{
  label: string; value: string; onChange: (v: string) => void;
  options: string[]; count?: number;
}> = ({ label, value, onChange, options, count }) => (
  <div>
    <label className="block text-[11px] text-gray-500 uppercase tracking-wider mb-1.5">
      {label} {count !== undefined && <span className="text-gray-600">({count})</span>}
    </label>
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500/50 transition-colors">
      <option value="전체" className="bg-gray-900">전체</option>
      {options.map((o) => (<option key={o} value={o} className="bg-gray-900">{o}</option>))}
    </select>
  </div>
);

// ============================================
// 메인 페이지
// ============================================
export default function TransactionPage() {
  const [data, setData] = useState<TransactionRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [page, setPage] = useState(0);

  // 필터
  const [fStatus, setFStatus] = useState('전체');
  const [fCustomer, setFCustomer] = useState('전체');
  const [fDateFrom, setFDateFrom] = useState('');
  const [fDateTo, setFDateTo] = useState('');
  const [fSales, setFSales] = useState('전체');
  const [fOps, setFOps] = useState('전체');
  const [fSearch, setFSearch] = useState('');

  // 엑셀 파싱
  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const wb = XLSX.read(e.target?.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<any>(ws);
      const rows: TransactionRow[] = json.map((r: any) => ({
        발행여부: String(r['발행여부'] ?? '').trim(),
        고객사: String(r['고객사'] ?? '').trim(),
        계약명: String(r['계약명'] ?? '').trim(),
        업무명: String(r['업무명'] ?? '').trim(),
        업무의뢰서명: String(r['업무의뢰서명'] ?? '').trim(),
        작업내역서명: String(r['작업내역서명'] ?? '').trim(),
        생산지시서명: String(r['생산지시서명'] ?? '').trim(),
        발급일자: formatDate(r['발급일자']),
        영업담당: String(r['영업담당'] ?? '').trim(),
        운영담당: String(r['운영담당'] ?? '').trim(),
      }));
      setData(rows);
      setFileName(file.name);
      setPage(0);
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) handleFile(file);
  }, [handleFile]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  // 필터 옵션 (데이터에서 추출)
  const filterOptions = useMemo(() => {
    const customers = [...new Set(data.map((r) => r.고객사).filter(Boolean))].sort();
    const sales = [...new Set(data.map((r) => r.영업담당).filter(Boolean))].sort();
    const ops = [...new Set(data.map((r) => r.운영담당).filter(Boolean))].sort();
    return { customers, sales, ops };
  }, [data]);

  // 필터링
  const filtered = useMemo(() => {
    const q = fSearch.toLowerCase();
    return data.filter((r) => {
      if (fStatus !== '전체' && r.발행여부 !== fStatus) return false;
      if (fCustomer !== '전체' && r.고객사 !== fCustomer) return false;
      if (fSales !== '전체' && r.영업담당 !== fSales) return false;
      if (fOps !== '전체' && r.운영담당 !== fOps) return false;
      if (fDateFrom && r.발급일자 < fDateFrom) return false;
      if (fDateTo && r.발급일자 > fDateTo) return false;
      if (q && !Object.values(r).some((v) => String(v).toLowerCase().includes(q))) return false;
      return true;
    });
  }, [data, fStatus, fCustomer, fSales, fOps, fDateFrom, fDateTo, fSearch]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageData = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const yCount = filtered.filter((r) => r.발행여부 === 'Y').length;
  const nCount = filtered.filter((r) => r.발행여부 === 'N').length;

  const handleReset = () => {
    setFStatus('전체'); setFCustomer('전체'); setFSales('전체'); setFOps('전체');
    setFDateFrom(''); setFDateTo(''); setFSearch(''); setPage(0);
  };

  const hasFilter = fStatus !== '전체' || fCustomer !== '전체' || fSales !== '전체' || fOps !== '전체' || fDateFrom || fDateTo || fSearch;

  // 엑셀 다운로드
  const handleExport = () => {
    const ws = XLSX.utils.json_to_sheet(filtered);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '거래명세서');
    XLSX.writeFile(wb, `거래명세서_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  // ============================================
  // 데이터 없음 → 업로드 화면
  // ============================================
  if (data.length === 0) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">거래명세서 관리</h1>
          <p className="text-sm text-gray-500 mt-1">DSPM에서 다운로드한 청구관리 엑셀 파일을 업로드해 주세요</p>
        </div>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className="border-2 border-dashed border-gray-700 hover:border-blue-500/50 rounded-xl p-16 text-center transition-colors cursor-pointer"
          onClick={() => document.getElementById('file-input')?.click()}
        >
          <Upload className="w-12 h-12 mx-auto text-gray-600 mb-4" />
          <p className="text-lg font-medium text-gray-300">엑셀 파일을 드래그하거나 클릭하여 업로드</p>
          <p className="text-sm text-gray-500 mt-2">.xlsx, .xls 파일 지원</p>
          <input id="file-input" type="file" accept=".xlsx,.xls" className="hidden" onChange={handleInputChange} />
        </div>
      </div>
    );
  }

  // ============================================
  // 데이터 있음 → 필터 + 테이블
  // ============================================
  return (
    <div className="p-6 space-y-5">
      {/* 헤더 */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">거래명세서 관리</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="flex items-center gap-1.5 text-sm text-gray-500">
              <FileSpreadsheet className="w-3.5 h-3.5" />{fileName}
            </span>
            <span className="text-xs text-gray-600">|</span>
            <span className="text-sm text-gray-400">{data.length.toLocaleString()}건</span>
            <button onClick={() => { setData([]); setFileName(''); handleReset(); }}
              className="text-xs text-gray-500 hover:text-gray-300 underline underline-offset-2">다른 파일</button>
          </div>
        </div>
        <button onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-gray-900 hover:bg-gray-800 text-gray-300 font-medium transition-colors text-sm border border-gray-800">
          <Download className="w-3.5 h-3.5" />필터 결과 다운로드
        </button>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-900 rounded-lg px-4 py-3 border border-gray-800">
          <p className="text-xs text-gray-500 mb-0.5">조회 결과</p>
          <p className="text-xl font-bold text-gray-100">{filtered.length.toLocaleString()}<span className="text-sm text-gray-500 font-normal ml-1">건</span></p>
        </div>
        <div className="bg-gray-900 rounded-lg px-4 py-3 border border-gray-800 border-l-4 border-l-emerald-500/50">
          <p className="text-xs text-gray-500 mb-0.5">발행 완료 (Y)</p>
          <p className="text-xl font-bold text-emerald-300">{yCount.toLocaleString()}</p>
        </div>
        <div className="bg-gray-900 rounded-lg px-4 py-3 border border-gray-800 border-l-4 border-l-amber-500/50">
          <p className="text-xs text-gray-500 mb-0.5">미발행 (N)</p>
          <p className="text-xl font-bold text-amber-300">{nCount.toLocaleString()}</p>
        </div>
      </div>

      {/* 필터 */}
      <div className="bg-gray-900/60 rounded-lg border border-gray-800 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-300">검색 필터</span>
          </div>
          {hasFilter && (
            <button onClick={handleReset} className="text-xs text-gray-500 hover:text-gray-300 transition-colors underline underline-offset-2">
              필터 초기화
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <SelectFilter label="발행여부" value={fStatus} onChange={(v) => { setFStatus(v); setPage(0); }} options={['Y', 'N']} />
          <SelectFilter label="고객사" value={fCustomer} onChange={(v) => { setFCustomer(v); setPage(0); }} options={filterOptions.customers} count={filterOptions.customers.length} />
          <div>
            <label className="block text-[11px] text-gray-500 uppercase tracking-wider mb-1.5">시작일</label>
            <input type="date" value={fDateFrom} onChange={(e) => { setFDateFrom(e.target.value); setPage(0); }}
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500/50 [color-scheme:dark]" />
          </div>
          <div>
            <label className="block text-[11px] text-gray-500 uppercase tracking-wider mb-1.5">종료일</label>
            <input type="date" value={fDateTo} onChange={(e) => { setFDateTo(e.target.value); setPage(0); }}
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500/50 [color-scheme:dark]" />
          </div>
          <SelectFilter label="영업담당" value={fSales} onChange={(v) => { setFSales(v); setPage(0); }} options={filterOptions.sales} />
          <SelectFilter label="운영담당" value={fOps} onChange={(v) => { setFOps(v); setPage(0); }} options={filterOptions.ops} />
        </div>
        {/* 키워드 검색 */}
        <div className="mt-3 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input type="text" value={fSearch} onChange={(e) => { setFSearch(e.target.value); setPage(0); }}
            placeholder="계약명, 업무명, 업무의뢰서명 등 키워드 검색..."
            className="w-full bg-gray-800 border border-gray-700 rounded-md pl-9 pr-9 py-2 text-sm text-gray-200 outline-none focus:border-blue-500/50 placeholder:text-gray-600" />
          {fSearch && (
            <button onClick={() => setFSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 테이블 */}
      <div className="bg-gray-900/60 rounded-lg border border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-gray-500 uppercase tracking-wider border-b border-gray-800/60 bg-gray-900/40">
                <th className="text-center px-3 py-3 w-16">발행</th>
                <th className="text-left px-3 py-3 min-w-[140px]">고객사</th>
                <th className="text-left px-3 py-3 min-w-[120px]">계약명</th>
                <th className="text-left px-3 py-3 min-w-[120px]">업무명</th>
                <th className="text-left px-3 py-3 min-w-[200px]">업무의뢰서명</th>
                <th className="text-center px-3 py-3 w-24">발급일자</th>
                <th className="text-center px-3 py-3 w-20">영업</th>
                <th className="text-center px-3 py-3 w-20">운영</th>
              </tr>
            </thead>
            <tbody>
              {pageData.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-gray-500">조건에 맞는 데이터가 없습니다</td></tr>
              ) : pageData.map((r, i) => (
                <tr key={page * PAGE_SIZE + i} className="border-b border-gray-800/30 hover:bg-gray-800/20 transition-colors">
                  <td className="text-center px-3 py-2.5">
                    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                      r.발행여부 === 'Y'
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                        : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                    }`}>{r.발행여부}</span>
                  </td>
                  <td className="px-3 py-2.5 text-gray-200 font-medium truncate max-w-[180px]" title={r.고객사}>{r.고객사}</td>
                  <td className="px-3 py-2.5 text-gray-300 truncate max-w-[150px]" title={r.계약명}>{r.계약명}</td>
                  <td className="px-3 py-2.5 text-gray-300 truncate max-w-[150px]" title={r.업무명}>{r.업무명}</td>
                  <td className="px-3 py-2.5 text-gray-400 truncate max-w-[250px]" title={r.업무의뢰서명}>{r.업무의뢰서명}</td>
                  <td className="text-center px-3 py-2.5 text-gray-400 font-mono text-xs">{r.발급일자}</td>
                  <td className="text-center px-3 py-2.5 text-gray-300">{r.영업담당}</td>
                  <td className="text-center px-3 py-2.5 text-gray-300">{r.운영담당}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 페이지네이션 */}
        {filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800">
            <p className="text-xs text-gray-500">
              {(page * PAGE_SIZE + 1).toLocaleString()} ~ {Math.min((page + 1) * PAGE_SIZE, filtered.length).toLocaleString()} / {filtered.length.toLocaleString()}건
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
                className="p-1.5 rounded hover:bg-gray-800 text-gray-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-400 px-3 font-mono">{page + 1} / {totalPages}</span>
              <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
                className="p-1.5 rounded hover:bg-gray-800 text-gray-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
