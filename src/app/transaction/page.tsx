'use client';

import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
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

export default function TransactionPage() {
  const [filters, setFilters] = useState<FilterState>(INIT);
  const [data, setData] = useState<OpRecord[]>([]);
  const [clients, setClients] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Dynamic import — bundled by Next.js, no 404 possible
    import('@/data/operations').then(mod => {
      const cols: string[] = mod.COLS;
      const records = mod.ROWS.map((row: (string | number)[]) => {
        const obj: Record<string, string | number> = {};
        cols.forEach((c, i) => { obj[c] = row[i]; });
        return obj as unknown as OpRecord;
      });
      setData(records);
      setClients(mod.CLIENTS);
      setLoading(false);
    });
  }, []);

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
          {!loading && <span className="text-[10px] text-gray-600">총 {data.length.toLocaleString()}건</span>}
        </div>
      </div>

      <TransactionFilter filters={filters} onChange={setFilters} clients={clients} />
      <TransactionTable data={data} filters={filters} loading={loading} />
    </div>
  );
}
