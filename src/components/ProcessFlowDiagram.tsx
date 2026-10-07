// src/components/ProcessFlowDiagram.tsx
'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts';
import { Play, Pause, AlertCircle, ChevronRight, RefreshCw, AlertTriangle, X, Clock } from 'lucide-react';
import { subscribeMachines, MachineState, MachineHistoryEntry } from '@/lib/machine-service';
import { useMachineDefs, MachineDef } from '@/lib/machine-defs';
import { useStopCodes } from '@/lib/useStopCodes';

type Status = 'RUN' | 'IDLE' | 'STOP' | 'SETUP';
type DisplayStatus = 'RUN' | 'IDLE' | 'STOP';

// SETUP은 IDLE로 표시 (정지코드에 셋업 포함)
const toDisplay = (s: Status): DisplayStatus => (s === 'SETUP' ? 'IDLE' : s);

interface ProcessData {
  no: number; name: string; model: string; maker: string; status: Status;
  queue: number; queueCount: number; inProgress: number; completed: number;
  jobProgress: number; queueThreshold: number; initialElapsedSeconds: number;
  stopReason: string; dailyProduction: number; dailyTarget: number;
  bottleneckReason: string; history: MachineHistoryEntry[];
  group: string; equipmentGroup: string;
}

interface DynamicEquipmentGroup {
  id: string;
  name: string;
  machines: number[];
  processGroup: string;
}

const DEFAULT_QUEUE_THRESHOLD = 5000;

// 3가지 상태만 표시 (SETUP→IDLE 병합)
const statusConfig: Record<DisplayStatus, { banner:string; text:string; border:string; bar:string; icon:React.ComponentType<{className?:string}>|null }> = {
  RUN:  { banner:'bg-emerald-400', text:'text-emerald-950', border:'border-emerald-400/40', bar:'bg-emerald-400', icon:null },
  IDLE: { banner:'bg-amber-300',   text:'text-amber-950',   border:'border-amber-300/45',   bar:'bg-amber-300',   icon:null },
  STOP: { banner:'bg-rose-500',    text:'text-white',       border:'border-rose-500/70',    bar:'bg-rose-500',    icon:AlertTriangle },
};
const statusLabel: Record<DisplayStatus,string> = { RUN:'가동중', IDLE:'대기', STOP:'정지' };
const statusDot: Record<DisplayStatus,string> = { RUN:'bg-emerald-400', IDLE:'bg-amber-300', STOP:'bg-rose-500' };

// ============================================
// 유틸
// ============================================
function formatElapsed(s:number) { const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60; return`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`; }
function formatDuration(ms:number) { const s=Math.floor(ms/1000); if(s<60)return`${s}초`; if(s<3600)return`${Math.floor(s/60)}분 ${s%60}초`; return`${Math.floor(s/3600)}시간 ${Math.floor((s%3600)/60)}분`; }
const DAY_LABELS = ['화','수','목','금','토','일','월'];
function getLast7Days(base:number,seed:number) { return DAY_LABELS.map((day,i)=>({day,value:Math.round(base*((i===4||i===5)?0.28+((seed+i)%8)/100:0.9+((seed*3+i*17)%18)/100))})); }
function getMonthlyTotal(d:number,s:number) { return Math.round(d*20.5+s*211); }
function getAchievementRate(m:number,t:number) { return t<=0?0:Math.round((m/(t*30))*100); }

// 장비 초기 시뮬레이션 데이터 (Firebase에 상태가 없을 때)
function getDefaultProcessData(def: MachineDef): Omit<ProcessData, 'name' | 'model' | 'maker'> {
  const seed = def.no * 137;
  const statuses: Status[] = ['RUN', 'RUN', 'RUN', 'IDLE', 'IDLE', 'STOP'];
  const status = statuses[seed % statuses.length];
  return {
    no: def.no,
    status,
    queue: status === 'IDLE' ? 0 : (seed % 5000) + 500,
    queueCount: status === 'IDLE' ? 0 : (seed % 5) + 1,
    inProgress: status === 'RUN' ? (seed % 2000) + 200 : 0,
    completed: (seed % 8000) + 1000,
    jobProgress: status === 'RUN' ? (seed % 80) + 20 : 0,
    queueThreshold: DEFAULT_QUEUE_THRESHOLD,
    initialElapsedSeconds: (seed % 20000) + 300,
    stopReason: status === 'STOP' ? `S${(seed % 7) + 1}` : '',
    dailyProduction: (seed % 10000) + 2000,
    dailyTarget: (seed % 8000) + 3000,
    bottleneckReason: '',
    history: [],
    group: def.group,
    equipmentGroup: def.equipmentGroup || def.name.replace(/\s*\d+호기$/, '').replace(/\s+/g, ''),
  };
}

