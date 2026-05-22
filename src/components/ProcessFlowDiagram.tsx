// src/components/ProcessFlowDiagram.tsx
'use client';

import React, { useMemo } from 'react';
import { Play, Pause, AlertCircle, Settings, ChevronRight, RefreshCw, AlertTriangle } from 'lucide-react';

type Status = 'RUN' | 'IDLE' | 'STOP' | 'SETUP';

interface ProcessData {
  no: number;
  name: string;
  model: string;
  maker: string;
  status: Status;
  queue: number;          // 대기 (제작 대기 중인 물량)
  inProgress: number;     // 제작중 (현재 작업 중인 물량)
  completed: number;      // 제작완료 (완료된 물량)
  jobProgress: number;    // 현재 제작중 job 진행률 (0~100)
  queueThreshold: number; // 대기 물량 기준치 (이 값 이상이면 하이라이트)
}

// ============================================
// 대기 물량 기준치 (예시: 전체 5,000으로 설정)
// 추후 장비별로 다르게 지정 가능
// ============================================
const DEFAULT_QUEUE_THRESHOLD = 5000;

// ============================================
// 19개 공정 데이터
//  ⚠ 일부 장비는 대기 5,000 초과로 설정 (하이라이트 시뮬레이션)
//    → no.2 (6,240), no.4 (5,761), no.10 (5,430)
// ============================================
const processes: ProcessData[] = [
  { no: 1,  name: '연속지출력 1호기', model: '520HD+',       maker: 'SCREEN',     status: 'RUN',   queue: 3682, inProgress: 1280, completed: 9318, jobProgress: 65, queueThreshold: DEFAULT_QUEUE_THRESHOLD },
  { no: 2,  name: '연속지출력 2호기', model: '520HD+',       maker: 'SCREEN',     status: 'RUN',   queue: 6240, inProgress: 2388, completed: 7939, jobProgress: 42, queueThreshold: DEFAULT_QUEUE_THRESHOLD },
  { no: 3,  name: 'R2C 1호기',       model: 'S2020',        maker: 'TECHNAU',    status: 'RUN',   queue: 4953, inProgress: 1190, completed: 5047, jobProgress: 78, queueThreshold: DEFAULT_QUEUE_THRESHOLD },
  { no: 4,  name: 'R2C 2호기',       model: 'S2320',        maker: 'TECHNAU',    status: 'IDLE',  queue: 5761, inProgress: 2071, completed: 4239, jobProgress: 0,  queueThreshold: DEFAULT_QUEUE_THRESHOLD },
  { no: 5,  name: '날장출력 1호기',   model: '이리데스',      maker: 'FUJI FILM',  status: 'RUN',   queue: 1076, inProgress: 488,  completed: 2424, jobProgress: 55, queueThreshold: DEFAULT_QUEUE_THRESHOLD },
  { no: 6,  name: '날장출력 2호기',   model: '레보리아',      maker: 'FUJI FILM',  status: 'STOP',  queue: 2786, inProgress: 991,  completed: 714,  jobProgress: 30, queueThreshold: DEFAULT_QUEUE_THRESHOLD },
  { no: 7,  name: '코팅 1호기',       model: 'EUROLAM 540',  maker: 'GMP',        status: 'RUN',   queue: 598,  inProgress: 800,  completed: 4402, jobProgress: 88, queueThreshold: DEFAULT_QUEUE_THRESHOLD },
  { no: 8,  name: '코팅 2호기',       model: 'PROTOPIC 540', maker: 'GMP',        status: 'SETUP', queue: 2471, inProgress: 726,  completed: 2529, jobProgress: 15, queueThreshold: DEFAULT_QUEUE_THRESHOLD },
  { no: 9,  name: '에폭시',           model: 'DDC 810',      maker: 'DUPLO',      status: 'RUN',   queue: 664,  inProgress: 361,  completed: 1336, jobProgress: 72, queueThreshold: DEFAULT_QUEUE_THRESHOLD },
  { no: 10, name: '수동재단 1호기',   model: 'POLAR 92',     maker: 'HEIDELBERG', status: 'RUN',   queue: 5430, inProgress: 695,  completed: 3373, jobProgress: 60, queueThreshold: DEFAULT_QUEUE_THRESHOLD },
  { no: 11, name: '수동재단 2호기',   model: 'C860',         maker: '대호',        status: 'IDLE',  queue: 3198, inProgress: 1211, completed: 2802, jobProgress: 0,  queueThreshold: DEFAULT_QUEUE_THRESHOLD },
  { no: 12, name: '제본 1호기',       model: 'BQ470/HT80',   maker: 'HORIZON',    status: 'RUN',   queue: 500,  inProgress: 273,  completed: 1500, jobProgress: 80, queueThreshold: DEFAULT_QUEUE_THRESHOLD },
  { no: 13, name: '제본 2호기',       model: 'BQ470/HT80',   maker: 'HORIZON',    status: 'RUN',   queue: 712,  inProgress: 143,  completed: 1288, jobProgress: 90, queueThreshold: DEFAULT_QUEUE_THRESHOLD },
  { no: 14, name: '제본 3호기',       model: 'BQ500/HT300',  maker: 'HORIZON',    status: 'STOP',  queue: 1818, inProgress: 863,  completed: 382,  jobProgress: 20, queueThreshold: DEFAULT_QUEUE_THRESHOLD },
  { no: 15, name: '중철기',           model: 'SPF-200A',     maker: 'HORIZON',    status: 'RUN',   queue: 589,  inProgress: 322,  completed: 2911, jobProgress: 75, queueThreshold: DEFAULT_QUEUE_THRESHOLD },
  { no: 16, name: '날개접지기',       model: 'ZK320',        maker: '',           status: 'SETUP', queue: 1327, inProgress: 568,  completed: 1173, jobProgress: 10, queueThreshold: DEFAULT_QUEUE_THRESHOLD },
  { no: 17, name: '시험지접지기',     model: 'CSMO',         maker: 'HUNKELER',   status: 'IDLE',  queue: 1278, inProgress: 548,  completed: 522,  jobProgress: 0,  queueThreshold: DEFAULT_QUEUE_THRESHOLD },
  { no: 18, name: '박스포장',         model: '',             maker: '',           status: 'RUN',   queue: 730,  inProgress: 297,  completed: 770,  jobProgress: 50, queueThreshold: DEFAULT_QUEUE_THRESHOLD },
  { no: 19, name: '댐지포장',         model: '',             maker: '',           status: 'IDLE',  queue: 854,  inProgress: 508,  completed: 646,  jobProgress: 0,  queueThreshold: DEFAULT_QUEUE_THRESHOLD },
];

