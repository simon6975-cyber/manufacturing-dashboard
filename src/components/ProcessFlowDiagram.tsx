// src/components/ProcessFlowDiagram.tsx
'use client';

import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts';
import { Play, Pause, AlertCircle, ChevronRight, ChevronLeft, RefreshCw, AlertTriangle, X, Clock, Calendar } from 'lucide-react';
import { subscribeMachines, MachineState, MachineHistoryEntry } from '@/lib/machine-service';
import { useMachineDefs, MachineDef } from '@/lib/machine-defs';
import { useStopCodes } from '@/lib/useStopCodes';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

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
  runCount: number;           // 진행중 작업건수 (RUNCNT)
  dayCompletedCount: number;  // 금일 완료건수 (DAYCOMCNT)
}

interface DynamicEquipmentGroup {
  id: string;
  name: string;
  machines: number[];
  processGroup: string;
}

const DEFAULT_QUEUE_THRESHOLD = 5000;

import { getCountUnit } from '@/lib/count-unit';
import { saveDailyProduction, todayKST } from '@/lib/production-daily';

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
function formatElapsed(s:number) { if(s<0) return '--:--:--'; const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60; return`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`; }
function formatDuration(ms:number) { const s=Math.floor(ms/1000); if(s<60)return`${s}초`; if(s<3600)return`${Math.floor(s/60)}분 ${s%60}초`; return`${Math.floor(s/3600)}시간 ${Math.floor((s%3600)/60)}분`; }
function formatDurationSec(sec:number) { if(sec<60)return`${sec}초`; if(sec<3600)return`${Math.floor(sec/60)}분 ${sec%60}초`; return`${Math.floor(sec/3600)}시간 ${Math.floor((sec%3600)/60)}분`; }
function kstTodayStr(): string { const kst=new Date(Date.now()+9*60*60*1000); return kst.toISOString().slice(0,10); }
function shiftDate(dateStr:string, days:number): string { const [y,m,d]=dateStr.split('-').map(Number); const dt=new Date(Date.UTC(y,m-1,d+days)); return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,'0')}-${String(dt.getUTCDate()).padStart(2,'0')}`; }

interface StatusEvent {
  state: string;
  startTime: string;
  startTimestamp: number;
  endTime: string;
  endTimestamp: number;
  durationSeconds: number;
}

function parseTimeToTimestamp(dateStr: string, timeStr: string): number {
  // dateStr: YYYY-MM-DD, timeStr: HH:MM:SS → KST epoch ms
  const [h, m, s] = timeStr.split(':').map(Number);
  const dt = new Date(`${dateStr}T00:00:00+09:00`);
  return dt.getTime() + (h * 3600 + m * 60 + s) * 1000;
}

function useStatusEvents(machineNo: number, date: string) {
  const [events, setEvents] = useState<StatusEvent[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    // Firestore(machine_status_daily)만 읽는다 — 사내PC dspm-log-sync.js 가 10분마다 채운다.
    // Vercel → 사내망 DSPM(/api/dspm/log)은 방화벽에 막혀 타임아웃(15초)까지 기다리기만 해서 뺐다.
    (async () => {
      try {
        const res = await fetch(`/api/status-daily?date=${date}`);
        const data = await res.json();
        if (cancelled) return;
        const list = data?.entries || data || [];
        const machineData = (Array.isArray(list) ? list : []).find((m: { machineNo: number }) => m.machineNo === machineNo);
        // 옛 스크립트(v1.0) 저장분은 startTimestamp 가 없다 → 시각 문자열로 채워 최신순 정렬이 되게
        const evts: StatusEvent[] = (machineData?.events || []).map((e: StatusEvent) => ({
          ...e,
          startTimestamp: e.startTimestamp ?? parseTimeToTimestamp(date, e.startTime),
          endTimestamp: e.endTimestamp ?? parseTimeToTimestamp(date, e.endTime),
        }));
        setEvents(evts);
      } catch {
        if (!cancelled) setEvents([]);
      }
      if (!cancelled) setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [machineNo, date]);
  return { events, loading };
}
const WEEKDAY_KO = ['일','월','화','수','목','금','토'];
interface ProductionDay { date: string; day: string; weekend: boolean; value: number; }

// 최근 30일 생산량 — production_daily/{date}/machines/{no}.dayCompletedCount (DSPM DAYCOMCNT 일 마감값)
// 오늘은 아직 마감 전이라 실시간 DAYCOMCNT(liveToday)와 저장값 중 큰 값을 쓴다
function useProductionHistory(machineNo: number, liveToday: number) {
  const today = kstTodayStr();
  const start = shiftDate(today, -29);
  const key = `${machineNo}|${start}|${today}`;
  // 조회가 끝난 키와 함께 보관 — 키가 다르면 로딩 중 (effect 안에서 setLoading 동기 호출을 피한다)
  const [result, setResult] = useState<{ key: string; byDate: Record<string, number> } | null>(null);
  const loading = result?.key !== key;
  const stored = useMemo(() => (loading ? {} : result!.byDate), [loading, result]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/production-daily?start=${start}&end=${today}`);
        const json = await res.json();
        if (cancelled) return;
        const byDate: Record<string, number> = {};
        for (const e of (json?.entries || []) as { machineNo: number; date: string; dayCompletedCount: number }[]) {
          if (e.machineNo === machineNo) byDate[e.date] = e.dayCompletedCount;
        }
        setResult({ key, byDate });
      } catch {
        if (!cancelled) setResult({ key, byDate: {} });
      }
    })();
    return () => { cancelled = true; };
  }, [key, machineNo, start, today]);

  return useMemo(() => {
    const days: ProductionDay[] = [];
    for (let i = 29; i >= 0; i--) {
      const date = shiftDate(today, -i);
      const [y, m, d] = date.split('-').map(Number);
      const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      const value = date === today ? Math.max(stored[date] || 0, liveToday) : (stored[date] || 0);
      days.push({ date, day: WEEKDAY_KO[wd], weekend: wd === 0 || wd === 6, value });
    }
    const total30 = days.reduce((sum, x) => sum + x.value, 0);
    const workDays = days.filter(x => x.value > 0).length;
    return {
      last7: days.slice(-7),
      total30,
      dailyAvg: workDays > 0 ? Math.round(total30 / workDays) : 0,
      workDays,
      loading,
    };
  }, [stored, liveToday, today, loading]);
}

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
    runCount: 0,
    dayCompletedCount: 0,
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
// ============================================
// 현재 상태 시작 시각 (DSPM 연결 장비)
// ============================================
// machines/{no}.statusChangedAt 은 DSPM getmachinestate 의 TM 인데, TM 이 비어 1970-01-01 로 들어와
// 소요시간이 "498127:..." 처럼 나왔다. 대신 상태 변경 이력(machine_status_daily — 사내PC dspm-log-sync.js 가
// 10분마다 DSPM 로그로 저장)에서 현재 상태가 시작된 시각을 찾는다.
//   - 마지막 이벤트가 현재 상태와 같으면 → 그 이벤트의 시작 시각 (자정을 걸친 같은 상태는 어제와 이어 붙임)
//   - 다르면 → 마지막 동기화 이후 상태가 바뀐 것 → 마지막 이벤트의 끝 시각
interface StateSpan { state: string; startTimestamp: number; endTimestamp: number; }

