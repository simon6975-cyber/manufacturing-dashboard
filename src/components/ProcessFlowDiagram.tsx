// src/components/ProcessFlowDiagram.tsx
'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts';
import { Play, Pause, AlertCircle, ChevronRight, RefreshCw, AlertTriangle, X, Clock } from 'lucide-react';
import { subscribeMachines, MachineState, MachineHistoryEntry } from '@/lib/machine-service';

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
}

const DEFAULT_QUEUE_THRESHOLD = 5000;

const stopCodeNames: Record<string, string> = {
  S1:'장비 셋팅',S2:'자재 준비',S3:'작업 준비',S4:'검수',S5:'예방 정비',
  S6:'설비 장애',S7:'작업 중단',S8:'인력 부재',S9:'기타',
};

// ============================================
// 장비군 정의
// ============================================
const EQUIPMENT_GROUPS = [
  { id:'continuous', name:'연속지출력기', machines:[1,2], processGroup:'내지' },
  { id:'r2c',        name:'R2C',         machines:[3,4], processGroup:'내지' },
  { id:'sheet',      name:'낱장출력',    machines:[5,6], processGroup:'표지' },
  { id:'coating',    name:'코팅',        machines:[7,8], processGroup:'표지' },
  { id:'epoxy',      name:'에폭시',      machines:[9],   processGroup:'표지' },
  { id:'cutting',    name:'수동재단',    machines:[10,11],processGroup:'표지' },
  { id:'binding',    name:'제본',        machines:[12,13,14],processGroup:'제본' },
  { id:'saddle',     name:'중철기',      machines:[15],  processGroup:'제본' },
  { id:'wing',       name:'날개접지기',  machines:[16],  processGroup:'제본' },
  { id:'exam',       name:'시험지접지기',machines:[17],  processGroup:'제본' },
  { id:'box',        name:'박스포장',    machines:[18],  processGroup:'포장' },
  { id:'pallet',     name:'댐지포장',    machines:[19],  processGroup:'포장' },
];

