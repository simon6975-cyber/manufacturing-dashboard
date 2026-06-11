// src/app/summary/transaction/page.tsx
'use client';

import React, { useState, useMemo } from 'react';
import { Search, Download, Filter, CalendarDays } from 'lucide-react';

// ============================================
// 필터 데이터
// ============================================
const DIVISIONS = ['전체', 'DM사업부', 'N사업부'];

const PRODUCTS: Record<string, string[]> = {
  'DM사업부': ['청구서', '안내문'],
  'N사업부': ['교재', '시험지', '봉투', 'OMR', '포스터', '브로슈어', '배너', '수작업'],
};

const MANAGERS: Record<string, string[]> = {
  'DM사업부': ['김성수', '노재민', '강서윤', '김희원', '임병민'],
  'N사업부': ['김정기', '오창희', '조영환', '박현수', '안제하'],
};

const CUSTOMERS = [
  '(주)대성학력개발연구소','(주)이동의즐거움(구.로카모빌리티)','BC카드','BNP파리바카디프생명',
  'KB국민카드','KB증권','KT SAT','KT(케이티)','KT클라우드','MG신용정보',
  'SH공사(서울주택도시공사)','강남구청','강남대성수능연구소(주)','강서구청','건강보험_검진안내문',
  '건설근로자공제회','교보생명보험주식회사','권현석','귀뚜라미에너지','김도혁t',
  '김진영T','노원구청','농민신문사(NH농협카드)','농협중앙회','도봉구청',
  '라온기획','류지수t','마킹PT','마포구청','미래에셋증권',
  '박인영 선생님','박헌수 선생님','박헌진 선생님','비상교육','삼성카드',
  '삼성화재해상보험(주)','서울시 38팀','서울시교통문화원','서초구청','성북구청',
  '손승연선생님','신한카드','아람출판사','안재욱t','안현준 선생님',
  '애큐온캐피탈','양지회','이정환 선생님','중구청','중국은행',
  '중랑구청','중소기업중앙회','키움증권','한국예탁결제원','한국자산관리공사',
  '혁명T','현대백화점','현대해상','황보휘T',
];

// ============================================
// 드롭다운 컴포넌트
// ============================================
const SelectFilter: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  disabled?: boolean;
  placeholder?: string;
}> = ({ label, value, onChange, options, disabled, placeholder }) => (
  <div>
    <label className="block text-[11px] text-gray-500 uppercase tracking-wider mb-1.5">{label}</label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={`w-full border rounded-md px-3 py-2 text-sm outline-none transition-colors ${
        disabled
          ? 'bg-gray-800/50 border-gray-700/50 text-gray-500 cursor-not-allowed'
          : 'bg-gray-800 border-gray-700 text-gray-200 focus:border-blue-500/50'
      }`}
    >
      <option value="전체" className="bg-gray-900">{placeholder || '전체'}</option>
      {options.map((o) => (
        <option key={o} value={o} className="bg-gray-900">{o}</option>
      ))}
    </select>
  </div>
);

// ============================================
// 메인 페이지
// ============================================
export default function TransactionPage() {
  const [division, setDivision] = useState('전체');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [customer, setCustomer] = useState('전체');
  const [product, setProduct] = useState('전체');
  const [manager, setManager] = useState('전체');

  const today = new Date().toISOString().slice(0, 10);

  // 사업부에 따라 제품/담당 목록 변경
  const productOptions = useMemo(() => {
    if (division === '전체') return [...(PRODUCTS['DM사업부'] || []), ...(PRODUCTS['N사업부'] || [])];
    return PRODUCTS[division] || [];
  }, [division]);

  const managerOptions = useMemo(() => {
    if (division === '전체') return [...(MANAGERS['DM사업부'] || []), ...(MANAGERS['N사업부'] || [])];
    return MANAGERS[division] || [];
  }, [division]);

  // 사업부 변경 시 제품/담당 초기화
  const handleDivisionChange = (v: string) => {
    setDivision(v);
    setProduct('전체');
    setManager('전체');
  };

  const handleSearch = () => {
    console.log('검색:', { division, dateFrom, dateTo, customer, product, manager });
  };

  // 필터 초기화
  const handleReset = () => {
    setDivision('전체');
    setDateFrom('');
    setDateTo('');
    setCustomer('전체');
    setProduct('전체');
    setManager('전체');
  };

  const hasFilter = division !== '전체' || dateFrom || dateTo || customer !== '전체' || product !== '전체' || manager !== '전체';

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
          <SelectFilter
            label="사업부"
            value={division}
            onChange={handleDivisionChange}
            options={DIVISIONS.filter((d) => d !== '전체')}
          />

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

          {/* 고객사 */}
          <SelectFilter
            label="고객사"
            value={customer}
            onChange={setCustomer}
            options={CUSTOMERS}
          />

          {/* 제품 (사업부 연동) */}
          <SelectFilter
            label="제품"
            value={product}
            onChange={setProduct}
            options={productOptions}
          />

          {/* 담당 (사업부 연동) */}
          <SelectFilter
            label="담당"
            value={manager}
            onChange={setManager}
            options={managerOptions}
          />
        </div>

        {/* 검색/초기화 버튼 */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-800">
          <div className="flex items-center gap-2">
            {hasFilter && (
              <button
                onClick={handleReset}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors underline underline-offset-2"
              >
                필터 초기화
              </button>
            )}
          </div>
          <button
            onClick={handleSearch}
            className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors text-sm"
          >
            <Search className="w-4 h-4" />
            조회
          </button>
        </div>
      </div>

      {/* 데이터 테이블 */}
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