// ============================================
// 상태별 스타일 — 파스텔 톤
// ============================================
const statusConfig: Record<Status, {
  banner: string;
  text: string;
  border: string;
  bar: string;
  icon: React.ComponentType<{ className?: string }> | null;
}> = {
  RUN:   { banner: 'bg-emerald-400', text: 'text-emerald-950', border: 'border-emerald-400/40', bar: 'bg-emerald-400', icon: null },
  IDLE:  { banner: 'bg-amber-300',   text: 'text-amber-950',   border: 'border-amber-300/45',   bar: 'bg-amber-300',   icon: null },
  STOP:  { banner: 'bg-rose-500',    text: 'text-white',       border: 'border-rose-500/70',    bar: 'bg-rose-500',    icon: AlertTriangle },
  SETUP: { banner: 'bg-sky-400',     text: 'text-sky-950',     border: 'border-sky-400/40',     bar: 'bg-sky-400',     icon: null },
};

// ============================================
// 개별 공정 카드
// ============================================
const ProcessCard: React.FC<{ process: ProcessData }> = ({ process }) => {
  const cfg = statusConfig[process.status];
  const StatusIcon = cfg.icon;
  const isStop = process.status === 'STOP';
  const isOverloaded = process.queue >= process.queueThreshold;

  // 카드 글로우: STOP 우선, 그 다음 대기 초과
  const cardAnimation = isStop
    ? 'animate-stop-pulse'
    : isOverloaded
    ? 'animate-overload-pulse'
    : '';

  // 대기 박스 색상 (초과 시 주황 강조 + 깜박임)
  const queueBoxClass = isOverloaded
    ? 'border-amber-500/60 animate-overload-box'
    : 'bg-amber-300/10 border-amber-300/20';
  const queueTextClass = isOverloaded ? 'text-amber-300' : 'text-amber-200';

  return (
    <div
      className={`rounded-md overflow-hidden border ${
        isOverloaded && !isStop ? 'border-amber-500/60' : cfg.border
      } bg-gray-900 flex flex-col ${cardAnimation}`}
    >
      {/* 상태 배너 */}
      <div
        className={`${cfg.banner} ${cfg.text} px-2.5 py-1 flex items-center justify-between text-[11px] font-bold ${
          isStop ? 'animate-stop-banner' : ''
        }`}
      >
        <span className="flex items-center gap-1 tracking-wide">
          {StatusIcon && <StatusIcon className="w-3 h-3" />}
          {process.status}
        </span>
        <span className="flex items-center gap-1">
          {isOverloaded && (
            <AlertTriangle className="w-3 h-3 text-amber-700" />
          )}
          <span className="font-mono opacity-70">{String(process.no).padStart(2, '0')}</span>
        </span>
      </div>

      {/* 카드 본문 */}
      <div className="p-2.5 flex-1 flex flex-col">
        {/* 공정명 */}
        <h3 className="text-gray-100 text-[13px] font-semibold mb-2 truncate" title={process.name}>
          {process.name}
        </h3>

        {/* 3개 수치 박스: 대기 / 제작중 / 제작완료 */}
        <div className="grid grid-cols-3 gap-1 mb-2">
          {/* 대기 (초과 시 강조) */}
          <div className={`border rounded px-1 py-1 text-center ${queueBoxClass}`}>
            <p className="text-[9px] text-gray-400 leading-tight">대기</p>
            <p className={`text-[13px] font-bold leading-tight mt-0.5 ${queueTextClass}`}>
              {process.queue.toLocaleString()}
            </p>
          </div>
          {/* 제작중 */}
          <div className="bg-sky-400/10 border border-sky-400/20 rounded px-1 py-1 text-center">
            <p className="text-[9px] text-gray-400 leading-tight">제작중</p>
            <p className="text-[13px] font-bold text-sky-200 leading-tight mt-0.5">
              {process.inProgress.toLocaleString()}
            </p>
          </div>
          {/* 제작완료 */}
          <div className="bg-emerald-400/10 border border-emerald-400/20 rounded px-1 py-1 text-center">
            <p className="text-[9px] text-gray-400 leading-tight">제작완료</p>
            <p className="text-[13px] font-bold text-emerald-200 leading-tight mt-0.5">
              {process.completed.toLocaleString()}
            </p>
          </div>
        </div>

        {/* 진행률 바 (두껍게 + % 표시) — 현재 제작중 job 진행률 */}
        <div className="mt-auto">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[9px] text-gray-500">현재 작업 진행률</span>
            <span className="text-[10px] font-bold text-gray-200 tabular-nums">{process.jobProgress}%</span>
          </div>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-full ${cfg.bar} rounded-full transition-all`}
              style={{ width: `${process.jobProgress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================
// 화살표
// ============================================
const Arrow: React.FC<{ size?: 'sm' | 'lg' }> = ({ size = 'sm' }) => (
  <div className="flex items-center justify-center shrink-0">
    <ChevronRight className={`${size === 'lg' ? 'w-7 h-7' : 'w-4 h-4'} text-gray-600`} />
  </div>
);

// ============================================
// 그룹 컨테이너
// ============================================
const GroupBox: React.FC<{
  title: string;
  titleColor?: string;
  children: React.ReactNode;
  className?: string;
}> = ({ title, titleColor = 'text-sky-300', children, className = '' }) => (
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

  // 대기 초과 장비 수
  const overloadedCount = useMemo(
    () => processes.filter((proc) => proc.queue >= proc.queueThreshold).length,
    []
  );

  const totals = useMemo(() => {
    let queue = 0, inProgress = 0, completed = 0;
    processes.forEach((proc) => {
      queue += proc.queue;
      inProgress += proc.inProgress;
      completed += proc.completed;
    });
    return { queue, inProgress, completed };
  }, []);

  return (
    <div className="flex flex-col gap-4 p-5 bg-black min-h-full">
      {/* 상단 헤더 */}
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

      {/* 상태별 카운트 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatusCount icon={Play} label="가동 중" count={statusCounts.RUN} total={19} color="emerald" />
        <StatusCount icon={Pause} label="대기 중" count={statusCounts.IDLE} color="amber" />
        <StatusCount icon={AlertCircle} label="정지" count={statusCounts.STOP} color="rose" pulse />
        <StatusCount icon={Settings} label="셋업" count={statusCounts.SETUP} color="sky" />
      </div>

      {/* 메인 흐름도 */}
      <div className="flex-1 grid grid-cols-1 xl:grid-cols-[1fr_auto_minmax(0,0.55fr)_auto_minmax(0,0.18fr)] gap-3 items-stretch">
        
        {/* 좌측: 내지 + 표지 */}
        <div className="flex flex-col gap-3 min-w-0">
          <GroupBox title="내지" titleColor="text-sky-300">
            <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
              <ProcessCard process={p[1]} />
              <Arrow />
              <ProcessCard process={p[3]} />
              <ProcessCard process={p[2]} />
              <Arrow />
              <ProcessCard process={p[4]} />
            </div>
          </GroupBox>

          <GroupBox title="표지" titleColor="text-pink-300">
            <div
              className="grid gap-2 items-center"
              style={{
                gridTemplateColumns: '1fr auto 1fr minmax(0,0.85fr) 1fr',
                gridTemplateRows: 'auto auto',
              }}
            >
              <div style={{ gridColumn: '1', gridRow: '1' }}><ProcessCard process={p[5]} /></div>
              <div style={{ gridColumn: '2', gridRow: '1' }} className="flex items-center"><Arrow /></div>
              <div style={{ gridColumn: '3', gridRow: '1' }}><ProcessCard process={p[7]} /></div>
              <div style={{ gridColumn: '5', gridRow: '1' }}><ProcessCard process={p[10]} /></div>

              <div style={{ gridColumn: '1', gridRow: '2' }}><ProcessCard process={p[6]} /></div>
              <div style={{ gridColumn: '2', gridRow: '2' }} className="flex items-center"><Arrow /></div>
              <div style={{ gridColumn: '3', gridRow: '2' }}><ProcessCard process={p[8]} /></div>
              <div style={{ gridColumn: '5', gridRow: '2' }}><ProcessCard process={p[11]} /></div>

              <div style={{ gridColumn: '4', gridRow: '1 / span 2' }} className="flex items-center">
                <ProcessCard process={p[9]} />
              </div>
            </div>
          </GroupBox>
        </div>

        <div className="hidden xl:flex items-center justify-center">
          <Arrow size="lg" />
        </div>

        {/* 중앙: 제본 */}
        <div className="min-w-0">
          <GroupBox title="제본" titleColor="text-sky-300" className="h-full">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-2 h-full">
              {[12, 13, 14, 15, 16, 17].map((n) => (
                <ProcessCard key={n} process={p[n]} />
              ))}
            </div>
          </GroupBox>
        </div>

        <div className="hidden xl:flex items-center justify-center">
          <Arrow size="lg" />
        </div>

        {/* 우측: 포장 */}
        <div className="min-w-0">
          <GroupBox title="포장" titleColor="text-cyan-300" className="h-full">
            <div className="grid grid-cols-1 gap-2 h-full">
              <ProcessCard process={p[18]} />
              <ProcessCard process={p[19]} />
            </div>
          </GroupBox>
        </div>
      </div>

      {/* 하단 합계 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <TotalCard label="총 대기 물량" value={totals.queue} color="amber" border="border-l-amber-300/70" />
        <TotalCard label="총 제작중 물량" value={totals.inProgress} color="sky" border="border-l-sky-400/70" />
        <TotalCard label="총 제작완료" value={totals.completed} unit="매" color="emerald" border="border-l-emerald-400/70" />
      </div>
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
    emerald: 'bg-emerald-400',
    amber:   'bg-amber-300',
    rose:    'bg-rose-400',
    sky:     'bg-sky-400',
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
  label: string;
  count: number;
  total?: number;
  color: PastelColor;
  pulse?: boolean;
}> = ({ icon: Icon, label, count, total, color, pulse }) => {
  const bgMap: Record<PastelColor, string> = {
    emerald: 'bg-emerald-400/15 text-emerald-300',
    amber:   'bg-amber-300/15 text-amber-200',
    rose:    'bg-rose-400/15 text-rose-300',
    sky:     'bg-sky-400/15 text-sky-300',
  };
  return (
    <div
      className={`bg-gray-900 rounded-lg p-3 border border-gray-800 flex items-center gap-3 ${
        pulse && count > 0 ? 'animate-stop-pulse' : ''
      }`}
    >
      <div className={`w-10 h-10 rounded flex items-center justify-center ${bgMap[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xl font-bold text-gray-100 leading-tight">
          {count}
          {total !== undefined && (
            <span className="text-xs text-gray-500 font-normal ml-1">/ {total}</span>
          )}
        </p>
        <p className="text-[11px] text-gray-400">{label}</p>
      </div>
    </div>
  );
};

const TotalCard: React.FC<{
  label: string;
  value: number;
  unit?: string;
  color?: 'white' | 'amber' | 'rose' | 'sky' | 'emerald';
  border?: string;
}> = ({ label, value, unit, color = 'white', border = '' }) => {
  const colorMap = {
    white:   'text-gray-100',
    amber:   'text-amber-200',
    rose:    'text-rose-300',
    sky:     'text-sky-200',
    emerald: 'text-emerald-200',
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