// ============================================
// 19개 공정 데이터
// ============================================
const processes: ProcessData[] = [
  { no:1, name:'연속지출력 1호기',model:'520HD+',maker:'SCREEN',status:'RUN',queue:3682,queueCount:3,inProgress:1280,completed:9318,jobProgress:65,queueThreshold:DEFAULT_QUEUE_THRESHOLD,initialElapsedSeconds:9252,stopReason:'S5',dailyProduction:13814,dailyTarget:13000,bottleneckReason:'',history:[] },
  { no:2, name:'연속지출력 2호기',model:'520HD+',maker:'SCREEN',status:'RUN',queue:6240,queueCount:5,inProgress:2388,completed:7939,jobProgress:42,queueThreshold:DEFAULT_QUEUE_THRESHOLD,initialElapsedSeconds:4530,stopReason:'',dailyProduction:12500,dailyTarget:13000,bottleneckReason:'BN2',history:[] },
  { no:3, name:'R2C 1호기',model:'S2020',maker:'TECHNAU',status:'RUN',queue:5340,queueCount:4,inProgress:1190,completed:5047,jobProgress:78,queueThreshold:DEFAULT_QUEUE_THRESHOLD,initialElapsedSeconds:13338,stopReason:'',dailyProduction:8200,dailyTarget:8000,bottleneckReason:'',history:[] },
  { no:4, name:'R2C 2호기',model:'S2320',maker:'TECHNAU',status:'IDLE',queue:0,queueCount:0,inProgress:0,completed:4239,jobProgress:0,queueThreshold:DEFAULT_QUEUE_THRESHOLD,initialElapsedSeconds:1425,stopReason:'S1',dailyProduction:7800,dailyTarget:8000,bottleneckReason:'BN1',history:[] },
  { no:5, name:'날장출력 1호기',model:'이리데스',maker:'FUJI FILM',status:'RUN',queue:1076,queueCount:2,inProgress:488,completed:2424,jobProgress:55,queueThreshold:DEFAULT_QUEUE_THRESHOLD,initialElapsedSeconds:2902,stopReason:'',dailyProduction:4100,dailyTarget:4000,bottleneckReason:'',history:[] },
  { no:6, name:'날장출력 2호기',model:'레보리아',maker:'FUJI FILM',status:'STOP',queue:2786,queueCount:3,inProgress:0,completed:714,jobProgress:0,queueThreshold:DEFAULT_QUEUE_THRESHOLD,initialElapsedSeconds:1091,stopReason:'S6',dailyProduction:2200,dailyTarget:4000,bottleneckReason:'',history:[] },
  { no:7, name:'코팅 1호기',model:'EUROLAM 540',maker:'GMP',status:'RUN',queue:598,queueCount:1,inProgress:800,completed:4402,jobProgress:88,queueThreshold:DEFAULT_QUEUE_THRESHOLD,initialElapsedSeconds:15308,stopReason:'',dailyProduction:6800,dailyTarget:6500,bottleneckReason:'',history:[] },
  { no:8, name:'코팅 2호기',model:'PROTOPIC 540',maker:'GMP',status:'STOP',queue:2471,queueCount:2,inProgress:0,completed:2529,jobProgress:0,queueThreshold:DEFAULT_QUEUE_THRESHOLD,initialElapsedSeconds:1975,stopReason:'S1',dailyProduction:3900,dailyTarget:5000,bottleneckReason:'',history:[] },
  { no:9, name:'에폭시',model:'DDC 810',maker:'DUPLO',status:'RUN',queue:664,queueCount:1,inProgress:361,completed:1336,jobProgress:72,queueThreshold:DEFAULT_QUEUE_THRESHOLD,initialElapsedSeconds:4124,stopReason:'',dailyProduction:2400,dailyTarget:2500,bottleneckReason:'',history:[] },
  { no:10,name:'수동재단 1호기',model:'POLAR 92',maker:'HEIDELBERG',status:'RUN',queue:5430,queueCount:4,inProgress:695,completed:3373,jobProgress:60,queueThreshold:DEFAULT_QUEUE_THRESHOLD,initialElapsedSeconds:8493,stopReason:'',dailyProduction:5600,dailyTarget:5500,bottleneckReason:'BN3',history:[] },
  { no:11,name:'수동재단 2호기',model:'C860',maker:'대호',status:'IDLE',queue:0,queueCount:0,inProgress:0,completed:2802,jobProgress:0,queueThreshold:DEFAULT_QUEUE_THRESHOLD,initialElapsedSeconds:687,stopReason:'',dailyProduction:4800,dailyTarget:5000,bottleneckReason:'',history:[] },
  { no:12,name:'제본 1호기',model:'BQ470/HT80',maker:'HORIZON',status:'RUN',queue:500,queueCount:1,inProgress:273,completed:1500,jobProgress:80,queueThreshold:DEFAULT_QUEUE_THRESHOLD,initialElapsedSeconds:14102,stopReason:'',dailyProduction:2700,dailyTarget:2800,bottleneckReason:'',history:[] },
  { no:13,name:'제본 2호기',model:'BQ470/HT80',maker:'HORIZON',status:'RUN',queue:712,queueCount:1,inProgress:143,completed:1288,jobProgress:90,queueThreshold:DEFAULT_QUEUE_THRESHOLD,initialElapsedSeconds:10099,stopReason:'',dailyProduction:2300,dailyTarget:2500,bottleneckReason:'',history:[] },
  { no:14,name:'제본 3호기',model:'BQ500/HT300',maker:'HORIZON',status:'STOP',queue:1818,queueCount:2,inProgress:0,completed:382,jobProgress:0,queueThreshold:DEFAULT_QUEUE_THRESHOLD,initialElapsedSeconds:2558,stopReason:'S7',dailyProduction:900,dailyTarget:2500,bottleneckReason:'',history:[] },
  { no:15,name:'중철기',model:'SPF-200A',maker:'HORIZON',status:'RUN',queue:589,queueCount:1,inProgress:322,completed:2911,jobProgress:75,queueThreshold:DEFAULT_QUEUE_THRESHOLD,initialElapsedSeconds:5631,stopReason:'',dailyProduction:4900,dailyTarget:5000,bottleneckReason:'',history:[] },
  { no:16,name:'날개접지기',model:'ZK320',maker:'',status:'STOP',queue:1327,queueCount:2,inProgress:0,completed:1173,jobProgress:0,queueThreshold:DEFAULT_QUEUE_THRESHOLD,initialElapsedSeconds:3074,stopReason:'S1',dailyProduction:2100,dailyTarget:3000,bottleneckReason:'',history:[] },
  { no:17,name:'시험지접지기',model:'CSMO',maker:'HUNKELER',status:'IDLE',queue:0,queueCount:0,inProgress:0,completed:522,jobProgress:0,queueThreshold:DEFAULT_QUEUE_THRESHOLD,initialElapsedSeconds:308,stopReason:'',dailyProduction:1100,dailyTarget:2000,bottleneckReason:'',history:[] },
  { no:18,name:'박스포장',model:'',maker:'',status:'RUN',queue:730,queueCount:1,inProgress:297,completed:770,jobProgress:50,queueThreshold:DEFAULT_QUEUE_THRESHOLD,initialElapsedSeconds:7786,stopReason:'',dailyProduction:1500,dailyTarget:1500,bottleneckReason:'',history:[] },
  { no:19,name:'댐지포장',model:'',maker:'',status:'IDLE',queue:0,queueCount:0,inProgress:0,completed:646,jobProgress:0,queueThreshold:DEFAULT_QUEUE_THRESHOLD,initialElapsedSeconds:862,stopReason:'',dailyProduction:1300,dailyTarget:1500,bottleneckReason:'',history:[] },
];

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
function getCategory(no:number) { if(no<=4)return'내지'; if(no<=11)return'표지'; if(no<=17)return'제본'; return'포장'; }
function formatElapsed(s:number) { const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60; return`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`; }
function formatDuration(ms:number) { const s=Math.floor(ms/1000); if(s<60)return`${s}초`; if(s<3600)return`${Math.floor(s/60)}분 ${s%60}초`; return`${Math.floor(s/3600)}시간 ${Math.floor((s%3600)/60)}분`; }
const DAY_LABELS = ['화','수','목','금','토','일','월'];
function getLast7Days(base:number,seed:number) { return DAY_LABELS.map((day,i)=>({day,value:Math.round(base*((i===4||i===5)?0.28+((seed+i)%8)/100:0.9+((seed*3+i*17)%18)/100))})); }
function getMonthlyTotal(d:number,s:number) { return Math.round(d*20.5+s*211); }
function getAchievementRate(m:number,t:number) { return t<=0?0:Math.round((m/(t*30))*100); }

