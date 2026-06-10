'use client';

import React, { useState, useMemo } from 'react';
import { Search, ChevronDown, ChevronUp, Plus, Pencil, Trash2, X, Check } from 'lucide-react';

export interface FilterState {
  division: string;
  dateFrom: string;
  dateTo: string;
  client: string;
  product: string;
  manager: string;
  taskSearch: string;
}

const DIVISIONS: Record<string, { products: string[]; managers: string[] }> = {
  'DM사업부': {
    products: ['DM'],
    managers: ['김성수', '노재민', '강서윤', '임병민', '김희원'],
  },
  'N사업부': {
    products: ['교재 (V-BOOK)', '교재 (P+S)', '교재 (P+A)', '교재 (P+M)', '시험지', '봉투', 'OMR', '포스터', '브로슈어', '배너'],
    managers: ['김정기', '오창희', '조영환', '박현수', '안제하'],
  },
};

const DEFAULT_PRODUCTS = ['DM', '교재 (V-BOOK)', '교재 (P+S)', '교재 (P+A)', '교재 (P+M)', '시험지', '봉투', 'OMR', '포스터', '브로슈어', '배너'];

interface Props {
  filters: FilterState;
  onChange: (f: FilterState) => void;
  clients: string[];
}

export default function TransactionFilter({ filters, onChange, clients }: Props) {
  const [clientOpen, setClientOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [productOpen, setProductOpen] = useState(false);
  const [products, setProducts] = useState(DEFAULT_PRODUCTS);
  const [addingProduct, setAddingProduct] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [prodInput, setProdInput] = useState('');

  const set = (key: keyof FilterState, val: string) => onChange({ ...filters, [key]: val });

  const currentProducts = useMemo(() => {
    if (!filters.division) return products;
    if (filters.division === 'DM사업부') return products.filter(p => DIVISIONS['DM사업부'].products.includes(p));
    return products.filter(p => !DIVISIONS['DM사업부'].products.includes(p));
  }, [filters.division, products]);

  const currentManagers = useMemo(() => {
    if (!filters.division) return [...DIVISIONS['DM사업부'].managers, ...DIVISIONS['N사업부'].managers];
    return DIVISIONS[filters.division]?.managers || [];
  }, [filters.division]);

  const filteredClients = useMemo(() => {
    if (!clientSearch) return clients;
    const s = clientSearch.toLowerCase();
    return clients.filter(c => c.toLowerCase().includes(s));
  }, [clientSearch, clients]);

  const hasFilters = filters.division || filters.dateFrom || filters.dateTo || filters.client || filters.product || filters.manager || filters.taskSearch;

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4 space-y-3">
      {/* Row 1: 사업부 + 일자 */}
      <div className="flex flex-wrap gap-3 items-end">
        {/* 사업부 */}
        <div>
          <label className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-1.5 block">사업부</label>
          <div className="flex gap-1.5">
            {['', 'DM사업부', 'N사업부'].map(d => (
              <button key={d} className={`f-chip ${filters.division === d ? 'f-chip-on' : 'f-chip-off'}`}
                onClick={() => { set('division', d); set('manager', ''); set('product', ''); }}>
                {d || '전체'}
              </button>
            ))}
          </div>
        </div>

        {/* 일자 */}
        <div>
          <label className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-1.5 block">일자</label>
          <div className="flex gap-2 items-center">
            <input type="date" className="f-input w-36" value={filters.dateFrom} onChange={e => set('dateFrom', e.target.value)} />
            <span className="text-gray-600 text-xs">~</span>
            <input type="date" className="f-input w-36" value={filters.dateTo} onChange={e => set('dateTo', e.target.value)} />
          </div>
        </div>

        {/* 담당 */}
        <div>
          <label className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-1.5 block">담당</label>
          <select className="f-input w-32" value={filters.manager} onChange={e => set('manager', e.target.value)}>
            <option value="">전체</option>
            {currentManagers.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        {/* 업무명 */}
        <div className="flex-1 min-w-[200px]">
          <label className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-1.5 block">업무명</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-600" />
            <input className="f-input pl-8" value={filters.taskSearch} onChange={e => set('taskSearch', e.target.value)} placeholder="업무명 검색..." />
          </div>
        </div>

        {/* 초기화 */}
        {hasFilters && (
          <button onClick={() => onChange({ division: '', dateFrom: '', dateTo: '', client: '', product: '', manager: '', taskSearch: '' })}
            className="px-3 py-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-md border border-gray-700 transition-colors flex items-center gap-1">
            <X className="w-3 h-3" /> 초기화
          </button>
        )}
      </div>

      {/* Row 2: 고객사 + 제품 */}
      <div className="flex flex-wrap gap-3 items-start">
        {/* 고객사 */}
        <div className="relative">
          <label className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-1.5 block">고객사</label>
          <button onClick={() => { setClientOpen(!clientOpen); setProductOpen(false); }}
            className="f-input w-56 text-left flex items-center justify-between">
            <span className={filters.client ? 'text-white' : 'text-gray-500'}>{filters.client || '전체'}</span>
            {clientOpen ? <ChevronUp className="w-3.5 h-3.5 text-gray-500" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-500" />}
          </button>
          {clientOpen && (
            <div className="absolute top-full left-0 mt-1 w-64 z-50 bg-[#0d0d12] border border-gray-800 rounded-lg shadow-2xl overflow-hidden anim-fade">
              <div className="p-2 border-b border-gray-800">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-600" />
                  <input className="f-input pl-8 text-xs" value={clientSearch} onChange={e => setClientSearch(e.target.value)} placeholder="고객사 검색..." autoFocus />
                </div>
              </div>
              <div className="client-list" style={{ maxHeight: 240, borderRadius: 0, border: 'none' }}>
                <div className={`client-item ${!filters.client ? 'client-item-on' : ''}`}
                  onClick={() => { set('client', ''); setClientOpen(false); }}>전체</div>
                {filteredClients.map(c => (
                  <div key={c} className={`client-item ${filters.client === c ? 'client-item-on' : ''}`}
                    onClick={() => { set('client', c); setClientOpen(false); }}>{c}</div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 제품 */}
        <div className="relative">
          <label className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-1.5 block">제품</label>
          <button onClick={() => { setProductOpen(!productOpen); setClientOpen(false); }}
            className="f-input w-48 text-left flex items-center justify-between">
            <span className={filters.product ? 'text-white' : 'text-gray-500'}>{filters.product || '전체'}</span>
            {productOpen ? <ChevronUp className="w-3.5 h-3.5 text-gray-500" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-500" />}
          </button>
          {productOpen && (
            <div className="absolute top-full left-0 mt-1 w-64 z-50 bg-[#0d0d12] border border-gray-800 rounded-lg shadow-2xl overflow-hidden anim-fade">
              <div className="max-h-[280px] overflow-auto scroll-dark">
                <div className={`client-item ${!filters.product ? 'client-item-on' : ''}`}
                  onClick={() => { set('product', ''); setProductOpen(false); }}>전체</div>
                {currentProducts.map((p, i) => (
                  <div key={p} className="flex items-center group">
                    {editIdx === i ? (
                      <div className="flex items-center gap-1 flex-1 px-2 py-1">
                        <input className="f-input flex-1 text-xs py-1" value={prodInput} onChange={e => setProdInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter' && prodInput.trim()) { const u = [...products]; const ri = products.indexOf(p); u[ri] = prodInput.trim(); setProducts(u); setEditIdx(null); setProdInput(''); } }} autoFocus />
                        <button onClick={() => { if (prodInput.trim()) { const u = [...products]; const ri = products.indexOf(p); u[ri] = prodInput.trim(); setProducts(u); } setEditIdx(null); setProdInput(''); }}
                          className="text-blue-400 hover:text-blue-300 p-0.5"><Check className="w-3.5 h-3.5" /></button>
                        <button onClick={() => { setEditIdx(null); setProdInput(''); }} className="text-gray-500 hover:text-gray-300 p-0.5"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ) : (
                      <>
                        <div className={`client-item flex-1 ${filters.product === p ? 'client-item-on' : ''}`}
                          onClick={() => { set('product', p); setProductOpen(false); }}>{p}</div>
                        <div className="hidden group-hover:flex items-center gap-0.5 pr-2">
                          <button onClick={(e) => { e.stopPropagation(); setEditIdx(i); setProdInput(p); }}
                            className="text-gray-600 hover:text-gray-300 p-0.5"><Pencil className="w-3 h-3" /></button>
                          <button onClick={(e) => { e.stopPropagation(); setProducts(products.filter(x => x !== p)); if (filters.product === p) set('product', ''); }}
                            className="text-gray-600 hover:text-red-400 p-0.5"><Trash2 className="w-3 h-3" /></button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-800 p-2">
                {addingProduct ? (
                  <div className="flex items-center gap-1">
                    <input className="f-input flex-1 text-xs py-1" value={prodInput} onChange={e => setProdInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && prodInput.trim()) { setProducts([...products, prodInput.trim()]); setProdInput(''); setAddingProduct(false); } }}
                      placeholder="제품명 입력" autoFocus />
                    <button onClick={() => { if (prodInput.trim()) { setProducts([...products, prodInput.trim()]); setProdInput(''); setAddingProduct(false); } }}
                      className="text-blue-400 hover:text-blue-300 p-0.5"><Check className="w-3.5 h-3.5" /></button>
                    <button onClick={() => { setAddingProduct(false); setProdInput(''); }}
                      className="text-gray-500 hover:text-gray-300 p-0.5"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ) : (
                  <button onClick={() => setAddingProduct(true)}
                    className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 w-full px-1 py-1 transition-colors">
                    <Plus className="w-3 h-3" /> 제품 추가
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
