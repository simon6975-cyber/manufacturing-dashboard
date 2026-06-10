'use client';

import React, { useState, useMemo } from 'react';
import { Search, ChevronDown, ChevronUp, Plus, Pencil, Trash2, X, Check, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import rawData from '@/data/operations.json';

// ─── 타입 & 상수 ──────────────────────────────
interface Rec { mk:string;rg:string;rn:number;wn:number;task:string;date:string;wname:string;detail:string;semi:string;pCnt:string;sheets:number;cnt:number;oPages:number;bPages:number;client:string; }
interface Filters { division:string;dateFrom:string;dateTo:string;client:string;product:string;manager:string;taskSearch:string; }

const COLS = ['mk','rg','rn','wn','task','date','wname','detail','semi','pCnt','sheets','cnt','oPages','bPages','client'] as const;
const DM_MGR = ['김성수','노재민','강서윤','임병민','김희원'];
const N_MGR = ['김정기','오창희','조영환','박현수','안제하'];
const ALL_MGR = [...DM_MGR, ...N_MGR];
const DM_PROD = ['DM'];
const N_PROD = ['교재 (V-BOOK)','교재 (P+S)','교재 (P+A)','교재 (P+M)','시험지','봉투','OMR','포스터','브로슈어','배너'];
const PAGE_SZ = 50;
const fmt = (n:number) => (n||0).toLocaleString();

// ─── 데이터 파싱 (빌드 시 번들) ─────────────────
const DATA: Rec[] = (rawData as {r:(string|number)[][];c:string[]}).r.map(row => {
  const o: Record<string,string|number> = {};
  COLS.forEach((c,i) => { o[c] = row[i]; });
  return o as unknown as Rec;
});
const CLIENTS: string[] = (rawData as {r:(string|number)[][];c:string[]}).c;

// ─── 메인 페이지 ────────────────────────────────
export default function TransactionPage() {
  const [f, setF] = useState<Filters>({division:'',dateFrom:'',dateTo:'',client:'',product:'',manager:'',taskSearch:''});
  const [page, setPage] = useState(0);
  const [sortCol, setSortCol] = useState('');
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc');
  const [clientOpen, setClientOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [productOpen, setProductOpen] = useState(false);
  const [products, setProducts] = useState([...DM_PROD, ...N_PROD]);
  const [addProd, setAddProd] = useState(false);
  const [editIdx, setEditIdx] = useState<number|null>(null);
  const [prodInput, setProdInput] = useState('');

  const set = (k:keyof Filters, v:string) => { setF(p=>({...p,[k]:v})); setPage(0); };

  const curMgrs = useMemo(()=> f.division==='DM사업부'?DM_MGR:f.division==='N사업부'?N_MGR:ALL_MGR, [f.division]);
  const curProds = useMemo(()=> f.division==='DM사업부'?products.filter(p=>DM_PROD.includes(p)):f.division==='N사업부'?products.filter(p=>!DM_PROD.includes(p)):products, [f.division,products]);
  const filtClients = useMemo(()=> clientSearch?CLIENTS.filter(c=>c.toLowerCase().includes(clientSearch.toLowerCase())):CLIENTS, [clientSearch]);

  const filtered = useMemo(()=>{
    let d = DATA;
    if(f.division){ const mgrs = f.division==='DM사업부'?DM_MGR:N_MGR; d=d.filter(r=>mgrs.includes(r.mk)); }
    if(f.dateFrom) d=d.filter(r=>r.date>=f.dateFrom);
    if(f.dateTo) d=d.filter(r=>r.date<=f.dateTo);
    if(f.client) d=d.filter(r=>r.client===f.client);
    if(f.manager) d=d.filter(r=>r.mk===f.manager);
    if(f.taskSearch){ const s=f.taskSearch.toLowerCase(); d=d.filter(r=>r.task.toLowerCase().includes(s)); }
    return d;
  },[f]);

  const sorted = useMemo(()=>{
    if(!sortCol) return filtered;
    return [...filtered].sort((a,b)=>{
      const av=(a as unknown as Record<string,unknown>)[sortCol];
      const bv=(b as unknown as Record<string,unknown>)[sortCol];
      if(typeof av==='number'&&typeof bv==='number') return sortDir==='asc'?av-bv:bv-av;
      return sortDir==='asc'?String(av||'').localeCompare(String(bv||'')):String(bv||'').localeCompare(String(av||''));
    });
  },[filtered,sortCol,sortDir]);

  const totalPages = Math.ceil(sorted.length/PAGE_SZ);
  const pageData = sorted.slice(page*PAGE_SZ,(page+1)*PAGE_SZ);
  const sm = useMemo(()=>({
    total:filtered.length,
    sheets:filtered.reduce((a,r)=>a+r.sheets,0),
    cnt:filtered.reduce((a,r)=>a+r.cnt,0),
    oPages:filtered.reduce((a,r)=>a+r.oPages,0),
    bPages:filtered.reduce((a,r)=>a+r.bPages,0),
  }),[filtered]);

  const toggleSort=(col:string)=>{ if(sortCol===col) setSortDir(d=>d==='asc'?'desc':'asc'); else{setSortCol(col);setSortDir('desc');} setPage(0); };
  const SI=({col}:{col:string})=> sortCol!==col?<ArrowUpDown className="w-3 h-3 opacity-30 ml-1 inline"/>:sortDir==='asc'?<ArrowUp className="w-3 h-3 text-blue-400 ml-1 inline"/>:<ArrowDown className="w-3 h-3 text-blue-400 ml-1 inline"/>;
  const hasF = f.division||f.dateFrom||f.dateTo||f.client||f.product||f.manager||f.taskSearch;

  return (
    <div className="flex flex-col gap-4 p-5 bg-black min-h-full">
      {/* 헤더 */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">거래명세서 관리</h2>
          <p className="text-xs text-gray-500 mt-1">DSPM 운영통계 데이터 · 제품별, 일자별, 담당자별, 고객별 제작 수량 조회</p>
        </div>
        <span className="text-[10px] text-gray-600 pt-1">총 {DATA.length.toLocaleString()}건</span>
      </div>

      {/* ─── 필터 ─── */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          {/* 사업부 */}
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-1.5 block">사업부</label>
            <div className="flex gap-1.5">
              {['','DM사업부','N사업부'].map(d=>(
                <button key={d} className={`px-3 py-1.5 text-xs rounded-md border font-medium transition-all ${f.division===d?'bg-blue-500/15 text-blue-400 border-blue-500/30':'bg-gray-900 text-gray-500 border-gray-700 hover:text-gray-300'}`}
                  onClick={()=>{set('division',d);set('manager','');set('product','');}}>{d||'전체'}</button>
              ))}
            </div>
          </div>
          {/* 일자 */}
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-1.5 block">일자</label>
            <div className="flex gap-2 items-center">
              <input type="date" className="tx-input w-36" value={f.dateFrom} onChange={e=>set('dateFrom',e.target.value)}/>
              <span className="text-gray-600 text-xs">~</span>
              <input type="date" className="tx-input w-36" value={f.dateTo} onChange={e=>set('dateTo',e.target.value)}/>
            </div>
          </div>
          {/* 담당 */}
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-1.5 block">담당</label>
            <select className="tx-input w-32" value={f.manager} onChange={e=>set('manager',e.target.value)}>
              <option value="">전체</option>
              {curMgrs.map(m=><option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          {/* 업무명 */}
          <div className="flex-1 min-w-[200px]">
            <label className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-1.5 block">업무명</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-600"/>
              <input className="tx-input pl-8" value={f.taskSearch} onChange={e=>set('taskSearch',e.target.value)} placeholder="업무명 검색..."/>
            </div>
          </div>
          {hasF&&<button onClick={()=>setF({division:'',dateFrom:'',dateTo:'',client:'',product:'',manager:'',taskSearch:''})} className="px-3 py-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-md border border-gray-700 transition-colors flex items-center gap-1"><X className="w-3 h-3"/>초기화</button>}
        </div>
        <div className="flex flex-wrap gap-3 items-start">
          {/* 고객사 */}
          <div className="relative">
            <label className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-1.5 block">고객사</label>
            <button onClick={()=>{setClientOpen(!clientOpen);setProductOpen(false);}} className="tx-input w-56 text-left flex items-center justify-between">
              <span className={f.client?'text-white':'text-gray-500'}>{f.client||'전체'}</span>
              {clientOpen?<ChevronUp className="w-3.5 h-3.5 text-gray-500"/>:<ChevronDown className="w-3.5 h-3.5 text-gray-500"/>}
            </button>
            {clientOpen&&(
              <div className="absolute top-full left-0 mt-1 w-64 z-50 bg-[#0d0d12] border border-gray-800 rounded-lg shadow-2xl overflow-hidden" style={{animation:'fadeIn .15s ease-out'}}>
                <div className="p-2 border-b border-gray-800"><div className="relative"><Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-600"/><input className="tx-input pl-8 text-xs" value={clientSearch} onChange={e=>setClientSearch(e.target.value)} placeholder="고객사 검색..." autoFocus/></div></div>
                <div className="max-h-[240px] overflow-auto" style={{scrollbarWidth:'thin',scrollbarColor:'#333 transparent'}}>
                  <div className={`px-3 py-1.5 text-xs cursor-pointer ${!f.client?'text-blue-400 bg-blue-500/10 font-semibold':'text-gray-500 hover:bg-gray-800'}`} onClick={()=>{set('client','');setClientOpen(false);}}>전체</div>
                  {filtClients.map(c=>(
                    <div key={c} className={`px-3 py-1.5 text-xs cursor-pointer border-t border-gray-800/50 ${f.client===c?'text-blue-400 bg-blue-500/10 font-semibold':'text-gray-500 hover:bg-gray-800 hover:text-gray-300'}`}
                      onClick={()=>{set('client',c);setClientOpen(false);}}>{c}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
          {/* 제품 */}
          <div className="relative">
            <label className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-1.5 block">제품</label>
            <button onClick={()=>{setProductOpen(!productOpen);setClientOpen(false);}} className="tx-input w-48 text-left flex items-center justify-between">
              <span className={f.product?'text-white':'text-gray-500'}>{f.product||'전체'}</span>
              {productOpen?<ChevronUp className="w-3.5 h-3.5 text-gray-500"/>:<ChevronDown className="w-3.5 h-3.5 text-gray-500"/>}
            </button>
            {productOpen&&(
              <div className="absolute top-full left-0 mt-1 w-64 z-50 bg-[#0d0d12] border border-gray-800 rounded-lg shadow-2xl overflow-hidden" style={{animation:'fadeIn .15s ease-out'}}>
                <div className="max-h-[280px] overflow-auto" style={{scrollbarWidth:'thin',scrollbarColor:'#333 transparent'}}>
                  <div className={`px-3 py-1.5 text-xs cursor-pointer ${!f.product?'text-blue-400 bg-blue-500/10 font-semibold':'text-gray-500 hover:bg-gray-800'}`} onClick={()=>{set('product','');setProductOpen(false);}}>전체</div>
                  {curProds.map((p,i)=>(
                    <div key={p} className="flex items-center group">
                      {editIdx===i?(
                        <div className="flex items-center gap-1 flex-1 px-2 py-1">
                          <input className="tx-input flex-1 text-xs py-1" value={prodInput} onChange={e=>setProdInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&prodInput.trim()){const u=[...products];const ri=products.indexOf(p);u[ri]=prodInput.trim();setProducts(u);setEditIdx(null);setProdInput('');}}} autoFocus/>
                          <button onClick={()=>{if(prodInput.trim()){const u=[...products];const ri=products.indexOf(p);u[ri]=prodInput.trim();setProducts(u);}setEditIdx(null);setProdInput('');}} className="text-blue-400 p-0.5"><Check className="w-3.5 h-3.5"/></button>
                          <button onClick={()=>{setEditIdx(null);setProdInput('');}} className="text-gray-500 p-0.5"><X className="w-3.5 h-3.5"/></button>
                        </div>
                      ):(
                        <>
                          <div className={`px-3 py-1.5 text-xs cursor-pointer flex-1 border-t border-gray-800/50 ${f.product===p?'text-blue-400 bg-blue-500/10 font-semibold':'text-gray-500 hover:bg-gray-800 hover:text-gray-300'}`} onClick={()=>{set('product',p);setProductOpen(false);}}>{p}</div>
                          <div className="hidden group-hover:flex items-center gap-0.5 pr-2">
                            <button onClick={e=>{e.stopPropagation();setEditIdx(i);setProdInput(p);}} className="text-gray-600 hover:text-gray-300 p-0.5"><Pencil className="w-3 h-3"/></button>
                            <button onClick={e=>{e.stopPropagation();setProducts(products.filter(x=>x!==p));if(f.product===p)set('product','');}} className="text-gray-600 hover:text-red-400 p-0.5"><Trash2 className="w-3 h-3"/></button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
                <div className="border-t border-gray-800 p-2">
                  {addProd?(
                    <div className="flex items-center gap-1">
                      <input className="tx-input flex-1 text-xs py-1" value={prodInput} onChange={e=>setProdInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&prodInput.trim()){setProducts([...products,prodInput.trim()]);setProdInput('');setAddProd(false);}}} placeholder="제품명 입력" autoFocus/>
                      <button onClick={()=>{if(prodInput.trim()){setProducts([...products,prodInput.trim()]);setProdInput('');setAddProd(false);}}} className="text-blue-400 p-0.5"><Check className="w-3.5 h-3.5"/></button>
                      <button onClick={()=>{setAddProd(false);setProdInput('');}} className="text-gray-500 p-0.5"><X className="w-3.5 h-3.5"/></button>
                    </div>
                  ):(
                    <button onClick={()=>setAddProd(true)} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 w-full px-1 py-1"><Plus className="w-3 h-3"/>제품 추가</button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── 요약 카드 ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {label:'총 건수',value:fmt(sm.total),cls:'bg-blue-500/10 border-blue-500/20 text-blue-400'},
          {label:'총 장수',value:fmt(sm.sheets),cls:'bg-green-500/10 border-green-500/20 text-green-400'},
          {label:'출력페이지',value:fmt(sm.oPages),cls:'bg-amber-500/10 border-amber-500/20 text-amber-400'},
          {label:'청구페이지',value:fmt(sm.bPages),cls:'bg-purple-500/10 border-purple-500/20 text-purple-400'},
        ].map(c=>(
          <div key={c.label} className={`rounded-lg border px-4 py-3 ${c.cls}`}>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-0.5">{c.label}</p>
            <p className="text-xl font-bold" style={{fontVariantNumeric:'tabular-nums'}}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* ─── 테이블 ─── */}
      <div className="flex-1 overflow-auto rounded-lg border border-gray-800" style={{scrollbarWidth:'thin',scrollbarColor:'#333 transparent'}}>
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {[
                {k:'',l:'NO',w:50,align:'left'},
                {k:'date',l:'작업일자',w:0,align:'left'},
                {k:'mk',l:'담당자',w:0,align:'left'},
                {k:'',l:'등록자',w:0,align:'left'},
                {k:'client',l:'고객사',w:0,align:'left'},
                {k:'',l:'업무명',w:0,align:'left'},
                {k:'',l:'작업명',w:0,align:'left'},
                {k:'',l:'작업상세',w:0,align:'left'},
                {k:'',l:'반제품',w:0,align:'center'},
                {k:'',l:'P수',w:0,align:'center'},
                {k:'sheets',l:'장수',w:0,align:'right'},
                {k:'cnt',l:'건수',w:0,align:'right'},
                {k:'oPages',l:'출력페이지',w:0,align:'right'},
                {k:'bPages',l:'청구페이지',w:0,align:'right'},
                {k:'',l:'의뢰서번호',w:0,align:'left'},
              ].map(h=>(
                <th key={h.l} onClick={h.k?()=>toggleSort(h.k):undefined}
                  className={`sticky top-0 z-10 bg-[#0d0d12] px-3.5 py-2.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-800 whitespace-nowrap ${h.k?'cursor-pointer hover:text-gray-300':''}`}
                  style={{textAlign:h.align as 'left'|'right'|'center',width:h.w||undefined}}>
                  {h.l}{h.k&&<SI col={h.k}/>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageData.length===0?(
              <tr><td colSpan={15} className="text-center text-gray-600 py-12">조건에 맞는 데이터가 없습니다.</td></tr>
            ):pageData.map((r,i)=>(
              <tr key={`${r.wn}-${i}`} className="border-b border-gray-800/30 hover:bg-blue-500/[0.04] transition-colors" style={{background:i%2===0?'transparent':'rgba(255,255,255,0.008)'}}>
                <td className="px-3.5 py-2 text-gray-600 text-xs">{page*PAGE_SZ+i+1}</td>
                <td className="px-3.5 py-2 whitespace-nowrap text-xs font-mono">{r.date}</td>
                <td className="px-3.5 py-2"><span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${DM_MGR.includes(r.mk)?'bg-blue-500/12 text-blue-400':'bg-purple-500/12 text-purple-400'}`}>{r.mk}</span></td>
                <td className="px-3.5 py-2 text-xs text-gray-500">{r.rg}</td>
                <td className="px-3.5 py-2 text-xs font-medium">{r.client}</td>
                <td className="px-3.5 py-2 text-xs max-w-[180px] truncate" title={r.task}>{r.task}</td>
                <td className="px-3.5 py-2 text-xs text-gray-400 max-w-[140px] truncate" title={r.wname}>{r.wname}</td>
                <td className="px-3.5 py-2 text-[11px] text-gray-600 max-w-[160px] truncate" title={r.detail}>{r.detail}</td>
                <td className="px-3.5 py-2 text-center text-xs">{r.semi==='Y'?<span className="text-blue-400 font-bold">Y</span>:<span className="text-gray-700">N</span>}</td>
                <td className="px-3.5 py-2 text-center text-xs text-gray-500">{r.pCnt}</td>
                <td className="px-3.5 py-2 text-right text-xs font-mono" style={{fontVariantNumeric:'tabular-nums'}}>{fmt(r.sheets)}</td>
                <td className="px-3.5 py-2 text-right text-xs font-mono" style={{fontVariantNumeric:'tabular-nums'}}>{fmt(r.cnt)}</td>
                <td className="px-3.5 py-2 text-right text-xs font-mono" style={{fontVariantNumeric:'tabular-nums'}}>{fmt(r.oPages)}</td>
                <td className="px-3.5 py-2 text-right text-xs font-mono" style={{fontVariantNumeric:'tabular-nums'}}>{fmt(r.bPages)}</td>
                <td className="px-3.5 py-2 text-[11px] text-gray-600 font-mono">{r.rn}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ─── 페이지네이션 ─── */}
      <div className="flex items-center justify-between pt-1">
        <span className="text-xs text-gray-500">총 <span className="text-white font-semibold">{fmt(sorted.length)}</span>건{sorted.length>0&&` · ${page*PAGE_SZ+1}~${Math.min((page+1)*PAGE_SZ,sorted.length)}건 표시`}</span>
        <div className="flex gap-1.5">
          {[{l:'≪',d:page===0,fn:()=>setPage(0)},{l:'‹ 이전',d:page===0,fn:()=>setPage(p=>p-1)},].map((b,i)=>(
            <button key={i} disabled={b.d} onClick={b.fn} className="px-3 py-1 text-xs border border-gray-700 rounded-md bg-gray-900 text-gray-400 hover:bg-gray-800 hover:text-white disabled:opacity-30 disabled:cursor-default transition-colors">{b.l}</button>
          ))}
          <span className="px-3 py-1 text-xs font-semibold text-white">{page+1} / {totalPages||1}</span>
          {[{l:'다음 ›',d:page>=totalPages-1,fn:()=>setPage(p=>p+1)},{l:'≫',d:page>=totalPages-1,fn:()=>setPage(totalPages-1)},].map((b,i)=>(
            <button key={i} disabled={b.d} onClick={b.fn} className="px-3 py-1 text-xs border border-gray-700 rounded-md bg-gray-900 text-gray-400 hover:bg-gray-800 hover:text-white disabled:opacity-30 disabled:cursor-default transition-colors">{b.l}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