function useStateSpans(): Record<number, StateSpan[]> {
  const [spans, setSpans] = useState<Record<number, StateSpan[]>>({});
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const today = kstTodayStr();
      try {
        const res = await fetch(`/api/status-daily?start=${shiftDate(today, -1)}&end=${today}`);
        const json = await res.json();
        if (cancelled || !json?.ok) return;
        const byMachine: Record<number, StateSpan[]> = {};
        for (const entry of (json.entries || []) as { machineNo: number; date: string; events?: StatusEvent[] }[]) {
          const list = byMachine[entry.machineNo] || (byMachine[entry.machineNo] = []);
          for (const e of entry.events || []) {
            list.push({
              state: e.state,
              startTimestamp: e.startTimestamp ?? parseTimeToTimestamp(entry.date, e.startTime),
              endTimestamp: e.endTimestamp ?? parseTimeToTimestamp(entry.date, e.endTime),
            });
          }
        }
        // 시간순 정렬 후 끊김 없이 이어지는 같은 상태(자정 분할 포함) 병합
        for (const no of Object.keys(byMachine)) {
          const sorted = byMachine[+no].sort((a, b) => a.startTimestamp - b.startTimestamp);
          const merged: StateSpan[] = [];
          for (const sp of sorted) {
            const last = merged[merged.length - 1];
            if (last && last.state === sp.state && sp.startTimestamp - last.endTimestamp <= 1000) last.endTimestamp = Math.max(last.endTimestamp, sp.endTimestamp);
            else merged.push({ ...sp });
          }
          byMachine[+no] = merged;
        }
        setSpans(byMachine);
      } catch { /* 다음 주기에 재시도 */ }
    };
    load();
    const t = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);
  return spans;
}

