// src/components/ProcessFlowDiagram.tsx
'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell,
} from 'recharts';
import {
  Play, Pause, AlertCircle, Settings, ChevronRight, RefreshCw, AlertTriangle, X,
} from 'lucide-react';

type Status = 'RUN' | 'IDLE' | 'STOP' | 'SETUP';

interface ProcessData {
  no: number;
  name: string;
  model: string;
  maker: string;
  status: Status;
  queue: number;                // 대기물량
  queueCount: number;           // 대기건수
  inProgress: number;
  completed: number;
  jobProgress: number;
  queueThreshold: number;
  initialElapsedSeconds: number;
  stopReason: string;
  dailyProduction: number;
  dailyTarget: number;
  bottleneckReason: string;
}

const DEFAULT_QUEUE_THRESHOLD = 5000;

const stopCodeNames: Record<string, string> = {
  S1: '장비 셋팅',
  S2: '자재 준비',
  S3: '작업 준비',
  S4: '검수',
  S5: '예방 정비',
  S6: '설비 장애',
  S7: '작업 중단',
  S8: '인력 부재',
  S9: '기타',
};

// ============================================
// 19개 공정 데이터
// ============================================
const processes: ProcessData[] = [
  { no: 1,  name: '연속지출력 1호기', model: '520HD+',       maker: 'SCREEN',     status: 'RUN',   queue: 3682, queueCount: 3, inProgress: 1280, completed: 9318, jobProgress: 65, queueThreshold: DEFAULT_QUEUE_THRESHOLD, initialElapsedSeconds: 9252,  stopReason: 'S5', dailyProduction: 13814, dailyTarget: 13000, bottleneckReason: '' },
  { no: 2,  name: '연속지출력 2호기', model: '520HD+',       maker: 'SCREEN',     status: 'RUN',   queue: 6240, queueCount: 5, inProgress: 2388, completed: 7939, jobProgress: 42, queueThreshold: DEFAULT_QUEUE_THRESHOLD, initialElapsedSeconds: 4530,  stopReason: '',   dailyProduction: 12500, dailyTarget: 13000, bottleneckReason: 'BN2' },
  { no: 3,  name: 'R2C 1호기',       model: 'S2020',        maker: 'TECHNAU',    status: 'RUN',   queue: 5340, queueCount: 4, inProgress: 1190, completed: 5047, jobProgress: 78, queueThreshold: DEFAULT_QUEUE_THRESHOLD, initialElapsedSeconds: 13338, stopReason: '',   dailyProduction: 8200,  dailyTarget: 8000,  bottleneckReason: '' },
  { no: 4,  name: 'R2C 2호기',       model: 'S2320',        maker: 'TECHNAU',    status: 'IDLE', queue: 0,    queueCount: 0, inProgress: 0,    completed: 4239, jobProgress: 0,  queueThreshold: DEFAULT_QUEUE_THRESHOLD, initialElapsedSeconds: 1425,  stopReason: 'S1', dailyProduction: 7800,  dailyTarget: 8000,  bottleneckReason: 'BN1' },
  { no: 5,  name: '날장출력 1호기',   model: '이리데스',      maker: 'FUJI FILM',  status: 'RUN',   queue: 1076, queueCount: 2, inProgress: 488,  completed: 2424, jobProgress: 55, queueThreshold: DEFAULT_QUEUE_THRESHOLD, initialElapsedSeconds: 2902,  stopReason: '',   dailyProduction: 4100,  dailyTarget: 4000,  bottleneckReason: '' },
  { no: 6,  name: '날장출력 2호기',   model: '레보리아',      maker: 'FUJI FILM',  status: 'STOP',  queue: 2786, queueCount: 3, inProgress: 0,    completed: 714,  jobProgress: 0,  queueThreshold: DEFAULT_QUEUE_THRESHOLD, initialElapsedSeconds: 1091,  stopReason: 'S6', dailyProduction: 2200,  dailyTarget: 4000,  bottleneckReason: '' },
  { no: 7,  name: '코팅 1호기',       model: 'EUROLAM 540',  maker: 'GMP',        status: 'RUN',   queue: 598,  queueCount: 1, inProgress: 800,  completed: 4402, jobProgress: 88, queueThreshold: DEFAULT_QUEUE_THRESHOLD, initialElapsedSeconds: 15308, stopReason: '',   dailyProduction: 6800,  dailyTarget: 6500,  bottleneckReason: '' },
  { no: 8,  name: '코팅 2호기',       model: 'PROTOPIC 540', maker: 'GMP',        status: 'SETUP', queue: 2471, queueCount: 2, inProgress: 0,    completed: 2529, jobProgress: 0,  queueThreshold: DEFAULT_QUEUE_THRESHOLD, initialElapsedSeconds: 1975,  stopReason: 'S1', dailyProduction: 3900,  dailyTarget: 5000,  bottleneckReason: '' },
  { no: 9,  name: '에폭시',           model: 'DDC 810',      maker: 'DUPLO',      status: 'RUN',   queue: 664,  queueCount: 1, inProgress: 361,  completed: 1336, jobProgress: 72, queueThreshold: DEFAULT_QUEUE_THRESHOLD, initialElapsedSeconds: 4124,  stopReason: '',   dailyProduction: 2400,  dailyTarget: 2500,  bottleneckReason: '' },
  { no: 10, name: '수동재단 1호기',   model: 'POLAR 92',     maker: 'HEIDELBERG', status: 'RUN',   queue: 5430, queueCount: 4, inProgress: 695,  completed: 3373, jobProgress: 60, queueThreshold: DEFAULT_QUEUE_THRESHOLD, initialElapsedSeconds: 8493,  stopReason: '',   dailyProduction: 5600,  dailyTarget: 5500,  bottleneckReason: 'BN3' },
  { no: 11, name: '수동재단 2호기',   model: 'C860',         maker: '대호',        status: 'IDLE', queue: 0,    queueCount: 0, inProgress: 0,    completed: 2802, jobProgress: 0,  queueThreshold: DEFAULT_QUEUE_THRESHOLD, initialElapsedSeconds: 687,   stopReason: '',   dailyProduction: 4800,  dailyTarget: 5000,  bottleneckReason: '' },
  { no: 12, name: '제본 1호기',       model: 'BQ470/HT80',   maker: 'HORIZON',    status: 'RUN',   queue: 500,  queueCount: 1, inProgress: 273,  completed: 1500, jobProgress: 80, queueThreshold: DEFAULT_QUEUE_THRESHOLD, initialElapsedSeconds: 14102, stopReason: '',   dailyProduction: 2700,  dailyTarget: 2800,  bottleneckReason: '' },
  { no: 13, name: '제본 2호기',       model: 'BQ470/HT80',   maker: 'HORIZON',    status: 'RUN',   queue: 712,  queueCount: 1, inProgress: 143,  completed: 1288, jobProgress: 90, queueThreshold: DEFAULT_QUEUE_THRESHOLD, initialElapsedSeconds: 10099, stopReason: '',   dailyProduction: 2300,  dailyTarget: 2500,  bottleneckReason: '' },
  { no: 14, name: '제본 3호기',       model: 'BQ500/HT300',  maker: 'HORIZON',    status: 'STOP',  queue: 1818, queueCount: 2, inProgress: 0,    completed: 382,  jobProgress: 0,  queueThreshold: DEFAULT_QUEUE_THRESHOLD, initialElapsedSeconds: 2558,  stopReason: 'S7', dailyProduction: 900,   dailyTarget: 2500,  bottleneckReason: '' },
  { no: 15, name: '중철기',           model: 'SPF-200A',     maker: 'HORIZON',    status: 'RUN',   queue: 589,  queueCount: 1, inProgress: 322,  completed: 2911, jobProgress: 75, queueThreshold: DEFAULT_QUEUE_THRESHOLD, initialElapsedSeconds: 5631,  stopReason: '',   dailyProduction: 4900,  dailyTarget: 5000,  bottleneckReason: '' },
  { no: 16, name: '날개접지기',       model: 'ZK320',        maker: '',           status: 'SETUP', queue: 1327, queueCount: 2, inProgress: 0,    completed: 1173, jobProgress: 0,  queueThreshold: DEFAULT_QUEUE_THRESHOLD, initialElapsedSeconds: 3074,  stopReason: 'S1', dailyProduction: 2100,  dailyTarget: 3000,  bottleneckReason: '' },
  { no: 17, name: '시험지접지기',     model: 'CSMO',         maker: 'HUNKELER',   status: 'IDLE', queue: 0,    queueCount: 0, inProgress: 0,    completed: 522,  jobProgress: 0,  queueThreshold: DEFAULT_QUEUE_THRESHOLD, initialElapsedSeconds: 308,   stopReason: '',   dailyProduction: 1100,  dailyTarget: 2000,  bottleneckReason: '' },
  { no: 18, name: '박스포장',         model: '',             maker: '',           status: 'RUN',   queue: 730,  queueCount: 1, inProgress: 297,  completed: 770,  jobProgress: 50, queueThreshold: DEFAULT_QUEUE_THRESHOLD, initialElapsedSeconds: 7786,  stopReason: '',   dailyProduction: 1500,  dailyTarget: 1500,  bottleneckReason: '' },
  { no: 19, name: '댐지포장',         model: '',             maker: '',           status: 'IDLE', queue: 0,    queueCount: 0, inProgress: 0,    completed: 646,  jobProgress: 0,  queueThreshold: DEFAULT_QUEUE_THRESHOLD, initialElapsedSeconds: 862,   stopReason: '',   dailyProduction: 1300,  dailyTarget: 1500,  bottleneckReason: '' },
];

