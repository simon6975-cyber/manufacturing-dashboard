// src/app/codes/page.tsx
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Plus, Trash2, Save, RotateCcw, Square, AlertTriangle,
  GripVertical, Clock, X, User, Loader2, AlertCircle,
} from 'lucide-react';
import {
  loadStopCodes, saveStopCodes, loadBottleneckCodes, saveBottleneckCodes,
  addHistoryEntry, getHistory,
  StopCodeV2, BottleneckCodeV2, Severity, CodeHistoryEntry,
} from '@/lib/codes-service';

const defaultStopCodes: StopCodeV2[] = [
  { id: 's1', code: 'S1', name: '장비 셋팅', description: '제작을 위한 장비 셋팅', active: true },
  { id: 's2', code: 'S2', name: '자재 준비', description: '용지/잉크/소모품 공급 준비', active: true },
  { id: 's3', code: 'S3', name: '작업 준비', description: '작업 파일 준비 및 세팅', active: true },
  { id: 's4', code: 'S4', name: '검수', description: '표지/내지 및 산출물 샘플 제작 후 검수', active: true },
  { id: 's5', code: 'S5', name: '예방 정비', description: '정기 PM / 셋업 변경 / 청소', active: true },
  { id: 's6', code: 'S6', name: '설비 장애', description: '기계 트러블 / 오작동 / 부품 파손', active: true },
  { id: 's7', code: 'S7', name: '작업 중단', description: '작업 중단 및 대기', active: true },
  { id: 's8', code: 'S8', name: '인력 부재', description: '작업자 교대 / 휴게 / 결원', active: true },
  { id: 's9', code: 'S9', name: '기타', description: '전력 / 환경 / 외부요인', active: true },
];
const defaultBottleneckCodes: BottleneckCodeV2[] = [
  { id: 'bn1', code: 'BN1', name: '전공정 지연 누적', description: '이전 공정의 산출 지연', severity: '높음', active: true },
  { id: 'bn2', code: 'BN2', name: '후공정 적체', description: 'WIP 과다 / 후공정 처리 한계', severity: '높음', active: true },
  { id: 'bn3', code: 'BN3', name: '설비 처리속도 한계', description: '장비 사양상 최대속도 도달', severity: '보통', active: true },
  { id: 'bn4', code: 'BN4', name: '셋업', description: '장비 셋업 빈발', severity: '보통', active: true },
  { id: 'bn5', code: 'BN5', name: '품질 검수 지연', description: '검수 단계 처리 지연', severity: '보통', active: true },
  { id: 'bn6', code: 'BN6', name: '운반 / 이송 지연', description: '공정 간 이동 시간 과다', severity: '낮음', active: true },
  { id: 'bn7', code: 'BN7', name: '기타', description: '기타 병목 요인', severity: '낮음', active: true },
];
const generateNextCode = (prefix: string, existing: { code: string }[]): string => {
  const nums = existing.map((c) => parseInt(c.code.replace(prefix, ''), 10)).filter((n) => !isNaN(n));
  return `${prefix}${nums.length > 0 ? Math.max(...nums) + 1 : 1}`;
};
const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const formatDate = (d: Date) => `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
const timeAgo = (date: Date): string => { const d=(Date.now()-date.getTime())/1000; if(d<60)return'방금 전'; if(d<3600)return`${Math.floor(d/60)}분 전`; if(d<86400)return`${Math.floor(d/3600)}시간 전`; if(d<604800)return`${Math.floor(d/86400)}일 전`; return formatDate(date); };

const Toggle: React.FC<{checked:boolean;onChange:(v:boolean)=>void}> = ({checked,onChange}) => (
  <button onClick={()=>onChange(!checked)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${checked?'bg-green-600':'bg-gray-700'}`} role="switch" aria-checked={checked}>
    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${checked?'translate-x-[18px]':'translate-x-1'}`}/>
  </button>
);
const SeveritySelector: React.FC<{value:Severity;onChange:(v:Severity)=>void}> = ({value,onChange}) => {
  const cm: Record<Severity,string> = {'높음':'text-red-400 border-red-900/40','보통':'text-amber-400 border-amber-900/40','낮음':'text-gray-400 border-gray-700/50'};
  return (<select value={value} onChange={(e)=>onChange(e.target.value as Severity)} className={`bg-gray-800/40 border rounded px-2 py-1 text-sm outline-none focus:border-blue-500/50 ${cm[value]}`}>
    <option value="높음" className="bg-gray-900 text-red-400">높음</option><option value="보통" className="bg-gray-900 text-amber-400">보통</option><option value="낮음" className="bg-gray-900 text-gray-400">낮음</option>
  </select>);
};
const EditableCell: React.FC<{value:string;onChange:(v:string)=>void;placeholder?:string;className?:string}> = ({value,onChange,placeholder,className=''}) => (
  <input type="text" value={value} onChange={(e)=>onChange(e.target.value)} placeholder={placeholder} className={`bg-transparent text-gray-200 hover:bg-gray-800/40 focus:bg-gray-800/60 px-2 py-1 rounded w-full outline-none focus:ring-1 focus:ring-blue-500/30 transition-colors text-sm placeholder:text-gray-600 ${className}`}/>
);
const SortableRow: React.FC<{id:string;disabled?:boolean;children:(h:React.HTMLAttributes<HTMLButtonElement>)=>React.ReactNode}> = ({id,disabled,children}) => {
  const {attributes,listeners,setNodeRef,transform,transition,isDragging} = useSortable({id});
  const style: React.CSSProperties = {transform:CSS.Transform.toString(transform),transition,opacity:isDragging?0.4:1,backgroundColor:isDragging?'rgba(59,130,246,0.08)':undefined,position:isDragging?'relative':undefined,zIndex:isDragging?10:undefined};
  return (<tr ref={setNodeRef} style={style} {...attributes} className={`group border-b border-gray-800/40 hover:bg-gray-800/20 transition-colors ${disabled?'opacity-50':''}`}>{children((listeners||{}) as React.HTMLAttributes<HTMLButtonElement>)}</tr>);
};
const DragHandle: React.FC<{handleProps:React.HTMLAttributes<HTMLButtonElement>}> = ({handleProps}) => (
  <button {...handleProps} className="opacity-30 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing text-gray-500 hover:text-gray-200 p-1" title="드래그하여 순서 변경" onClick={(e)=>e.preventDefault()}><GripVertical className="w-4 h-4"/></button>
);
const HistoryPanel: React.FC<{open:boolean;onClose:()=>void;history:CodeHistoryEntry[];loading:boolean}> = ({open,onClose,history,loading}) => {
  if(!open) return null;
  const al: Record<string,string> = {save:'저장',restore:'기본값 복원',init:'초기화'};
  const ac: Record<string,string> = {save:'bg-blue-500/20 text-blue-300 border-blue-500/30',restore:'bg-amber-500/20 text-amber-300 border-amber-500/30',init:'bg-gray-500/20 text-gray-300 border-gray-500/30'};
  return (<><div className="fixed inset-0 bg-black/60 z-40" onClick={onClose}/><div className="fixed top-0 right-0 h-full w-full max-w-md bg-gray-950 border-l border-gray-800 z-50 overflow-y-auto shadow-2xl">
    <div className="sticky top-0 bg-gray-950 p-4 border-b border-gray-800 flex items-center justify-between z-10"><h3 className="font-bold text-gray-100 flex items-center gap-2"><Clock className="w-4 h-4 text-blue-400"/>변경 이력{history.length>0&&<span className="text-xs text-gray-500 font-normal">({history.length})</span>}</h3><button onClick={onClose} className="text-gray-400 hover:text-gray-200 p-1 hover:bg-gray-800 rounded transition-colors"><X className="w-5 h-5"/></button></div>
    <div className="p-4 space-y-2">{loading?(<div className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-500"/><p className="text-xs text-gray-500 mt-2">이력 로딩 중...</p></div>):history.length===0?(<div className="text-center py-12"><Clock className="w-10 h-10 mx-auto text-gray-700 mb-3"/><p className="text-sm text-gray-500">아직 변경 이력이 없습니다.</p></div>):history.map((e)=>(<div key={e.id} className="bg-gray-900 rounded-lg p-3 border border-gray-800 hover:border-gray-700 transition-colors"><div className="flex items-center justify-between mb-2"><span className={`text-[10px] font-bold px-2 py-0.5 rounded border tracking-wider ${ac[e.action]||ac.init}`}>{al[e.action]||e.action}</span><span className="text-[11px] text-gray-500" title={formatDate(e.timestamp)}>{timeAgo(e.timestamp)}</span></div><p className="text-sm text-gray-200 mb-1.5 leading-relaxed">{e.summary}</p><div className="flex items-center gap-1.5 text-[11px] text-gray-500"><User className="w-3 h-3"/><span>{e.user}</span></div></div>))}</div>
  </div></>);
};

export default function CodesPage() {
  const [stopCodes,setStopCodes] = useState<StopCodeV2[]>([]);
  const [bottleneckCodes,setBottleneckCodes] = useState<BottleneckCodeV2[]>([]);
  const [baselineStop,setBaselineStop] = useState<StopCodeV2[]>([]);
  const [baselineBn,setBaselineBn] = useState<BottleneckCodeV2[]>([]);
  const [loading,setLoading] = useState(true);
  const [loadError,setLoadError] = useState<string|null>(null);
  const [saving,setSaving] = useState(false);
  const [userName,setUserName] = useState('관리자');
  const [showHistory,setShowHistory] = useState(false);
  const [history,setHistory] = useState<CodeHistoryEntry[]>([]);
  const [historyLoading,setHistoryLoading] = useState(false);
  const hasChanges = useMemo(()=>JSON.stringify(stopCodes)!==JSON.stringify(baselineStop)||JSON.stringify(bottleneckCodes)!==JSON.stringify(baselineBn),[stopCodes,bottleneckCodes,baselineStop,baselineBn]);

  useEffect(()=>{
    if(typeof window!=='undefined'){const s=localStorage.getItem('codesPage_userName');if(s)setUserName(s);}
    (async()=>{try{const[sc,bc]=await Promise.all([loadStopCodes(),loadBottleneckCodes()]);const s=sc&&sc.length>0?sc:defaultStopCodes;const b=bc&&bc.length>0?bc:defaultBottleneckCodes;setStopCodes(s);setBottleneckCodes(b);setBaselineStop(s);setBaselineBn(b);}catch(err){console.error('Firebase 로드 실패:',err);setLoadError(err instanceof Error?err.message:String(err));setStopCodes(defaultStopCodes);setBottleneckCodes(defaultBottleneckCodes);setBaselineStop(defaultStopCodes);setBaselineBn(defaultBottleneckCodes);}finally{setLoading(false);}})();
  },[]);
  useEffect(()=>{if(typeof window!=='undefined')localStorage.setItem('codesPage_userName',userName);},[userName]);
  useEffect(()=>{const h=(e:BeforeUnloadEvent)=>{if(hasChanges){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',h);return()=>window.removeEventListener('beforeunload',h);},[hasChanges]);

  const sensors = useSensors(useSensor(PointerSensor,{activationConstraint:{distance:5}}),useSensor(KeyboardSensor,{coordinateGetter:sortableKeyboardCoordinates}));
  const handleStopDragEnd = (ev:DragEndEvent) => {const{active,over}=ev;if(over&&active.id!==over.id){const oi=stopCodes.findIndex(c=>c.id===active.id),ni=stopCodes.findIndex(c=>c.id===over.id);if(oi!==-1&&ni!==-1)setStopCodes(arrayMove(stopCodes,oi,ni));}};
  const handleBnDragEnd = (ev:DragEndEvent) => {const{active,over}=ev;if(over&&active.id!==over.id){const oi=bottleneckCodes.findIndex(c=>c.id===active.id),ni=bottleneckCodes.findIndex(c=>c.id===over.id);if(oi!==-1&&ni!==-1)setBottleneckCodes(arrayMove(bottleneckCodes,oi,ni));}};

  const addStopCode = () => setStopCodes([...stopCodes,{id:generateId(),code:generateNextCode('S',stopCodes),name:'',description:'',active:true}]);
  const deleteStopCode = (id:string) => {if(confirm('이 코드를 삭제하시겠습니까?'))setStopCodes(stopCodes.filter(c=>c.id!==id));};
  const updateStopCode = <K extends keyof StopCodeV2>(id:string,key:K,value:StopCodeV2[K]) => setStopCodes(stopCodes.map(c=>c.id===id?{...c,[key]:value}:c));
  const addBottleneckCode = () => setBottleneckCodes([...bottleneckCodes,{id:generateId(),code:generateNextCode('BN',bottleneckCodes),name:'',description:'',severity:'보통',active:true}]);
  const deleteBottleneckCode = (id:string) => {if(confirm('이 코드를 삭제하시겠습니까?'))setBottleneckCodes(bottleneckCodes.filter(c=>c.id!==id));};
  const updateBottleneckCode = <K extends keyof BottleneckCodeV2>(id:string,key:K,value:BottleneckCodeV2[K]) => setBottleneckCodes(bottleneckCodes.map(c=>c.id===id?{...c,[key]:value}:c));

  const calcSummary = useCallback(():string=>{
    const p:string[]=[];
    const sA=stopCodes.filter(c=>!baselineStop.find(b=>b.id===c.id)).length,sR=baselineStop.filter(c=>!stopCodes.find(b=>b.id===c.id)).length,sE=stopCodes.filter(c=>{const b=baselineStop.find(x=>x.id===c.id);return b&&JSON.stringify(b)!==JSON.stringify(c);}).length,sO=stopCodes.length===baselineStop.length&&sA===0&&sR===0&&stopCodes.some((c,i)=>baselineStop[i]?.id!==c.id);
    if(sA>0)p.push(`정지코드 ${sA}개 추가`);if(sR>0)p.push(`정지코드 ${sR}개 삭제`);if(sE>0)p.push(`정지코드 ${sE}개 수정`);if(sO)p.push('정지코드 순서 변경');
    const bA=bottleneckCodes.filter(c=>!baselineBn.find(b=>b.id===c.id)).length,bR=baselineBn.filter(c=>!bottleneckCodes.find(b=>b.id===c.id)).length,bE=bottleneckCodes.filter(c=>{const b=baselineBn.find(x=>x.id===c.id);return b&&JSON.stringify(b)!==JSON.stringify(c);}).length,bO=bottleneckCodes.length===baselineBn.length&&bA===0&&bR===0&&bottleneckCodes.some((c,i)=>baselineBn[i]?.id!==c.id);
    if(bA>0)p.push(`병목코드 ${bA}개 추가`);if(bR>0)p.push(`병목코드 ${bR}개 삭제`);if(bE>0)p.push(`병목코드 ${bE}개 수정`);if(bO)p.push('병목코드 순서 변경');
    return p.length>0?p.join(', '):'변경 없음';
  },[stopCodes,bottleneckCodes,baselineStop,baselineBn]);

  const handleSave = async()=>{if(!hasChanges||saving)return;if(!userName.trim()){alert('상단의 [작업자] 이름을 입력해주세요.');return;}try{setSaving(true);const summary=calcSummary();await Promise.all([saveStopCodes(stopCodes),saveBottleneckCodes(bottleneckCodes),addHistoryEntry({user:userName,action:'save',summary})]);setBaselineStop(stopCodes);setBaselineBn(bottleneckCodes);alert(`✅ 저장 완료!\n\n${summary}`);}catch(err){console.error('저장 실패:',err);alert(`❌ 저장 실패\n\n${err instanceof Error?err.message:String(err)}`);}finally{setSaving(false);}};
  const handleReset = ()=>{if(!confirm('모든 코드를 기본값으로 복원하시겠습니까?\n변경된 내용은 사라집니다.'))return;setStopCodes(defaultStopCodes);setBottleneckCodes(defaultBottleneckCodes);};
  const handleShowHistory = async()=>{setShowHistory(true);setHistoryLoading(true);try{setHistory(await getHistory(50));}catch{setHistory([]);}finally{setHistoryLoading(false);}};

  if(loading) return (<div className="flex-1 flex items-center justify-center min-h-full"><div className="text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-400 mb-3"/><p className="text-sm text-gray-400">데이터를 불러오는 중...</p></div></div>);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div><h1 className="text-2xl font-bold text-gray-100">정지/병목 코드 관리</h1><p className="text-sm text-gray-500 mt-1">코드를 추가, 수정, 삭제하고 활성/비활성 상태를 관리합니다{hasChanges&&<span className="ml-2 text-amber-400 font-medium">• 저장되지 않은 변경 사항이 있습니다</span>}</p></div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-gray-900 border border-gray-800 rounded px-2 py-1.5"><User className="w-3.5 h-3.5 text-gray-500"/><input type="text" value={userName} onChange={e=>setUserName(e.target.value)} placeholder="작업자" className="bg-transparent text-sm text-gray-200 w-20 outline-none placeholder:text-gray-600"/></div>
          <button onClick={handleShowHistory} className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-gray-900 hover:bg-gray-800 text-gray-300 font-medium transition-colors text-sm border border-gray-800"><Clock className="w-3.5 h-3.5"/>변경 이력</button>
          <button onClick={handleReset} className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-gray-900 hover:bg-gray-800 text-gray-300 font-medium transition-colors text-sm border border-gray-800"><RotateCcw className="w-3.5 h-3.5"/>기본값 복원</button>
          <button onClick={handleSave} disabled={!hasChanges||saving} className={`flex items-center gap-1.5 px-4 py-1.5 rounded font-medium transition-colors text-sm ${hasChanges&&!saving?'bg-blue-600 hover:bg-blue-500 text-white':'bg-blue-600/40 text-white/60 cursor-not-allowed'}`}>{saving?<Loader2 className="w-3.5 h-3.5 animate-spin"/>:<Save className="w-3.5 h-3.5"/>}{saving?'저장 중...':'저장'}</button>
        </div>
      </div>
      {loadError&&<div className="bg-red-950/30 border border-red-900/50 rounded-lg p-3 flex items-start gap-2"><AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0"/><div className="text-sm"><p className="text-red-300 font-medium">Firebase에서 데이터를 불러올 수 없어 기본값을 표시합니다.</p><p className="text-red-400/80 text-xs mt-1">에러: {loadError}</p></div></div>}
      <section className="bg-gray-900/60 rounded-lg border border-gray-800">
        <header className="flex items-center justify-between p-4 border-b border-gray-800"><h2 className="text-base font-bold text-gray-100 flex items-center gap-2"><Square className="w-4 h-4 text-gray-500"/>정지 코드 (Stop Codes)<span className="text-xs text-gray-500 font-normal ml-1">{stopCodes.length}개</span></h2><button onClick={addStopCode} className="flex items-center gap-1 px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm border border-gray-700 transition-colors"><Plus className="w-3.5 h-3.5"/>추가</button></header>
        <div className="overflow-x-auto"><table className="w-full"><thead><tr className="text-[11px] text-gray-500 uppercase tracking-wider border-b border-gray-800/60"><th className="w-10 py-2"></th><th className="text-left px-3 py-2 w-20">코드</th><th className="text-left px-3 py-2 w-44">명칭</th><th className="text-left px-3 py-2">설명</th><th className="text-center px-3 py-2 w-20">사용</th><th className="w-12 py-2"></th></tr></thead>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleStopDragEnd}><SortableContext items={stopCodes.map(c=>c.id)} strategy={verticalListSortingStrategy}><tbody>
            {stopCodes.map(code=>(<SortableRow key={code.id} id={code.id} disabled={!code.active}>{(hp)=>(<><td className="py-2 px-1 text-center"><DragHandle handleProps={hp}/></td><td className="px-3 py-2"><EditableCell value={code.code} onChange={v=>updateStopCode(code.id,'code',v)} placeholder="코드" className="font-mono font-medium w-16"/></td><td className="px-3 py-2"><EditableCell value={code.name} onChange={v=>updateStopCode(code.id,'name',v)} placeholder="명칭 입력"/></td><td className="px-3 py-2"><EditableCell value={code.description} onChange={v=>updateStopCode(code.id,'description',v)} placeholder="설명 입력" className="text-gray-400"/></td><td className="px-3 py-2"><div className="flex justify-center"><Toggle checked={code.active} onChange={v=>updateStopCode(code.id,'active',v)}/></div></td><td className="px-3 py-2"><button onClick={()=>deleteStopCode(code.id)} className="text-red-500/60 hover:text-red-500 transition-colors p-1" title="삭제"><Trash2 className="w-4 h-4"/></button></td></>)}</SortableRow>))}
            {stopCodes.length===0&&<tr><td colSpan={6} className="text-center text-gray-500 py-8 text-sm">등록된 정지 코드가 없습니다.</td></tr>}
          </tbody></SortableContext></DndContext>
        </table></div>
      </section>
      <section className="bg-gray-900/60 rounded-lg border border-gray-800">
        <header className="flex items-center justify-between p-4 border-b border-gray-800"><h2 className="text-base font-bold text-gray-100 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500/80"/>병목 코드 (Bottleneck Codes)<span className="text-xs text-gray-500 font-normal ml-1">{bottleneckCodes.length}개</span></h2><button onClick={addBottleneckCode} className="flex items-center gap-1 px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm border border-gray-700 transition-colors"><Plus className="w-3.5 h-3.5"/>추가</button></header>
        <div className="overflow-x-auto"><table className="w-full"><thead><tr className="text-[11px] text-gray-500 uppercase tracking-wider border-b border-gray-800/60"><th className="w-10 py-2"></th><th className="text-left px-3 py-2 w-20">코드</th><th className="text-left px-3 py-2 w-44">명칭</th><th className="text-left px-3 py-2">설명</th><th className="text-center px-3 py-2 w-24">심각도</th><th className="text-center px-3 py-2 w-20">사용</th><th className="w-12 py-2"></th></tr></thead>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleBnDragEnd}><SortableContext items={bottleneckCodes.map(c=>c.id)} strategy={verticalListSortingStrategy}><tbody>
            {bottleneckCodes.map(code=>(<SortableRow key={code.id} id={code.id} disabled={!code.active}>{(hp)=>(<><td className="py-2 px-1 text-center"><DragHandle handleProps={hp}/></td><td className="px-3 py-2"><EditableCell value={code.code} onChange={v=>updateBottleneckCode(code.id,'code',v)} placeholder="코드" className="font-mono font-medium w-16"/></td><td className="px-3 py-2"><EditableCell value={code.name} onChange={v=>updateBottleneckCode(code.id,'name',v)} placeholder="명칭 입력"/></td><td className="px-3 py-2"><EditableCell value={code.description} onChange={v=>updateBottleneckCode(code.id,'description',v)} placeholder="설명 입력" className="text-gray-400"/></td><td className="px-3 py-2"><div className="flex justify-center"><SeveritySelector value={code.severity} onChange={v=>updateBottleneckCode(code.id,'severity',v)}/></div></td><td className="px-3 py-2"><div className="flex justify-center"><Toggle checked={code.active} onChange={v=>updateBottleneckCode(code.id,'active',v)}/></div></td><td className="px-3 py-2"><button onClick={()=>deleteBottleneckCode(code.id)} className="text-red-500/60 hover:text-red-500 transition-colors p-1" title="삭제"><Trash2 className="w-4 h-4"/></button></td></>)}</SortableRow>))}
            {bottleneckCodes.length===0&&<tr><td colSpan={7} className="text-center text-gray-500 py-8 text-sm">등록된 병목 코드가 없습니다.</td></tr>}
          </tbody></SortableContext></DndContext>
        </table></div>
      </section>
      <div className="text-xs text-gray-600 pb-4">💡 좌측 ⠿⠿ 아이콘을 <strong>드래그</strong>해서 순서를 변경할 수 있습니다. 코드/명칭/설명은 클릭해서 바로 수정 가능합니다.</div>
      <HistoryPanel open={showHistory} onClose={()=>setShowHistory(false)} history={history} loading={historyLoading}/>
    </div>
  );
}