/** 현재 상태 시작 시각(ms). 알 수 없으면 null */
function currentStateStart(spans: StateSpan[] | undefined, status: string, stopReason: string): number | null {
  if (!spans || spans.length === 0) return null;
  const key = status === 'STOP' && stopReason ? stopReason : status;
  const last = spans[spans.length - 1];
  return last.state === key ? last.startTimestamp : last.endTimestamp;
}

const MIN_VALID_TS = Date.UTC(2020, 0, 1); // 이보다 이른 statusChangedAt 은 TM 누락(0) 으로 본다

// ============================================
// 장비군 대기물량
// ============================================
// 내지·표지: 앞 공정 금일완료(DSPM DAYCOMCNT) − 이 공정 금일완료 = 대기물량 (0 미만이면 0)
//   - 각 공정의 첫 장비군(연속지출력기·낱장출력)은 앞 공정이 없어 0 — 투입 기준은 추후 정의
//   - 페이지 → 장 으로 넘어갈 때는 양면 기준 ÷2 (낱장출력 → 코팅)
//   - 건수는 DSPM에 작업 건수 데이터가 없어 null('-') — 출처 정해지면 연결
// 제본·포장: 아직 실데이터 미연결 — 기존 시뮬레이션 값 유지
interface GroupQueue { queue: number; count: number | null; }
const REAL_QUEUE_PROCESSES = ['내지', '표지'];

function computeGroupQueues(groupsByProcess: Record<string, DynamicEquipmentGroup[]>, machineMap: Record<number, ProcessData>): Record<string, GroupQueue> {
  const machinesOf = (g: DynamicEquipmentGroup) => g.machines.map(no => machineMap[no]).filter(Boolean);
  const completedOf = (g: DynamicEquipmentGroup) => machinesOf(g).reduce((sum, m) => sum + (m.dayCompletedCount || 0), 0);
  const result: Record<string, GroupQueue> = {};
  for (const [processGroup, groups] of Object.entries(groupsByProcess)) {
    groups.forEach((g, i) => {
      if (REAL_QUEUE_PROCESSES.includes(processGroup)) {
        if (i === 0) { result[g.id] = { queue: 0, count: null }; return; }
        const prev = groups[i - 1];
        const factor = getCountUnit(prev.name) === '페이지' && getCountUnit(g.name) === '장' ? 0.5 : 1;
        result[g.id] = { queue: Math.max(0, Math.round(completedOf(prev) * factor) - completedOf(g)), count: null };
      } else {
        const active = machinesOf(g).filter(m => toDisplay(m.status) !== 'IDLE');
        result[g.id] = {
          queue: active.reduce((sum, m) => sum + m.queue, 0),
          count: active.reduce((sum, m) => sum + m.queueCount, 0),
        };
      }
    });
  }
  return result;
}

