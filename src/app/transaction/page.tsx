'use client';

import React, { useState, useEffect } from 'react';
import TransactionFilter, { type FilterState } from '@/components/TransactionFilter';
import TransactionTable from '@/components/TransactionTable';

interface OpRecord {
  mk: string; rg: string; rn: number; wn: number; task: string; date: string;
  ws: string; wname: string; detail: string; semi: string; pCnt: string;
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
    fetch('/data/operations.json')
      .then(res => res.json())
      .then(json => {
        setData(json.records || []);
        setClients(json.clients || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Data load error:', err);
        setLoading(false);
      });
  }, []);

  return (
    <div className="flex flex-col gap-4 p-5 bg-black min-h-full">
      {/* 헤더 */}
      <div>
        <h2 className="text-2xl font-bold text-white">거래명세서 관리</h2>
        <p className="text-xs text-gray-500 mt-1">
          DSPM 운영통계 데이터 기반 · 제품별, 일자별, 담당자별, 고객별 제작 수량 조회
        </p>
      </div>

      {/* 필터 */}
      <TransactionFilter filters={filters} onChange={setFilters} clients={clients} />

      {/* 테이블 */}
      <TransactionTable data={data} filters={filters} loading={loading} />
    </div>
  );
}
