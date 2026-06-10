'use client';

import React, { useState, useEffect } from 'react';
import { FileSpreadsheet, Package, Loader2 } from 'lucide-react';
import TransactionFilter, { type FilterState } from '@/components/TransactionFilter';
import TransactionTable from '@/components/TransactionTable';
import MaterialsTable from '@/components/MaterialsTable';

interface OpRecord {
  mk: string; rg: string; rn: number; wn: number; task: string; date: string;
  ws: string; wname: string; detail: string; semi: string; pCnt: string;
  sheets: number; cnt: number; oPages: number; bPages: number; client: string;
}

interface MatRecord {
  client: string; orderCode: number; workCode: number; orderName: string;
  taskName: string; date: string; matType: string; matName: string; usage: number;
}

const INIT: FilterState = {
  division: '', dateFrom: '', dateTo: '', client: '', product: '', manager: '', taskSearch: '',
};

export default function TransactionPage() {
  const [tab, setTab] = useState<'ops' | 'mat'>('ops');
  const [filters, setFilters] = useState<FilterState>(INIT);
  const [data, setData] = useState<OpRecord[]>([]);
  const [materials, setMaterials] = useState<MatRecord[]>([]);
  const [clients, setClients] = useState<string[]>([]);
  const [loadingOps, setLoadingOps] = useState(true);
  const [loadingMat, setLoadingMat] = useState(true);

  useEffect(() => {
    fetch('/data/operations.json')
      .then(res => res.json())
      .then(json => { setData(json.records || []); setClients(json.clients || []); setLoadingOps(false); })
      .catch(() => setLoadingOps(false));

    fetch('/data/materials.json')
      .then(res => res.json())
      .then(json => { setMaterials(json.materials || []); setLoadingMat(false); })
      .catch(() => setLoadingMat(false));
  }, []);

  const loading = tab === 'ops' ? loadingOps : loadingMat;

  return (
    <div className="flex flex-col gap-4 p-5 bg-black min-h-full">
      {/* 헤더 */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">거래명세서 관리</h2>
          <p className="text-xs text-gray-500 mt-1">
            DSPM 운영통계 & 자재사용현황 · 실 데이터 시뮬레이션
          </p>
        </div>
        <div className="flex items-center gap-1">
          {loading && <Loader2 className="w-4 h-4 text-blue-400 animate-spin mr-2" />}
          <span className="text-[10px] text-gray-600 mr-3">
            {!loadingOps && !loadingMat && `운영 ${data.length.toLocaleString()}건 · 자재 ${materials.length.toLocaleString()}건`}
          </span>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 bg-gray-900/50 border border-gray-800 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab('ops')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            tab === 'ops'
              ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
              : 'text-gray-500 hover:text-gray-300 border border-transparent'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          운영통계자료
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tab === 'ops' ? 'bg-blue-500/20 text-blue-300' : 'bg-gray-800 text-gray-500'}`}>
            {data.length.toLocaleString()}
          </span>
        </button>
        <button
          onClick={() => setTab('mat')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            tab === 'mat'
              ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
              : 'text-gray-500 hover:text-gray-300 border border-transparent'
          }`}
        >
          <Package className="w-4 h-4" />
          자재사용현황
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tab === 'mat' ? 'bg-purple-500/20 text-purple-300' : 'bg-gray-800 text-gray-500'}`}>
            {materials.length.toLocaleString()}
          </span>
        </button>
      </div>

      {/* 필터 */}
      <TransactionFilter filters={filters} onChange={setFilters} clients={clients} />

      {/* 테이블 */}
      {tab === 'ops' ? (
        <TransactionTable data={data} filters={filters} loading={loadingOps} />
      ) : (
        <MaterialsTable data={materials} filters={filters} loading={loadingMat} />
      )}
    </div>
  );
}
