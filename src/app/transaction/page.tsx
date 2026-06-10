'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import TransactionFilter, { type FilterState } from '@/components/TransactionFilter';
import TransactionTable from '@/components/TransactionTable';

interface OpRecord {
  mk: string; rg: string; rn: number; wn: number; task: string; date: string;
  wname: string; detail: string; semi: string; pCnt: string;
  sheets: number; cnt: number; oPages: number; bPages: number; client: string;
}

const INIT: FilterState = {
  division: '', dateFrom: '', dateTo: '', client: '', product: '', manager: '', taskSearch: '',
};

const COLS = ['mk','rg','rn','wn','task','date','wname','detail','semi','pCnt','sheets','cnt','oPages','bPages','client'];

export default function TransactionPage() {
  const [filters, setFilters] = useState<FilterState>(INIT);
  const [data, setData] = useState<OpRecord[]>([]);
  const [clients, setClients] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(() => {
    setLoading(true);
    setError('');
    fetch('/data/operations.json')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(json => {
        // Support both formats: array-of-arrays (compact) and array-of-objects
        if (json.rows && json.cols) {
          const cols: string[] = json.cols;
          const records = json.rows.map((row: (string | number)[]) => {
            const obj: Record<string, string | number> = {};
            cols.forEach((c: string, i: number) => { obj[c] = row[i]; });
            return obj as unknown as OpRecord;
          });
          setData(records);
        } else if (json.records) {
          setData(json.records);
        }
        setClients(json.clients || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Data load failed:', err);
        setError(`데이터 로드 실패: ${err.message}`);
        setLoading(false);
      });
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  return (
    <div className="flex flex-col gap-4 p-5 bg-black min-h-full">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">거래명세서 관리</h2>
          <p className="text-xs text-gray-500 mt-1">
            DSPM 운영통계 데이터 · 제품별, 일자별, 담당자별, 고객별 제작 수량 조회
          </p>
        </div>
        <div className="flex items-center gap-2">
          {loading && <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />}
          {!loading && !error && <span className="text-[10px] text-gray-600">총 {data.length.toLocaleString()}건</span>}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-red-400 font-medium">{error}</p>
            <p className="text-xs text-red-400/60 mt-0.5">public/data/operations.json 파일이 존재하는지 확인해주세요.</p>
          </div>
          <button onClick={loadData} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-medium transition-colors">
            <RefreshCw className="w-3 h-3" /> 재시도
          </button>
        </div>
      )}

      <TransactionFilter filters={filters} onChange={setFilters} clients={clients} />
      <TransactionTable data={data} filters={filters} loading={loading} />
    </div>
  );
}