// ============================================
// 장비 카드
// ============================================
const ProcessCard: React.FC<{ process:ProcessData; onSelect?:(no:number)=>void }> = ({ process, onSelect }) => {
  const { codeMap: stopCodeNames } = useStopCodes();
  const ds = toDisplay(process.status);
  const cfg = statusConfig[ds];
  const StatusIcon = cfg.icon;
  const isStop = ds === 'STOP';
  const isRunning = ds === 'RUN';
  const displayProgress = isRunning ? process.jobProgress : 0;

  return (
    <div onClick={()=>onSelect?.(process.no)}
      className={`rounded-md overflow-hidden border ${cfg.border} bg-gray-900 flex flex-col cursor-pointer hover:brightness-110 hover:ring-1 hover:ring-white/20 transition ${isStop?'animate-stop-pulse':''}`}>
      <div className={`${cfg.banner} ${cfg.text} px-2.5 py-1 flex items-center justify-between text-[11px] font-bold ${isStop?'animate-stop-banner':''}`}>
        <span className="flex items-center gap-1 tracking-wide min-w-0 truncate">
          {StatusIcon&&<StatusIcon className="w-3 h-3 shrink-0"/>}
          <span>{ds}</span>
          {isStop&&process.stopReason&&<><span className="opacity-50">·</span><span className="font-semibold opacity-90 truncate">{process.stopReason} {stopCodeNames[process.stopReason]||''}</span></>}
        </span>
        <span className="font-mono opacity-70 shrink-0 ml-1">{String(process.no).padStart(2,'0')}</span>
      </div>
      <div className="p-2.5 flex-1 flex flex-col">
        <h3 className="text-gray-100 text-[13px] font-semibold mb-2 truncate" title={process.name}>{process.name}</h3>
        <div className="mt-auto">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[9px] text-gray-500">진행률</span>
            <span className="text-[10px] font-bold text-gray-200 font-mono tabular-nums">{displayProgress}%</span>
          </div>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden mb-1.5">
            <div className={`h-full ${cfg.bar} rounded-full transition-all`} style={{width:`${displayProgress}%`}}/>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-gray-500">소요시간</span>
            <span className="text-[11px] font-bold text-gray-300 font-mono tabular-nums">{formatElapsed(process.initialElapsedSeconds)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================
// 장비군 컴포넌트
// ============================================
const EquipmentGroupComp: React.FC<{
  group: DynamicEquipmentGroup; machineMap: Record<number,ProcessData>; onSelect:(no:number)=>void; now:number;
}> = ({ group, machineMap, onSelect, now }) => {
  const machines = group.machines.map(no=>machineMap[no]).filter(Boolean);
  const totalQueue = machines.reduce((s,m)=>{ const ds=toDisplay(m.status); return s+(ds==='IDLE'?0:m.queue); },0);
  const totalQueueCount = machines.reduce((s,m)=>{ const ds=toDisplay(m.status); return s+(ds==='IDLE'?0:m.queueCount); },0);
  const isOverloaded = totalQueue >= DEFAULT_QUEUE_THRESHOLD;

  const overloadStartRef = useRef<number|null>(null);
  if (isOverloaded && overloadStartRef.current === null) {
    overloadStartRef.current = Date.now();
  } else if (!isOverloaded && overloadStartRef.current !== null) {
    overloadStartRef.current = null;
  }
  const overloadSeconds = overloadStartRef.current !== null
    ? Math.max(0, Math.floor((now - overloadStartRef.current) / 1000))
    : 0;

  return (
    <div className="min-w-[170px] shrink-0">
      <div className={`px-1.5 py-1 rounded-t border border-b-0 border-gray-700/50 bg-gray-900/80 ${isOverloaded?'animate-overload-box':''}`}>
        <p className="text-[10px] font-bold text-gray-300 truncate">{group.name}</p>
        <div className="flex items-center gap-2 text-[9px] mt-0.5">
          <span className="text-amber-300">대기물량 <span className="font-bold font-mono">{totalQueue.toLocaleString()}</span></span>
          <span className="text-sky-300">건수 <span className="font-bold font-mono">{totalQueueCount}</span></span>
        </div>
        {isOverloaded && (
          <div className="flex items-center gap-1 mt-1 pt-1 border-t border-amber-500/20">
            <AlertTriangle className="w-2.5 h-2.5 text-amber-400 shrink-0" />
            <span className="text-[8px] text-amber-400/80">초과</span>
            <span className="text-[10px] font-bold text-amber-300 font-mono tabular-nums ml-auto">
              {formatElapsed(overloadSeconds)}
            </span>
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 gap-1 p-1 rounded-b border border-t-0 border-gray-700/50 bg-gray-950/40">
        {machines.map(m=><ProcessCard key={m.no} process={m} onSelect={onSelect}/>)}
      </div>
    </div>
  );
};

// ============================================
// 상세 패널
// ============================================
const InfoRow: React.FC<{label:string;children:React.ReactNode}> = ({label,children}) => (
  <div className="flex items-center justify-between py-3.5"><span className="text-sm text-gray-400">{label}</span><span className="text-sm">{children}</span></div>
);
const DetailPanel: React.FC<{process:ProcessData;onClose:()=>void;now:number}> = ({process,onClose,now}) => {
  const { codeMap: stopCodeNames } = useStopCodes();
  const ds = toDisplay(process.status);
  const last7 = useMemo(()=>getLast7Days(process.dailyProduction,process.no),[process]);
  const monthly = useMemo(()=>getMonthlyTotal(process.dailyProduction,process.no),[process]);
  const rate = getAchievementRate(monthly,process.dailyTarget);

  const historyWithDuration = useMemo(()=>{
    return process.history.map((h,i)=>{
      const nextTs = i===0 ? now : process.history[i-1].timestamp;
      const duration = nextTs - h.timestamp;
      return { ...h, duration };
    });
  },[process.history, now]);

  return (<>
    <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose}/>
    <div className="fixed top-0 right-0 h-full w-full max-w-md bg-gray-950 border-l border-gray-800 z-50 overflow-y-auto shadow-2xl">
      <div className="p-5 border-b border-gray-800 sticky top-0 bg-gray-950 z-10">
        <div className="flex items-start justify-between">
          <div><h2 className="text-xl font-bold text-gray-100">{process.name}</h2>
            <p className="text-xs text-gray-500 mt-1 tracking-wide">NO {process.no} · {process.model||'-'} · {process.maker||'-'} · {process.group}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200 p-1 hover:bg-gray-800 rounded transition-colors"><X className="w-5 h-5"/></button>
        </div>
      </div>
      <div className="px-5 divide-y divide-gray-800/60">
        <InfoRow label="금일 생산량"><span className="text-xl font-bold text-white">{process.dailyProduction.toLocaleString()}</span></InfoRow>
        <InfoRow label="일 목표"><span className="text-gray-300">{process.dailyTarget.toLocaleString()}</span></InfoRow>
        <InfoRow label="현재 상태"><span className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${statusDot[ds]}`}/><span className="text-gray-200">{statusLabel[ds]}</span></span></InfoRow>
        <InfoRow label="금일 정지 사유">{process.stopReason?(<span className="flex items-center gap-1.5"><span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-xs font-medium border border-indigo-500/30">{process.stopReason}</span><span className="text-xs text-gray-400">{stopCodeNames[process.stopReason]||''}</span></span>):(<span className="text-gray-500">없음</span>)}</InfoRow>
      </div>

      {historyWithDuration.length > 0 && (
        <div className="px-5 pt-4 pb-2">
          <h3 className="text-sm font-bold text-gray-200 mb-2 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-gray-500"/>상태 변경 이력</h3>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {historyWithDuration.slice(0,30).map((h,i)=>{
              const cMap: Record<string,string> = { RUN:'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', IDLE:'bg-amber-400/15 text-amber-300 border-amber-400/30', STOP:'bg-rose-500/15 text-rose-300 border-rose-500/30', SETUP:'bg-sky-500/15 text-sky-300 border-sky-500/30' };
              return (
                <div key={i} className="flex items-center gap-2 py-1.5 px-2 rounded bg-gray-900/40">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${cMap[h.status]||cMap.IDLE}`}>{h.status==='SETUP'?'CANCEL':h.status}</span>
                  {h.stopCode&&<span className="text-[11px] text-rose-400">{h.stopCode} {stopCodeNames[h.stopCode]||''}</span>}
                  <span className="text-[11px] text-gray-500 ml-auto font-mono">{h.time}</span>
                  <span className="text-[10px] text-gray-600 font-mono">{formatDuration(h.duration)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="px-5 pt-5 pb-2">
        <h3 className="text-sm font-bold text-gray-200 mb-3">최근 7일 생산량</h3>
        <ResponsiveContainer width="100%" height={210}>
          <BarChart data={last7} margin={{top:5,right:5,bottom:0,left:-12}}>
            <XAxis dataKey="day" tick={{fill:'#9ca3af',fontSize:12}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fill:'#6b7280',fontSize:11}} axisLine={false} tickLine={false}/>
            <Tooltip contentStyle={{backgroundColor:'#111827',border:'1px solid #1f2937',borderRadius:8,color:'#f3f4f6'}} cursor={{fill:'rgba(255,255,255,0.04)'}} formatter={(v:number)=>[`${v.toLocaleString()}매`,'생산량']}/>
            <Bar dataKey="value" radius={[4,4,0,0]}>{last7.map((d,i)=>(<Cell key={i} fill={(i===4||i===5)?'#3b82f6':'#60a5fa'}/>))}</Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="px-5 pb-6 pt-2 grid grid-cols-2 gap-3">
        <div className="bg-gray-900 rounded-lg p-4 border border-gray-800"><p className="text-xs text-gray-500 mb-1">최근 30일 누적</p><p className="text-2xl font-bold text-gray-100">{monthly.toLocaleString()}</p></div>
        <div className="bg-gray-900 rounded-lg p-4 border border-gray-800"><p className="text-xs text-gray-500 mb-1">목표 달성률</p><p className={`text-2xl font-bold ${rate>=100?'text-emerald-300':rate>=80?'text-gray-100':'text-amber-300'}`}>{rate}%</p></div>
      </div>
    </div>
  </>);
};

// ============================================
// 화살표 / 그룹박스
// ============================================
const Arrow: React.FC<{size?:'sm'|'lg'}> = ({size='sm'}) => (
  <div className="flex items-center justify-center shrink-0"><ChevronRight className={`${size==='lg'?'w-7 h-7':'w-5 h-5'} text-gray-600`}/></div>
);

// ============================================
// 공정 그룹 색상
// ============================================
const processGroupColors: Record<string, string> = {
  '내지': 'text-sky-300',
  '표지': 'text-pink-300',
  '제본': 'text-sky-300',
  '포장': 'text-cyan-300',
};
const PROCESS_GROUP_ORDER = ['내지', '표지', '제본', '포장'];

// ============================================
// 메인 컴포넌트
// ============================================
const ProcessFlowDiagram: React.FC = () => {
  const [selectedNo, setSelectedNo] = useState<number|null>(null);
  const [now, setNow] = useState(Date.now());
  const mountTimeRef = useRef(Date.now());
  const [firebaseStates, setFirebaseStates] = useState<Record<number,MachineState>>({});
  const { defs: machineDefs, allDefs } = useMachineDefs();

  useEffect(()=>{ const i=setInterval(()=>setNow(Date.now()),1000); return()=>clearInterval(i); },[]);
  useEffect(()=>{ const u=subscribeMachines(s=>setFirebaseStates(s)); return u; },[]);

  // 장비 정의에서 동적으로 장비군 생성
  const dynamicGroups: DynamicEquipmentGroup[] = useMemo(() => {
    const groupMap = new Map<string, { name: string; machines: number[]; processGroup: string }>();

    allDefs.forEach(def => {
      const eqGroup = def.equipmentGroup || def.name.replace(/\s*\d+호기$/, '').replace(/\s+/g, '');
      const key = `${def.group}__${eqGroup}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, { name: eqGroup, machines: [], processGroup: def.group });
      }
      groupMap.get(key)!.machines.push(def.no);
    });

    // 정렬: group 순서(내지→표지→제본→포장) → 장비번호 순
    const result: DynamicEquipmentGroup[] = [];
    groupMap.forEach((val, key) => {
      val.machines.sort((a, b) => a - b);
      result.push({ id: key, ...val });
    });
    result.sort((a, b) => {
      const aIdx = PROCESS_GROUP_ORDER.indexOf(a.processGroup);
      const bIdx = PROCESS_GROUP_ORDER.indexOf(b.processGroup);
      if (aIdx !== bIdx) return aIdx - bIdx;
      return Math.min(...a.machines) - Math.min(...b.machines);
    });
    return result;
  }, [allDefs]);

  // 공정별 장비군 묶기
  const groupsByProcess = useMemo(() => {
    const map: Record<string, DynamicEquipmentGroup[]> = {};
    PROCESS_GROUP_ORDER.forEach(pg => { map[pg] = []; });
    dynamicGroups.forEach(g => {
      if (!map[g.processGroup]) map[g.processGroup] = [];
      map[g.processGroup].push(g);
    });
    return map;
  }, [dynamicGroups]);

  // 프로세스 데이터 생성
  const p = useMemo(()=>{
    const map: Record<number,ProcessData> = {};
    allDefs.forEach(def => {
      const defaults = getDefaultProcessData(def);
      const fb = firebaseStates[def.no];
      const base: ProcessData = {
        ...defaults,
        name: def.name,
        model: def.model,
        maker: def.maker,
        group: def.group,
        equipmentGroup: def.equipmentGroup || def.name.replace(/\s*\d+호기$/, '').replace(/\s+/g, ''),
      };
      if(fb){
        const elapsed = Math.max(0,Math.floor((now-fb.statusChangedAt.getTime())/1000));
        map[def.no] = {...base, status:fb.status, stopReason:fb.stopReason, initialElapsedSeconds:elapsed, history:fb.history||[],
          queue:toDisplay(fb.status)==='IDLE'?0:base.queue, queueCount:toDisplay(fb.status)==='IDLE'?0:base.queueCount,
          inProgress:toDisplay(fb.status)==='RUN'?base.inProgress:0, jobProgress:toDisplay(fb.status)==='RUN'?base.jobProgress:0 };
      } else {
        const elapsed = base.initialElapsedSeconds+Math.floor((now-mountTimeRef.current)/1000);
        map[def.no] = {...base, initialElapsedSeconds:elapsed};
      }
    });
    return map;
  },[firebaseStates,now,allDefs]);

  const totalMachines = allDefs.length;

  // 3상태 카운트
  const statusCounts = useMemo(()=>{
    const c = {RUN:0,IDLE:0,STOP:0};
    Object.values(p).forEach(proc=>{ c[toDisplay(proc.status)]++; });
    return c;
  },[p]);

  // 대기물량 초과 장비군 수
  const overloadedGroupCount = useMemo(()=>{
    return dynamicGroups.filter(g=>{
      const total = g.machines.reduce((s,no)=>{
        const m = p[no];
        if(!m) return s;
        return s + (toDisplay(m.status)==='IDLE' ? 0 : m.queue);
      },0);
      return total >= DEFAULT_QUEUE_THRESHOLD;
    }).length;
  },[p, dynamicGroups]);

  const totals = useMemo(()=>{
    let queue=0,queueCount=0,completed=0;
    Object.values(p).forEach(proc=>{
      const ds=toDisplay(proc.status);
      queue+=ds==='IDLE'?0:proc.queue;
      queueCount+=ds==='IDLE'?0:proc.queueCount;
      completed+=proc.completed;
    });
    return {queue,queueCount,completed};
  },[p]);

  useEffect(()=>{ const h=(e:KeyboardEvent)=>{if(e.key==='Escape')setSelectedNo(null);}; window.addEventListener('keydown',h); return()=>window.removeEventListener('keydown',h); },[]);

  // 내지/표지를 병렬로 렌더링할지 여부
  const hasNaeji = (groupsByProcess['내지'] || []).length > 0;
  const hasPyoji = (groupsByProcess['표지'] || []).length > 0;
  const hasJebon = (groupsByProcess['제본'] || []).length > 0;
  const hasPojang = (groupsByProcess['포장'] || []).length > 0;

  return (
    <div className="flex flex-col gap-4 p-5 bg-black min-h-full">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">제작공정 흐름도</h2>
          <p className="text-xs text-gray-500 mt-1">
            내지 · 표지 (병렬) → 제본 → 포장 · 실시간 상태 모니터링
            {overloadedGroupCount > 0 && (
              <span className="ml-2 text-amber-400 font-medium">
                • 대기물량 초과 {overloadedGroupCount}개 장비군 (기준 {DEFAULT_QUEUE_THRESHOLD.toLocaleString()})
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[11px]">
          <Legend color="emerald" label="RUN"/><Legend color="amber" label="IDLE"/><Legend color="rose" label="STOP" pulse/>
          <button className="flex items-center gap-1.5 px-2.5 py-1 ml-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium transition-colors text-[11px]"><RefreshCw className="w-3 h-3"/>새로고침</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatusCount icon={Play} label="가동 중" count={statusCounts.RUN} total={totalMachines} color="emerald"/>
        <StatusCount icon={Pause} label="대기" count={statusCounts.IDLE} color="amber"/>
        <StatusCount icon={AlertCircle} label="정지" count={statusCounts.STOP} color="rose" pulse/>
      </div>

      {/* 메인 흐름도 — 동적 생성 */}
      <div className="flex-1 overflow-x-auto pb-2 pt-1">
        <div className="flex items-start gap-0 mt-2">

          {/* 내지 + 표지 (병렬) */}
          {(hasNaeji || hasPyoji) && (
            <div className="flex flex-col gap-2 shrink-0">
              {hasNaeji && (
                <div className="relative rounded-lg border border-dashed border-gray-700 px-2 pt-4 pb-2">
                  <span className={`absolute -top-2.5 left-3 px-2 bg-black text-[10px] font-bold tracking-wider ${processGroupColors['내지']}`}>내지</span>
                  <div className="flex items-start gap-1.5">
                    {groupsByProcess['내지'].map((g, i) => (
                      <React.Fragment key={g.id}>
                        {i > 0 && <Arrow />}
                        <EquipmentGroupComp group={g} machineMap={p} onSelect={setSelectedNo} now={now} />
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              )}
              {hasPyoji && (
                <div className="relative rounded-lg border border-dashed border-gray-700 px-2 pt-4 pb-2">
                  <span className={`absolute -top-2.5 left-3 px-2 bg-black text-[10px] font-bold tracking-wider ${processGroupColors['표지']}`}>표지</span>
                  <div className="flex items-start gap-1.5">
                    {groupsByProcess['표지'].map((g, i) => (
                      <React.Fragment key={g.id}>
                        {i > 0 && <Arrow />}
                        <EquipmentGroupComp group={g} machineMap={p} onSelect={setSelectedNo} now={now} />
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {(hasNaeji || hasPyoji) && (hasJebon || hasPojang) && <Arrow size="lg" />}

          {/* 제본 */}
          {hasJebon && (
            <div className="relative rounded-lg border border-dashed border-gray-700 px-2 pt-4 pb-2 shrink-0">
              <span className={`absolute -top-2.5 left-3 px-2 bg-black text-[10px] font-bold tracking-wider ${processGroupColors['제본']}`}>제본</span>
              <div className="flex flex-col gap-1.5">
                {groupsByProcess['제본'].map(g => (
                  <EquipmentGroupComp key={g.id} group={g} machineMap={p} onSelect={setSelectedNo} now={now} />
                ))}
              </div>
            </div>
          )}

          {hasJebon && hasPojang && <Arrow size="lg" />}

          {/* 포장 */}
          {hasPojang && (
            <div className="relative rounded-lg border border-dashed border-gray-700 px-2 pt-4 pb-2 shrink-0">
              <span className={`absolute -top-2.5 left-3 px-2 bg-black text-[10px] font-bold tracking-wider ${processGroupColors['포장']}`}>포장</span>
              <div className="flex flex-col gap-1.5">
                {groupsByProcess['포장'].map(g => (
                  <EquipmentGroupComp key={g.id} group={g} machineMap={p} onSelect={setSelectedNo} now={now} />
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <TotalCard label="총 대기 물량" value={totals.queue} color="amber" border="border-l-amber-300/70"/>
        <TotalCard label="총 대기 건수" value={totals.queueCount} unit="건" color="sky" border="border-l-sky-400/70"/>
        <TotalCard label="전 공정 누적 제작완료" value={totals.completed} unit="매" color="emerald" border="border-l-emerald-400/70"/>
      </div>

      {selectedNo!==null&&p[selectedNo]&&<DetailPanel process={p[selectedNo]} onClose={()=>setSelectedNo(null)} now={now}/>}
    </div>
  );
};

// ============================================
// 보조 컴포넌트
// ============================================
type PastelColor = 'emerald'|'amber'|'rose'|'sky';
const Legend: React.FC<{color:PastelColor;label:string;pulse?:boolean}> = ({color,label,pulse}) => {
  const m:Record<PastelColor,string> = {emerald:'bg-emerald-400/10 border-emerald-400/30 text-emerald-300',amber:'bg-amber-300/10 border-amber-300/30 text-amber-200',rose:'bg-rose-400/10 border-rose-400/30 text-rose-300',sky:'bg-sky-400/10 border-sky-400/30 text-sky-300'};
  const d:Record<PastelColor,string> = {emerald:'bg-emerald-400',amber:'bg-amber-300',rose:'bg-rose-400',sky:'bg-sky-400'};
  return (<span className={`flex items-center gap-1 px-1.5 py-0.5 rounded border ${m[color]} font-medium`}><span className={`w-1.5 h-1.5 rounded-full ${d[color]} ${pulse?'animate-pulse':''}`}/>{label}</span>);
};
const StatusCount: React.FC<{icon:React.ComponentType<{className?:string}>;label:string;count:number;total?:number;color:PastelColor;pulse?:boolean}> = ({icon:Icon,label,count,total,color,pulse}) => {
  const bg:Record<PastelColor,string> = {emerald:'bg-emerald-400/15 text-emerald-300',amber:'bg-amber-300/15 text-amber-200',rose:'bg-rose-400/15 text-rose-300',sky:'bg-sky-400/15 text-sky-300'};
  return (<div className={`bg-gray-900 rounded-lg p-3 border border-gray-800 flex items-center gap-3 ${pulse&&count>0?'animate-stop-pulse':''}`}>
    <div className={`w-10 h-10 rounded flex items-center justify-center ${bg[color]}`}><Icon className="w-5 h-5"/></div>
    <div><p className="text-xl font-bold text-gray-100 leading-tight">{count}{total!==undefined&&<span className="text-xs text-gray-500 font-normal ml-1">/ {total}</span>}</p><p className="text-[11px] text-gray-400">{label}</p></div>
  </div>);
};
const TotalCard: React.FC<{label:string;value:number;unit?:string;color?:'white'|'amber'|'rose'|'sky'|'emerald';border?:string}> = ({label,value,unit,color='white',border=''}) => {
  const cm = {white:'text-gray-100',amber:'text-amber-200',rose:'text-rose-300',sky:'text-sky-200',emerald:'text-emerald-200'};
  return (<div className={`bg-gray-900 rounded-lg px-4 py-3 border border-gray-800 ${border?`border-l-4 ${border}`:''}`}><p className="text-xs text-gray-500 mb-1">{label}</p><p className={`text-2xl font-bold ${cm[color]}`}>{value.toLocaleString()}{unit&&<span className="text-sm text-gray-500 font-normal ml-1">{unit}</span>}</p></div>);
};

export default ProcessFlowDiagram;