// ============================================
// 장비 카드 (대기물량 제거, 진행률+소요시간만)
// ============================================
const ProcessCard: React.FC<{ process:ProcessData; onSelect?:(no:number)=>void }> = ({ process, onSelect }) => {
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
// 장비군 컴포넌트 (세로 배열, 콤팩트)
// ============================================
const EquipmentGroupComp: React.FC<{
  group: typeof EQUIPMENT_GROUPS[0]; machineMap: Record<number,ProcessData>; onSelect:(no:number)=>void;
}> = ({ group, machineMap, onSelect }) => {
  const machines = group.machines.map(no=>machineMap[no]).filter(Boolean);
  const totalQueue = machines.reduce((s,m)=>{ const ds=toDisplay(m.status); return s+(ds==='IDLE'?0:m.queue); },0);
  const totalQueueCount = machines.reduce((s,m)=>{ const ds=toDisplay(m.status); return s+(ds==='IDLE'?0:m.queueCount); },0);
  const isOverloaded = totalQueue >= DEFAULT_QUEUE_THRESHOLD;

  return (
    <div className="min-w-[170px] shrink-0">
      <div className={`px-1.5 py-1 rounded-t border border-b-0 border-gray-700/50 bg-gray-900/80 ${isOverloaded?'animate-overload-box':''}`}>
        <p className="text-[10px] font-bold text-gray-300 truncate">{group.name}</p>
        <div className="flex items-center gap-2 text-[9px] mt-0.5">
          <span className="text-amber-300">대기물량 <span className="font-bold font-mono">{totalQueue.toLocaleString()}</span></span>
          <span className="text-sky-300">건수 <span className="font-bold font-mono">{totalQueueCount}</span></span>
        </div>
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
  const ds = toDisplay(process.status);
  const last7 = useMemo(()=>getLast7Days(process.dailyProduction,process.no),[process]);
  const monthly = useMemo(()=>getMonthlyTotal(process.dailyProduction,process.no),[process]);
  const rate = getAchievementRate(monthly,process.dailyTarget);
  const category = getCategory(process.no);

  // 이력에 소요시간 계산
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
            <p className="text-xs text-gray-500 mt-1 tracking-wide">NO {process.no} · {process.model||'-'} · {process.maker||'-'} · {category}</p>
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

      {/* 상태 변경 이력 (시작시간 + 소요시간) */}
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
const GroupBox: React.FC<{title:string;titleColor?:string;children:React.ReactNode;className?:string}> = ({title,titleColor='text-sky-300',children,className=''}) => (
  <div className={`relative rounded-lg border border-dashed border-gray-700 px-3 pt-5 pb-3 ${className}`}>
    <span className={`absolute -top-2.5 left-3 px-2 bg-black text-[11px] font-bold tracking-wider ${titleColor}`}>{title}</span>
    {children}
  </div>
);

// ============================================
// 메인 컴포넌트
// ============================================
const ProcessFlowDiagram: React.FC = () => {
  const [selectedNo, setSelectedNo] = useState<number|null>(null);
  const [now, setNow] = useState(Date.now());
  const mountTimeRef = useRef(Date.now());
  const [firebaseStates, setFirebaseStates] = useState<Record<number,MachineState>>({});

  useEffect(()=>{ const i=setInterval(()=>setNow(Date.now()),1000); return()=>clearInterval(i); },[]);
  useEffect(()=>{ const u=subscribeMachines(s=>setFirebaseStates(s)); return u; },[]);

  const p = useMemo(()=>{
    const map: Record<number,ProcessData> = {};
    processes.forEach(proc=>{
      const fb = firebaseStates[proc.no];
      if(fb){
        const elapsed = Math.max(0,Math.floor((now-fb.statusChangedAt.getTime())/1000));
        map[proc.no] = {...proc, status:fb.status, stopReason:fb.stopReason, initialElapsedSeconds:elapsed, history:fb.history||[],
          queue:toDisplay(fb.status)==='IDLE'?0:proc.queue, queueCount:toDisplay(fb.status)==='IDLE'?0:proc.queueCount,
          inProgress:toDisplay(fb.status)==='RUN'?proc.inProgress:0, jobProgress:toDisplay(fb.status)==='RUN'?proc.jobProgress:0 };
      } else {
        const elapsed = proc.initialElapsedSeconds+Math.floor((now-mountTimeRef.current)/1000);
        map[proc.no] = {...proc, initialElapsedSeconds:elapsed};
      }
    });
    return map;
  },[firebaseStates,now]);

  // 3상태 카운트
  const statusCounts = useMemo(()=>{
    const c = {RUN:0,IDLE:0,STOP:0};
    Object.values(p).forEach(proc=>{ c[toDisplay(proc.status)]++; });
    return c;
  },[p]);

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

  // 장비군 ID로 렌더링하는 숏컷
  const groupMap = useMemo(()=>{
    const m: Record<string, typeof EQUIPMENT_GROUPS[0]> = {};
    EQUIPMENT_GROUPS.forEach(g=>{ m[g.id]=g; });
    return m;
  },[]);
  const EG = ({id}:{id:string}) => {
    const g = groupMap[id];
    return g ? <EquipmentGroupComp group={g} machineMap={p} onSelect={setSelectedNo}/> : null;
  };

  return (
    <div className="flex flex-col gap-4 p-5 bg-black min-h-full">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">제작공정 흐름도</h2>
          <p className="text-xs text-gray-500 mt-1">내지 · 표지 (병렬) → 제본 → 포장 · 실시간 상태 모니터링</p>
        </div>
        <div className="flex items-center gap-1.5 text-[11px]">
          <Legend color="emerald" label="RUN"/><Legend color="amber" label="IDLE"/><Legend color="rose" label="STOP" pulse/>
          <button className="flex items-center gap-1.5 px-2.5 py-1 ml-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium transition-colors text-[11px]"><RefreshCw className="w-3 h-3"/>새로고침</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatusCount icon={Play} label="가동 중" count={statusCounts.RUN} total={19} color="emerald"/>
        <StatusCount icon={Pause} label="대기" count={statusCounts.IDLE} color="amber"/>
        <StatusCount icon={AlertCircle} label="정지" count={statusCounts.STOP} color="rose" pulse/>
      </div>

      {/* 메인 흐름도 — 가로 공정 순서 */}
      <div className="flex-1 overflow-x-auto pb-2 pt-1">
        <div className="flex items-start gap-0 mt-2">

          {/* 내지 + 표지 (병렬) */}
          <div className="flex flex-col gap-2 shrink-0">
            {/* Row 1: 내지 */}
            <div className="relative rounded-lg border border-dashed border-gray-700 px-2 pt-4 pb-2">
              <span className="absolute -top-2.5 left-3 px-2 bg-black text-[10px] font-bold tracking-wider text-sky-300">내지</span>
              <div className="flex items-start gap-1.5">
                <EG id="continuous"/><Arrow/><EG id="r2c"/>
              </div>
            </div>
            {/* Row 2: 표지 */}
            <div className="relative rounded-lg border border-dashed border-gray-700 px-2 pt-4 pb-2">
              <span className="absolute -top-2.5 left-3 px-2 bg-black text-[10px] font-bold tracking-wider text-pink-300">표지</span>
              <div className="flex items-start gap-1.5">
                <EG id="sheet"/><Arrow/><EG id="coating"/><Arrow/><EG id="epoxy"/><Arrow/><EG id="cutting"/>
              </div>
            </div>
          </div>

          <Arrow size="lg"/>

          {/* 제본 */}
          <div className="relative rounded-lg border border-dashed border-gray-700 px-2 pt-4 pb-2 shrink-0">
            <span className="absolute -top-2.5 left-3 px-2 bg-black text-[10px] font-bold tracking-wider text-sky-300">제본</span>
            <div className="flex flex-col gap-1.5">
              <EG id="binding"/><EG id="saddle"/><EG id="wing"/><EG id="exam"/>
            </div>
          </div>

          <Arrow size="lg"/>

          {/* 포장 */}
          <div className="relative rounded-lg border border-dashed border-gray-700 px-2 pt-4 pb-2 shrink-0">
            <span className="absolute -top-2.5 left-3 px-2 bg-black text-[10px] font-bold tracking-wider text-cyan-300">포장</span>
            <div className="flex flex-col gap-1.5">
              <EG id="box"/><EG id="pallet"/>
            </div>
          </div>

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