// ============================================
// 상태별 스타일
// ============================================
const statusConfig: Record<Status, {
  banner: string; text: string; border: string; bar: string;
  icon: React.ComponentType<{ className?: string }> | null;
}> = {
  RUN:   { banner: 'bg-emerald-400', text: 'text-emerald-950', border: 'border-emerald-400/40', bar: 'bg-emerald-400', icon: null },
  IDLE: { banner: 'bg-amber-300',   text: 'text-amber-950',   border: 'border-amber-300/45',   bar: 'bg-amber-300',   icon: null },
  STOP:  { banner: 'bg-rose-500',    text: 'text-white',       border: 'border-rose-500/70',    bar: 'bg-rose-500',    icon: AlertTriangle },
  SETUP: { banner: 'bg-sky-400',     text: 'text-sky-950',     border: 'border-sky-400/40',     bar: 'bg-sky-400',     icon: null },
};
const statusLabel: Record<Status, string> = { RUN: '가동중', IDLE: '대기', STOP: '정지', SETUP: '셋업' };
const statusDot: Record<Status, string> = { RUN: 'bg-emerald-400', IDLE: 'bg-amber-300', STOP: 'bg-rose-500', SETUP: 'bg-sky-400' };

// ============================================
// 유틸리티
// ============================================
function getCategory(no: number): string {
  if (no <= 4) return '내지';
  if (no <= 11) return '표지';
  if (no <= 17) return '제본';
  return '포장';
}

function formatElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const DAY_LABELS = ['화', '수', '목', '금', '토', '일', '월'];
function getLast7Days(base: number, seed: number) {
  return DAY_LABELS.map((day, i) => {
    const isWeekend = i === 4 || i === 5;
    const factor = isWeekend ? 0.28 + ((seed + i) % 8) / 100 : 0.9 + ((seed * 3 + i * 17) % 18) / 100;
    return { day, value: Math.round(base * factor) };
  });
}
function getMonthlyTotal(daily: number, seed: number): number {
  return Math.round(daily * 20.5 + seed * 211);
}
function getAchievementRate(monthly: number, dailyTarget: number): number {
  if (dailyTarget <= 0) return 0;
  return Math.round((monthly / (dailyTarget * 30)) * 100);
}

// ============================================
// 개별 공정 카드
// ============================================
const ProcessCard: React.FC<{
  process: ProcessData;
  onSelect?: (no: number) => void;
  now: number;
  mountTime: number;
}> = ({ process, onSelect, now, mountTime }) => {
  const cfg = statusConfig[process.status];
  const StatusIcon = cfg.icon;
  const isStop = process.status === 'STOP';
  const isRunning = process.status === 'RUN';
  const isIdle = process.status === 'IDLE';

  const displayQueue = isIdle ? 0 : process.queue;
  const displayQueueCount = isIdle ? 0 : process.queueCount;
  const displayProgress = isRunning ? process.jobProgress : 0;
  const isOverloaded = isRunning && displayQueue >= process.queueThreshold;
  const cardAnimation = isStop ? 'animate-stop-pulse' : '';

  const queueBoxClass = isOverloaded
    ? 'border-amber-500/60 animate-overload-box'
    : 'bg-amber-300/10 border-amber-300/20';
  const queueTextClass = isOverloaded ? 'text-amber-300' : 'text-amber-200';

  const elapsedSeconds = process.initialElapsedSeconds + Math.floor((now - mountTime) / 1000);

  return (
    <div
      onClick={() => onSelect?.(process.no)}
      className={`rounded-md overflow-hidden border ${cfg.border} bg-gray-900 flex flex-col cursor-pointer hover:brightness-110 hover:ring-1 hover:ring-white/20 transition ${cardAnimation}`}
    >
      {/* 상태 배너 */}
      <div
        className={`${cfg.banner} ${cfg.text} px-2.5 py-1 flex items-center justify-between text-[11px] font-bold ${
          isStop ? 'animate-stop-banner' : ''
        }`}
      >
        <span className="flex items-center gap-1 tracking-wide min-w-0 truncate">
          {StatusIcon && <StatusIcon className="w-3 h-3 shrink-0" />}
          <span>{process.status}</span>
          {isStop && process.stopReason && (
            <>
              <span className="opacity-50">·</span>
              <span className="font-semibold opacity-90 truncate">
                {process.stopReason} {stopCodeNames[process.stopReason] || ''}
              </span>
            </>
          )}
        </span>
        <span className="flex items-center gap-1 shrink-0 ml-1">
          {isOverloaded && <AlertTriangle className="w-3 h-3 text-amber-700" />}
          <span className="font-mono opacity-70">{String(process.no).padStart(2, '0')}</span>
        </span>
      </div>

      {/* 카드 본문 */}
      <div className="p-2.5 flex-1 flex flex-col">
        <h3 className="text-gray-100 text-[13px] font-semibold mb-2 truncate" title={process.name}>
          {process.name}
        </h3>

        {/* 2개 수치 박스: 대기물량 / 대기건수 */}
        <div className="grid grid-cols-2 gap-1 mb-2">
          <div className={`border rounded px-1.5 py-1.5 text-center ${queueBoxClass}`}>
            <p className="text-[9px] text-gray-400 leading-tight">대기물량</p>
            <p className={`text-[14px] font-bold leading-tight mt-0.5 ${queueTextClass}`}>
              {displayQueue.toLocaleString()}
            </p>
          </div>
          <div className="bg-sky-400/10 border border-sky-400/20 rounded px-1.5 py-1.5 text-center">
            <p className="text-[9px] text-gray-400 leading-tight">대기건수</p>
            <p className="text-[14px] font-bold text-sky-200 leading-tight mt-0.5">
              {displayQueueCount}
            </p>
          </div>
        </div>

        {/* 진행률 바 + 소요시간 */}
        <div className="mt-auto">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 mb-0.5">
            <span className="text-[9px] text-gray-500">진행률 / 소요시간</span>
            <span className="text-[10px] font-bold text-gray-200 font-mono tabular-nums ml-auto">
              {displayProgress}%&nbsp; {formatElapsed(elapsedSeconds)}
            </span>
          </div>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div className={`h-full ${cfg.bar} rounded-full transition-all`} style={{ width: `${displayProgress}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================
// 상세 패널
// ============================================
const InfoRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-center justify-between py-3.5">
    <span className="text-sm text-gray-400">{label}</span>
    <span className="text-sm">{children}</span>
  </div>
);

const DetailPanel: React.FC<{ process: ProcessData; onClose: () => void }> = ({ process, onClose }) => {
  const last7 = useMemo(() => getLast7Days(process.dailyProduction, process.no), [process]);
  const monthly = useMemo(() => getMonthlyTotal(process.dailyProduction, process.no), [process]);
  const rate = getAchievementRate(monthly, process.dailyTarget);
  const category = getCategory(process.no);

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-full max-w-md bg-gray-950 border-l border-gray-800 z-50 overflow-y-auto shadow-2xl">
        <div className="p-5 border-b border-gray-800 sticky top-0 bg-gray-950 z-10">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-100">{process.name}</h2>
              <p className="text-xs text-gray-500 mt-1 tracking-wide">
                NO {process.no} · {process.model || '-'} · {process.maker || '-'} · {category}
              </p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-200 p-1 hover:bg-gray-800 rounded transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="px-5 divide-y divide-gray-800/60">
          <InfoRow label="금일 생산량">
            <span className="text-xl font-bold text-white">{process.dailyProduction.toLocaleString()}</span>
          </InfoRow>
          <InfoRow label="일 목표">
            <span className="text-gray-300">{process.dailyTarget.toLocaleString()}</span>
          </InfoRow>
          <InfoRow label="현재 상태">
            <span className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${statusDot[process.status]}`} />
              <span className="text-gray-200">{statusLabel[process.status]}</span>
            </span>
          </InfoRow>
          <InfoRow label="금일 정지 사유">
            {process.stopReason ? (
              <span className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-xs font-medium border border-indigo-500/30">
                  {process.stopReason}
                </span>
                <span className="text-xs text-gray-400">{stopCodeNames[process.stopReason] || ''}</span>
              </span>
            ) : (
              <span className="text-gray-500">없음</span>
            )}
          </InfoRow>
          <InfoRow label="금일 병목 사유">
            {process.bottleneckReason ? (
              <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-xs font-medium border border-amber-500/30">
                {process.bottleneckReason}
              </span>
            ) : (
              <span className="text-gray-500">없음</span>
            )}
          </InfoRow>
        </div>

        <div className="px-5 pt-5 pb-2">
          <h3 className="text-sm font-bold text-gray-200 mb-3">최근 7일 생산량</h3>
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={last7} margin={{ top: 5, right: 5, bottom: 0, left: -12 }}>
              <XAxis dataKey="day" tick={{ fill: '#9ca3af', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: 8, color: '#f3f4f6' }}
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                formatter={(v: number) => [`${v.toLocaleString()}매`, '생산량']}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {last7.map((d, i) => (
                  <Cell key={i} fill={(i === 4 || i === 5) ? '#3b82f6' : '#60a5fa'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="px-5 pb-6 pt-2 grid grid-cols-2 gap-3">
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
            <p className="text-xs text-gray-500 mb-1">최근 30일 누적</p>
            <p className="text-2xl font-bold text-gray-100">{monthly.toLocaleString()}</p>
          </div>
          <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
            <p className="text-xs text-gray-500 mb-1">목표 달성률</p>
            <p className={`text-2xl font-bold ${rate >= 100 ? 'text-emerald-300' : rate >= 80 ? 'text-gray-100' : 'text-amber-300'}`}>
              {rate}%
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

// ============================================
// 화살표 / 그룹박스
// ============================================
const Arrow: React.FC<{ size?: 'sm' | 'lg' }> = ({ size = 'sm' }) => (
  <div className="flex items-center justify-center shrink-0">
    <ChevronRight className={`${size === 'lg' ? 'w-7 h-7' : 'w-4 h-4'} text-gray-600`} />
  </div>
);

const GroupBox: React.FC<{ title: string; titleColor?: string; children: React.ReactNode; className?: string }> = ({
  title, titleColor = 'text-sky-300', children, className = '',
}) => (
  <div className={`relative rounded-lg border border-dashed border-gray-700 px-3 pt-5 pb-3 ${className}`}>
    <span className={`absolute -top-2.5 left-3 px-2 bg-black text-[11px] font-bold tracking-wider ${titleColor}`}>
      {title}
    </span>
    {children}
  </div>
);

// ============================================
// 메인 컴포넌트
// ============================================
const ProcessFlowDiagram: React.FC = () => {
  const [selectedNo, setSelectedNo] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const mountTimeRef = useRef(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const p = useMemo(() => {
    const map: Record<number, ProcessData> = {};
    processes.forEach((proc) => { map[proc.no] = proc; });
    return map;
  }, []);

  const statusCounts = useMemo(() => {
    const counts = { RUN: 0, IDLE: 0, STOP: 0, SETUP: 0 };
    processes.forEach((proc) => counts[proc.status]++);
    return counts;
  }, []);

  const overloadedCount = useMemo(
    () => processes.filter((proc) => proc.status === 'RUN' && proc.queue >= proc.queueThreshold).length, []
  );

  const totals = useMemo(() => {
    let queue = 0, queueCount = 0, completed = 0;
    processes.forEach((proc) => {
      const isIdle = proc.status === 'IDLE';
      queue += isIdle ? 0 : proc.queue;
      queueCount += isIdle ? 0 : proc.queueCount;
      completed += proc.completed;
    });
    return { queue, queueCount, completed };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedNo(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const cardProps = { onSelect: setSelectedNo, now, mountTime: mountTimeRef.current };

  return (
    <div className="flex flex-col gap-4 p-5 bg-black min-h-full">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">제작공정 흐름도</h2>
          <p className="text-xs text-gray-500 mt-1">
            내지 · 표지 (병렬) → 제본 → 포장 · 실시간 상태 모니터링
            {overloadedCount > 0 && (
              <span className="ml-2 text-amber-400 font-medium">
                • 대기 초과 {overloadedCount}대 (기준 {DEFAULT_QUEUE_THRESHOLD.toLocaleString()})
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[11px]">
          <Legend color="emerald" label="RUN" />
          <Legend color="amber" label="IDLE" />
          <Legend color="rose" label="STOP" pulse />
          <Legend color="sky" label="SETUP" />
          <button className="flex items-center gap-1.5 px-2.5 py-1 ml-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium transition-colors text-[11px]">
            <RefreshCw className="w-3 h-3" />
            새로고침
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatusCount icon={Play} label="가동 중" count={statusCounts.RUN} total={19} color="emerald" />
        <StatusCount icon={Pause} label="대기" count={statusCounts.IDLE} color="amber" />
        <StatusCount icon={AlertCircle} label="정지" count={statusCounts.STOP} color="rose" pulse />
        <StatusCount icon={Settings} label="셋업" count={statusCounts.SETUP} color="sky" />
      </div>

      <div className="flex-1 grid grid-cols-1 xl:grid-cols-[1fr_auto_minmax(0,0.55fr)_auto_minmax(0,0.18fr)] gap-3 items-stretch">
        <div className="flex flex-col gap-3 min-w-0">
          <GroupBox title="내지" titleColor="text-sky-300">
            <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
              <ProcessCard process={p[1]} {...cardProps} />
              <Arrow />
              <ProcessCard process={p[3]} {...cardProps} />
              <ProcessCard process={p[2]} {...cardProps} />
              <Arrow />
              <ProcessCard process={p[4]} {...cardProps} />
            </div>
          </GroupBox>

          <GroupBox title="표지" titleColor="text-pink-300">
            <div className="grid gap-2 items-center" style={{ gridTemplateColumns: '1fr auto 1fr minmax(0,0.85fr) 1fr', gridTemplateRows: 'auto auto' }}>
              <div style={{ gridColumn: '1', gridRow: '1' }}><ProcessCard process={p[5]} {...cardProps} /></div>
              <div style={{ gridColumn: '2', gridRow: '1' }} className="flex items-center"><Arrow /></div>
              <div style={{ gridColumn: '3', gridRow: '1' }}><ProcessCard process={p[7]} {...cardProps} /></div>
              <div style={{ gridColumn: '5', gridRow: '1' }}><ProcessCard process={p[10]} {...cardProps} /></div>
              <div style={{ gridColumn: '1', gridRow: '2' }}><ProcessCard process={p[6]} {...cardProps} /></div>
              <div style={{ gridColumn: '2', gridRow: '2' }} className="flex items-center"><Arrow /></div>
              <div style={{ gridColumn: '3', gridRow: '2' }}><ProcessCard process={p[8]} {...cardProps} /></div>
              <div style={{ gridColumn: '5', gridRow: '2' }}><ProcessCard process={p[11]} {...cardProps} /></div>
              <div style={{ gridColumn: '4', gridRow: '1 / span 2' }} className="flex items-center">
                <ProcessCard process={p[9]} {...cardProps} />
              </div>
            </div>
          </GroupBox>
        </div>

        <div className="hidden xl:flex items-center justify-center"><Arrow size="lg" /></div>

        <div className="min-w-0">
          <GroupBox title="제본" titleColor="text-sky-300" className="h-full">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-2 h-full">
              {[12, 13, 14, 15, 16, 17].map((n) => (
                <ProcessCard key={n} process={p[n]} {...cardProps} />
              ))}
            </div>
          </GroupBox>
        </div>

        <div className="hidden xl:flex items-center justify-center"><Arrow size="lg" /></div>

        <div className="min-w-0">
          <GroupBox title="포장" titleColor="text-cyan-300" className="h-full">
            <div className="grid grid-cols-1 gap-2 h-full">
              <ProcessCard process={p[18]} {...cardProps} />
              <ProcessCard process={p[19]} {...cardProps} />
            </div>
          </GroupBox>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <TotalCard label="총 대기 물량" value={totals.queue} color="amber" border="border-l-amber-300/70" />
        <TotalCard label="총 대기 건수" value={totals.queueCount} unit="건" color="sky" border="border-l-sky-400/70" />
        <TotalCard label="전 공정 누적 제작완료" value={totals.completed} unit="매" color="emerald" border="border-l-emerald-400/70" />
      </div>

      {selectedNo !== null && p[selectedNo] && (
        <DetailPanel process={p[selectedNo]} onClose={() => setSelectedNo(null)} />
      )}
    </div>
  );
};

// ============================================
// 보조 컴포넌트
// ============================================
type PastelColor = 'emerald' | 'amber' | 'rose' | 'sky';

const Legend: React.FC<{ color: PastelColor; label: string; pulse?: boolean }> = ({ color, label, pulse }) => {
  const map: Record<PastelColor, string> = {
    emerald: 'bg-emerald-400/10 border-emerald-400/30 text-emerald-300',
    amber:   'bg-amber-300/10 border-amber-300/30 text-amber-200',
    rose:    'bg-rose-400/10 border-rose-400/30 text-rose-300',
    sky:     'bg-sky-400/10 border-sky-400/30 text-sky-300',
  };
  const dotMap: Record<PastelColor, string> = {
    emerald: 'bg-emerald-400', amber: 'bg-amber-300', rose: 'bg-rose-400', sky: 'bg-sky-400',
  };
  return (
    <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded border ${map[color]} font-medium`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotMap[color]} ${pulse ? 'animate-pulse' : ''}`}></span>
      {label}
    </span>
  );
};

const StatusCount: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string; count: number; total?: number; color: PastelColor; pulse?: boolean;
}> = ({ icon: Icon, label, count, total, color, pulse }) => {
  const bgMap: Record<PastelColor, string> = {
    emerald: 'bg-emerald-400/15 text-emerald-300',
    amber:   'bg-amber-300/15 text-amber-200',
    rose:    'bg-rose-400/15 text-rose-300',
    sky:     'bg-sky-400/15 text-sky-300',
  };
  return (
    <div className={`bg-gray-900 rounded-lg p-3 border border-gray-800 flex items-center gap-3 ${pulse && count > 0 ? 'animate-stop-pulse' : ''}`}>
      <div className={`w-10 h-10 rounded flex items-center justify-center ${bgMap[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xl font-bold text-gray-100 leading-tight">
          {count}
          {total !== undefined && <span className="text-xs text-gray-500 font-normal ml-1">/ {total}</span>}
        </p>
        <p className="text-[11px] text-gray-400">{label}</p>
      </div>
    </div>
  );
};

const TotalCard: React.FC<{
  label: string; value: number; unit?: string;
  color?: 'white' | 'amber' | 'rose' | 'sky' | 'emerald'; border?: string;
}> = ({ label, value, unit, color = 'white', border = '' }) => {
  const colorMap = {
    white: 'text-gray-100', amber: 'text-amber-200', rose: 'text-rose-300', sky: 'text-sky-200', emerald: 'text-emerald-200',
  };
  return (
    <div className={`bg-gray-900 rounded-lg px-4 py-3 border border-gray-800 ${border ? `border-l-4 ${border}` : ''}`}>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${colorMap[color]}`}>
        {value.toLocaleString()}
        {unit && <span className="text-sm text-gray-500 font-normal ml-1">{unit}</span>}
      </p>
    </div>
  );
};

export default ProcessFlowDiagram;