const EquipmentGroupComp: React.FC<{
  group: DynamicEquipmentGroup; machineMap: Record<number,ProcessData>; onSelect:(no:number)=>void; now:number; queueInfo?: GroupQueue;
}> = ({ group, machineMap, onSelect, now, queueInfo }) => {
  const machines = group.machines.map(no=>machineMap[no]).filter(Boolean);
  const totalQueue = queueInfo?.queue ?? 0;
  const totalQueueCount = queueInfo?.count ?? null;
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
          <span className="text-sky-300">건수 <span className="font-bold font-mono">{totalQueueCount ?? '-'}</span></span>
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
  const { last7, total30, dailyAvg, workDays, loading: prodLoading } = useProductionHistory(process.no, process.dayCompletedCount);
  const unit = getCountUnit(process.equipmentGroup);
  const has7 = last7.some(d => d.value > 0);

  // 상태 이력: machine_status_daily에서 가져오기 (정확한 시작/종료/소요시간)
  const [historyDate, setHistoryDate] = useState(kstTodayStr);
  const { events, loading: eventsLoading } = useStatusEvents(process.no, historyDate);
  const isToday = historyDate === kstTodayStr();

  // 이벤트를 최신순으로 정렬
  const sortedEvents = useMemo(() => [...events].sort((a, b) => b.startTimestamp - a.startTimestamp), [events]);

  const cMap: Record<string,string> = {
    RUN:'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    IDLE:'bg-amber-400/15 text-amber-300 border-amber-400/30',
    STOP:'bg-rose-500/15 text-rose-300 border-rose-500/30',
    SETUP:'bg-sky-500/15 text-sky-300 border-sky-500/30',
    S1:'bg-rose-500/15 text-rose-300 border-rose-500/30',
    S2:'bg-rose-500/15 text-rose-300 border-rose-500/30',
    S3:'bg-rose-500/15 text-rose-300 border-rose-500/30',
    S4:'bg-rose-500/15 text-rose-300 border-rose-500/30',
    S5:'bg-rose-500/15 text-rose-300 border-rose-500/30',
    S6:'bg-rose-500/15 text-rose-300 border-rose-500/30',
    S7:'bg-rose-500/15 text-rose-300 border-rose-500/30',
    S8:'bg-rose-500/15 text-rose-300 border-rose-500/30',
    S9:'bg-rose-500/15 text-rose-300 border-rose-500/30',
  };

  // 상태 표시 레이블
  const stateLabel = (state: string) => {
    if (state === 'RUN' || state === 'IDLE') return state;
    if (/^S\d+$/.test(state)) return 'STOP';
    return state;
  };

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
        <InfoRow label="현재 상태"><span className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${statusDot[ds]}`}/><span className="text-gray-200">{statusLabel[ds]}</span></span></InfoRow>
        <InfoRow label="진행중 작업량"><span className="text-sm text-gray-300">{process.runCount > 0 ? `${process.runCount.toLocaleString()} ${getCountUnit(process.equipmentGroup)}` : '-'}</span></InfoRow>
        <InfoRow label="금일 완료량"><span className="text-sm text-gray-300">{process.dayCompletedCount > 0 ? `${process.dayCompletedCount.toLocaleString()} ${getCountUnit(process.equipmentGroup)}` : '-'}</span></InfoRow>
        <InfoRow label="금일 정지 사유">{process.stopReason?(<span className="flex items-center gap-1.5"><span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-xs font-medium border border-indigo-500/30">{process.stopReason}</span><span className="text-xs text-gray-400">{stopCodeNames[process.stopReason]||''}</span></span>):(<span className="text-gray-500">없음</span>)}</InfoRow>
      </div>

      {/* 상태 변경 이력 — machine_status_daily 기반 */}
      <div className="px-5 pt-4 pb-2">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-gray-200 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-gray-500"/>상태 변경 이력
          </h3>
          <div className="flex items-center gap-1">
            <button onClick={()=>setHistoryDate(shiftDate(historyDate,-1))}
              className="p-1 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded transition-colors">
              <ChevronLeft className="w-3.5 h-3.5"/>
            </button>
            <button onClick={()=>setHistoryDate(kstTodayStr())}
              className={`px-2 py-0.5 text-[11px] font-mono rounded transition-colors ${isToday ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800 border border-gray-700'}`}>
              {historyDate.slice(5)}
            </button>
            <button onClick={()=>{ if(!isToday) setHistoryDate(shiftDate(historyDate,1)); }}
              disabled={isToday}
              className={`p-1 rounded transition-colors ${isToday ? 'text-gray-700 cursor-not-allowed' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'}`}>
              <ChevronRight className="w-3.5 h-3.5"/>
            </button>
          </div>
        </div>

        {eventsLoading ? (
          <p className="text-sm text-gray-600 text-center py-4">로딩 중...</p>
        ) : sortedEvents.length === 0 ? (
          <p className="text-sm text-gray-600 text-center py-4">{historyDate} 이력 없음</p>
        ) : (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {sortedEvents.map((ev, i) => (
              <div key={i} className="py-2 px-2.5 rounded bg-gray-900/40 border border-gray-800/30">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${cMap[ev.state] || cMap.IDLE}`}>
                    {stateLabel(ev.state)}
                  </span>
                  {/^S\d+$/.test(ev.state) && (
                    <span className="text-[11px] text-rose-400">{ev.state} {stopCodeNames[ev.state]||''}</span>
                  )}
                  <span className="text-[11px] text-gray-300 ml-auto font-bold font-mono">
                    {formatDurationSec(ev.durationSeconds)}
                  </span>
                </div>
                <div className="flex items-center gap-1 mt-1 text-[10px] text-gray-500 font-mono">
                  <span>{ev.startTime}</span>
                  <span className="text-gray-700">→</span>
                  <span>{ev.endTime}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="px-5 pt-5 pb-2">
        <h3 className="text-sm font-bold text-gray-200 mb-3">최근 7일 생산량</h3>
        {prodLoading ? (
          <p className="text-sm text-gray-600 text-center py-16">로딩 중...</p>
        ) : !has7 ? (
          <p className="text-sm text-gray-600 text-center py-16">최근 7일 생산 기록 없음</p>
        ) : (
        <ResponsiveContainer width="100%" height={210}>
          <BarChart data={last7} margin={{top:5,right:5,bottom:0,left:-12}}>
            <XAxis dataKey="day" tick={{fill:'#9ca3af',fontSize:12}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fill:'#6b7280',fontSize:11}} axisLine={false} tickLine={false}/>
            <Tooltip contentStyle={{backgroundColor:'#111827',border:'1px solid #1f2937',borderRadius:8,color:'#f3f4f6',fontSize:12}} cursor={{fill:'rgba(255,255,255,0.04)'}}
              labelStyle={{color:'#f3f4f6',fontSize:12}} itemStyle={{color:'#f3f4f6',fontSize:12}}
              labelFormatter={(_l, payload)=>{ const d=payload?.[0]?.payload as ProductionDay|undefined; return d?`${d.date.slice(5).replace('-','/')} (${d.day})`:''; }}
              formatter={(v)=>[`${Number(v).toLocaleString()} ${unit}`,'생산량']}/>
            <Bar dataKey="value" radius={[4,4,0,0]}>{last7.map((d,i)=>(<Cell key={i} fill={d.weekend?'#3b82f6':'#60a5fa'}/>))}</Bar>
          </BarChart>
        </ResponsiveContainer>
        )}
      </div>
      <div className="px-5 pb-6 pt-2 grid grid-cols-2 gap-3">
        <div className="bg-gray-900 rounded-lg p-4 border border-gray-800"><p className="text-xs text-gray-500 mb-1">최근 30일 누적</p><p className="text-2xl font-bold text-gray-100">{prodLoading?'-':total30.toLocaleString()}</p><p className="text-[11px] text-gray-600 mt-1">{unit}</p></div>
        <div className="bg-gray-900 rounded-lg p-4 border border-gray-800"><p className="text-xs text-gray-500 mb-1">가동일 평균</p><p className="text-2xl font-bold text-gray-100">{prodLoading?'-':dailyAvg.toLocaleString()}</p><p className="text-[11px] text-gray-600 mt-1">{unit} · 생산 {workDays}일 기준</p></div>
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
  const stateSpans = useStateSpans();

  // DSPM 실시간 데이터 (dspm_live/snapshot → RUNCNT/DAYCOMCNT)
  const [dspmByMcno, setDspmByMcno] = useState<Record<number, { runCount: number; dayCompletedCount: number }>>({});

  useEffect(()=>{ const i=setInterval(()=>setNow(Date.now()),1000); return()=>clearInterval(i); },[]);
  useEffect(()=>{ const u=subscribeMachines(s=>setFirebaseStates(s)); return u; },[]);

  // sync-machines 주기적 호출 (30초마다) — 상태 변경 감지 + 이벤트 기록
  useEffect(() => {
    const doSync = () => {
      fetch('/api/sync-machines').catch(() => {});
    };
    doSync(); // 페이지 로드 시 즉시 1회
    const interval = setInterval(doSync, 30000);
    return () => clearInterval(interval);
  }, []);

  // dspm_live/snapshot 구독 — RUNCNT/DAYCOMCNT를 MCNO 기준으로 매핑
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'dspm_live', 'snapshot'), (snap) => {
      if (!snap.exists()) return;
      const rawList = Array.isArray(snap.data().data) ? snap.data().data : [];
      const map: Record<number, { runCount: number; dayCompletedCount: number }> = {};
      rawList.forEach((s: Record<string, unknown>) => {
        const mcno = typeof s.MCNO === 'string' ? parseInt(s.MCNO, 10) : Number(s.MCNO) || 0;
        if (mcno > 0) {
          map[mcno] = {
            runCount: typeof s.RUNCNT === 'number' ? s.RUNCNT : typeof s.RUNCNT === 'string' ? parseInt(s.RUNCNT, 10) || 0 : 0,
            dayCompletedCount: typeof s.DAYCOMCNT === 'number' ? s.DAYCOMCNT : typeof s.DAYCOMCNT === 'string' ? parseInt(s.DAYCOMCNT, 10) || 0 : 0,
          };
        }
      });
      setDspmByMcno(map);

      // DAYCOMCNT → production_daily 자동 저장 (mcno→machineNo 매핑)
      const date = todayKST();
      Object.entries(machineDefs).forEach(([noStr, def]) => {
        if (def.mcno == null) return;
        const dspm = map[def.mcno];
        if (dspm && dspm.dayCompletedCount > 0) {
          saveDailyProduction(
            def.no, def.name,
            def.equipmentGroup || def.name.replace(/\s*\d+호기$/, '').replace(/\s+/g, ''),
            def.group, dspm.dayCompletedCount, date,
          ).catch(() => {});
        }
      });
    });
    return unsub;
  }, [machineDefs]);

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
      // DSPM RUNCNT/DAYCOMCNT — machineDefs의 mcno로 dspmByMcno 조회
      const defMcno = machineDefs[def.no]?.mcno;
      const dspmData = defMcno != null ? dspmByMcno[defMcno] : undefined;
      const runCount = dspmData?.runCount || 0;
      const dayCompletedCount = dspmData?.dayCompletedCount || 0;

      if(fb){
        // 소요시간 = 현재 상태가 시작된 뒤 흐른 시간. DSPM 연결 장비는 상태 이력 기준(위 useStateSpans 주석),
        // 수동 장비는 터미널에서 누른 statusChangedAt 기준. 둘 다 없으면 -1('--:--:--')
        const changedAt = fb.statusChangedAt.getTime();
        const start = defMcno != null
          ? currentStateStart(stateSpans[def.no], fb.status, fb.stopReason) ?? (changedAt >= MIN_VALID_TS ? changedAt : null)
          : (changedAt >= MIN_VALID_TS ? changedAt : null);
        const elapsed = start != null ? Math.max(0,Math.floor((now-start)/1000)) : -1;
        map[def.no] = {...base, status:fb.status, stopReason:fb.stopReason, initialElapsedSeconds:elapsed, history:fb.history||[],
          queue:toDisplay(fb.status)==='IDLE'?0:base.queue, queueCount:toDisplay(fb.status)==='IDLE'?0:base.queueCount,
          inProgress:toDisplay(fb.status)==='RUN'?base.inProgress:0, jobProgress:toDisplay(fb.status)==='RUN'?base.jobProgress:0,
          runCount, dayCompletedCount };
      } else {
        const elapsed = base.initialElapsedSeconds+Math.floor((now-mountTimeRef.current)/1000);
        map[def.no] = {...base, initialElapsedSeconds:elapsed, runCount, dayCompletedCount};
      }
    });
    return map;
  },[firebaseStates,now,allDefs,dspmByMcno,machineDefs,stateSpans]);

  const totalMachines = allDefs.length;

  // 3상태 카운트
  const statusCounts = useMemo(()=>{
    const c = {RUN:0,IDLE:0,STOP:0};
    Object.values(p).forEach(proc=>{ c[toDisplay(proc.status)]++; });
    return c;
  },[p]);

  // 장비군별 대기물량·건수 (내지·표지는 실데이터 — computeGroupQueues 주석 참고)
  const groupQueues = useMemo(() => computeGroupQueues(groupsByProcess, p), [groupsByProcess, p]);

  // 대기물량 초과 장비군 수
  const overloadedGroupCount = useMemo(()=>{
    return Object.values(groupQueues).filter(q => q.queue >= DEFAULT_QUEUE_THRESHOLD).length;
  },[groupQueues]);

  const totals = useMemo(()=>{
    let queue=0,queueCount=0,completed=0;
    Object.values(groupQueues).forEach(q=>{ queue+=q.queue; queueCount+=q.count ?? 0; });
    Object.values(p).forEach(proc=>{ completed+=proc.completed; });
    return {queue,queueCount,completed};
  },[p, groupQueues]);

  useEffect(()=>{ const h=(e:KeyboardEvent)=>{if(e.key==='Escape')setSelectedNo(null);}; window.addEventListener('keydown',h); return()=>window.removeEventListener('keydown',h); },[]);

  // 레이아웃 존 boolean
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

      {/* 메인 흐름도 — 내지/표지(병렬) → 제본(10-17 세로) → 포장 */}
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
                        <EquipmentGroupComp group={g} machineMap={p} onSelect={setSelectedNo} now={now} queueInfo={groupQueues[g.id]} />
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
                        <EquipmentGroupComp group={g} machineMap={p} onSelect={setSelectedNo} now={now} queueInfo={groupQueues[g.id]} />
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {(hasNaeji || hasPyoji) && (hasJebon || hasPojang) && <Arrow size="lg" />}

          {/* 제본 (12-17) — 세로 배치 */}
          {hasJebon && (
            <div className="relative rounded-lg border border-dashed border-gray-700 px-2 pt-4 pb-2 shrink-0">
              <span className={`absolute -top-2.5 left-3 px-2 bg-black text-[10px] font-bold tracking-wider ${processGroupColors['제본']}`}>제본</span>
              <div className="flex flex-col gap-1.5">
                {groupsByProcess['제본'].map(g => (
                  <EquipmentGroupComp key={g.id} group={g} machineMap={p} onSelect={setSelectedNo} now={now} queueInfo={groupQueues[g.id]} />
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
                  <EquipmentGroupComp key={g.id} group={g} machineMap={p} onSelect={setSelectedNo} now={now} queueInfo={groupQueues[g.id]} />
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
