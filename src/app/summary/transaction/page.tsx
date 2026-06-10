// src/app/summary/transaction/page.tsx
'use client';

import React, { useState } from 'react';
import { Search, Download, Filter, CalendarDays } from 'lucide-react';

const DIVISIONS = ['전체', 'DM사업부', 'N사업부'];

export default function TransactionPage() {
  const [division, setDivision] = useState('전체');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [customer, setCustomer] = useState('전체');
  const [product, setProduct] = useState('전체');
  const [manager, setManager] = useState('전체');

  // 오늘 날짜 (기본값용)
  const today = new Date().toISOString().slice(0, 10);

  const handleSearch = () => {
    console.log('검색:', { division, dateFrom, dateTo, customer, product, manager });
  };

  return (
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">거래명세서 관리</h1>
          <p className="text-sm text-gray-500 mt-1">
            사업부, 기간, 고객사별 거래명세서를 조회하고 관리합니다
          </p>
        </div>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-gray-900 hover:bg-gray-800 text-gray-300 font-medium transition-colors text-sm border border-gray-800">
          <Download className="w-3.5 h-3.5" />
          엑셀 다운로드
        </button>
      </div>

      {/* 필터 영역 */}
      <div className="bg-gray-900/60 rounded-lg border border-gray-800 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-300">검색 필터</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {/* 사업부 */}
          <div>
            <label className="block text-[11px] text-gray-500 uppercase tracking-wider mb-1.5">사업부</label>
            <select
              value={division}
              onChange={(e) => setDivision(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500/50 transition-colors"
            >
              {DIVISIONS.map((d) => (
                <option key={d} value={d} className="bg-gray-900">{d}</option>
              ))}
            </select>
          </div>

          {/* 기간 (시작) */}
          <div>
            <label className="block text-[11px] text-gray-500 uppercase tracking-wider mb-1.5">
              <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" />시작일</span>
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              max={dateTo || today}
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500/50 transition-colors [color-scheme:dark]"
            />
          </div>

          {/* 기간 (종료) */}
          <div>
            <label className="block text-[11px] text-gray-500 uppercase tracking-wider mb-1.5">
              <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" />종료일</span>
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              min={dateFrom}
              max={today}
              className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm text-gray-200 outline-none focus:border-blue-500/50 transition-colors [color-scheme:dark]"
            />
          </div>

          {/* 고객사 (추후 추가) */}
          <div>
            <label className="block text-[11px] text-gray-500 uppercase tracking-wider mb-1.5">고객사</label>
            <select
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              disabled
              className="w-full bg-gray-800/50 border border-gray-700/50 rounded-md px-3 py-2 text-sm text-gray-500 outline-none cursor-not-allowed"
            >
              <option>추후 추가</option>
            </select>
          </div>

          {/* 제품 (추후 추가) */}
          <div>
            <label className="block text-[11px] text-gray-500 uppercase tracking-wider mb-1.5">제품</label>
            <select
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              disabled
              className="w-full bg-gray-800/50 border border-gray-700/50 rounded-md px-3 py-2 text-sm text-gray-500 outline-none cursor-not-allowed"
            >
              <option>추후 추가</option>
            </select>
          </div>

          {/* 담당 (추후 추가) */}
          <div>
            <label className="block text-[11px] text-gray-500 uppercase tracking-wider mb-1.5">담당</label>
            <select
              value={manager}
              onChange={(e) => setManager(e.target.value)}
              disabled
              className="w-full bg-gray-800/50 border border-gray-700/50 rounded-md px-3 py-2 text-sm text-gray-500 outline-none cursor-not-allowed"
            >
              <option>추후 추가</option>
            </select>
          </div>
        </div>

        {/* 검색 버튼 */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-800">
          <p className="text-xs text-gray-600">
            💡 고객사 · 제품 · 담당 필터는 데이터 연동 후 활성화됩니다
          </p>
          <button
            onClick={handleSearch}
            className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors text-sm"
          >
            <Search className="w-4 h-4" />
            조회
          </button>
        </div>
      </div>

      {/* 데이터 테이블 (빈 상태) */}
      <div className="bg-gray-900/60 rounded-lg border border-gray-800">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-[11px] text-gray-500 uppercase tracking-wider border-b border-gray-800/60">
                <th className="text-left px-4 py-3">거래일자</th>
                <th className="text-left px-4 py-3">사업부</th>
                <th className="text-left px-4 py-3">고객사</th>
                <th className="text-left px-4 py-3">제품</th>
                <th className="text-right px-4 py-3">수량</th>
                <th className="text-right px-4 py-3">단가</th>
                <th className="text-right px-4 py-3">금액</th>
                <th className="text-left px-4 py-3">담당</th>
                <th className="text-center px-4 py-3">상태</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={9} className="text-center py-16">
                  <div className="text-gray-600">
                    <Search className="w-10 h-10 mx-auto mb-3 opacity-40" />
                    <p className="text-sm text-gray-500">조회 조건을 선택하고 [조회] 버튼을 눌러주세요</p>
                    <p className="text-xs text-gray-600 mt-1">사업부와 기간을 선택하면 거래명세서를 조회할 수 있습니다</p>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
