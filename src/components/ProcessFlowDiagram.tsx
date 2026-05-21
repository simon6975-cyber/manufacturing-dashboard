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
  production: number;
  waiting: number;
  remaining: number;
}

// ============================================
// 19개 공정 데이터
// ============================================
const processes: ProcessData[] = [
  // 내지 (1~4)
  { no: 1, name: '연속지출력 1호기', model: '520HD+', maker: 'SCREEN', status: 'RUN', production: 9318, waiting: 1280, remaining: 3682 },
  { no: 2, name: '연속지출력 2호기', model: '520HD+', maker: 'SCREEN', status: 'RUN', production: 7939, waiting: 2388, remaining: 5061 },
  { no: 3, name: 'R2C 1호기', model: 'S2020', maker: 'TECHNAU', status: 'RUN', production: 5047, waiting: 1190, remaining: 4953 },
  { no: 4, name: 'R2C 2호기', model: 'S2320', maker: 'TECHNAU', status: 'IDLE', production: 4239, waiting: 2071, remaining: 5761 },
  // 표지 (5~11)
  { no: 5, name: '날장출력 1호기', model: '이리데스', maker: 'FUJI FILM', status: 'RUN', production: 2424, waiting: 488, remaining: 1076 },
  { no: 6, name: '날장출력 2호기', model: '레보리아', maker: 'FUJI FILM', status: 'STOP', production: 714, waiting: 991, remaining: 2786 },
  { no: 7, name: '코팅 1호기', model: 'EUROLAM 540', maker: 'GMP', status: 'RUN', production: 4402, waiting: 800, remaining: 598 },
  { no: 8, name: '코팅 2호기', model: 'PROTOPIC 540', maker: 'GMP', status: 'SETUP', production: 2529, waiting: 726, remaining: 2471 },
  { no: 9, name: '에폭시', model: 'DDC 810', maker: 'DUPLO', status: 'RUN', production: 1336, waiting: 361, remaining: 664 },
  { no: 10, name: '수동재단 1호기', model: 'POLAR 92', maker: 'HEIDELBERG', status: 'RUN', production: 3373, waiting: 695, remaining: 2627 },
  { no: 11, name: '수동재단 2호기', model: 'C860', maker: '대호', status: 'IDLE', production: 2802, waiting: 1211, remaining: 3198 },
  // 제본 (12~17)
  { no: 12, name: '제본 1호기', model: 'BQ470/HT80', maker: 'HORIZON', status: 'RUN', production: 1500, waiting: 273, remaining: 500 },
  { no: 13, name: '제본 2호기', model: 'BQ470/HT80', maker: 'HORIZON', status: 'RUN', production: 1288, waiting: 143, remaining: 712 },
  { no: 14, name: '제본 3호기', model: 'BQ500/HT300', maker: 'HORIZON', status: 'STOP', production: 382, waiting: 863, remaining: 1818 },
  { no: 15, name: '중철기', model: 'SPF-200A', maker: 'HORIZON', status: 'RUN', production: 2911, waiting: 322, remaining: 589 },
  { no: 16, name: '날개접지기', model: 'ZK320', maker: '', status: 'SETUP', production: 1173, waiting: 568, remaining: 1327 },
  { no: 17, name: '시험지접지기', model: 'CSMO', maker: 'HUNKELER', status: 'IDLE', production: 522, waiting: 548, remaining: 1278 },
  // 포장 (18~19)
  { no: 18, name: '박스포장', model: '', maker: '', status: 'RUN', production: 770, waiting: 297, remaining: 730 },
  { no: 19, name: '댐지포장', model: '', maker: '', status: 'IDLE', production: 646, waiting: 508, remaining: 854 },
];

// ============================================
// 상태별 스타일 — 톤 다운된 색상 (예전 HTML 버전 느낌)
// ============================================
const statusConfig: Record<Status, {
  banner: string;
  text: string;
  border: string;
  bar: string;
  icon: React.ComponentType<{ className?: string }> | null;
}> = {
  RUN:   { banner: 'bg-green-700/85',  text: 'text-green-50',  border: 'border-green-700/40',  bar: 'bg-green-600/80',  icon: null },
  IDLE:  { banner: 'bg-amber-700/85',  text: 'text-amber-50',  border: 'border-amber-700/40',  bar: 'bg-amber-600/80',  icon: null },
  STOP:  { banner: 'bg-red-700/85',    text: 'text-red-50',    border: 'border-red-700/40',    bar: 'bg-red-600/80',    icon: AlertTriangle },
  SETUP: { banner: 'bg-blue-700/85',   text: 'text-blue-50',   border: 'border-blue-700/40',   bar: 'bg-blue-600/80',   icon: null },
};

// ============================================
// 개별 공정 카드
// ============================================
const ProcessCard: React.FC<{ process: ProcessData }> = ({ process }) => {
  const cfg = statusConfig[process.status];
  const StatusIcon = cfg.icon;
  const total = process.production + process.remaining;
  const progress = total > 0 ? (process.production / total) * 100 : 0;

  return (
    <div className={`rounded-md overflow-hidden border ${cfg.border} bg-gray-900 flex flex-col`}>
      {/* 상태 배너 */}
      <div className={`${cfg.banner} ${cfg.text} px-2.5 py-1 flex items-center justify-between text-[11px] font-bold`}>
        <span className="flex items-center gap-1 tracking-wide">
          {StatusIcon && <StatusIcon className="w-3 h-3" />}
          {process.status}
        </span>
        <span className="font-mono opacity-70">{String(process.no).padStart(2, '0')}</span>
      </div>

      {/* 카드 본문 */}
      <div className="p-2.5 flex-1 flex flex-col">
        {/* 공정명 */}
        <h3 className="text-gray-100 text-[13px] font-semibold mb-2 truncate" title={process.name}>
          {process.name}
        </h3>

        {/* 3개 수치 박스 */}
        <div className="grid grid-cols-3 gap-1 mb-1.5">
          <div className="bg-gray-800/50 border border-gray-700/30 rounded px-1 py-1 text-center">
            <p className="text-[9px] text-gray-500 leading-tight">생산</p>
            <p className="text-[13px] font-bold text-gray-100 leading-tight mt-0.5">
              {process.production.toLocaleString()}
            </p>
          </div>
          <div className="bg-amber-950/25 border border-amber-900/20 rounded px-1 py-1 text-center">
            <p className="text-[9px] text-gray-500 leading-tight">대기</p>
            <p className="text-[13px] font-bold text-amber-500/90 leading-tight mt-0.5">
              {process.waiting.toLocaleString()}
            </p>
          </div>
          <div className="bg-red-950/25 border border-red-900/20 rounded px-1 py-1 text-center">
            <p className="text-[9px] text-gray-500 leading-tight">잔여</p>
            <p className="text-[13px] font-bold text-red-500/90 leading-tight mt-0.5">
              {process.remaining.toLocaleString()}
            </p>
          </div>
        </div>

        {/* 진행률 바 */}
        <div className="h-0.5 bg-gray-800 rounded-full overflow-hidden mt-auto">
          <div className={`h-full ${cfg.bar} transition-all`} style={{ width: `${progress}%` }} />
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
    <ChevronRight className={`${size === 'lg' ? 'w-7 h-7' : 'w-4 h-4'} text-gray-700`} />
  </div>
);

// ============================================
// 그룹 컨테이너 (점선 테두리 + 컬러 제목)
// ============================================
const GroupBox: React.FC<{
  title: string;
  titleColor?: string;
  children: React.ReactNode;
  className?: string;
}> = ({ title, titleColor = 'text-blue-500/80', children, className = '' }) => (
  <div className={`relative rounded-lg border border-dashed border-gray-800 px-3 pt-5 pb-3 ${className}`}>
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
  // 공정 번호로 빠르게 가져오기
  const p = useMemo(() => {
    const map: Record<number, ProcessData> = {};
    processes.forEach((proc) => { map[proc.no] = proc; });
    return map;
  }, []);

  // 상태별 카운트
  const statusCounts = useMemo(() => {
    const counts = { RUN: 0, IDLE: 0, STOP: 0, SETUP: 0 };
    processes.forEach((proc) => counts[proc.status]++);
    return counts;
  }, []);

  // 합계
  const totals = useMemo(() => {
    let production = 0, waiting = 0, remaining = 0;
    processes.forEach((proc) => {
      production += proc.production;
      waiting += proc.waiting;
      remaining += proc.remaining;
    });
    return { production, waiting, remaining };
  }, []);

  return (
    <div className="flex flex-col gap-4 p-5 bg-black min-h-full">
      {/* 상단 헤더 */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-100">제작공정 흐름도</h2>
          <p className="text-xs text-gray-500 mt-1">
            내지 · 표지 (병렬) → 제본 → 포장 · 실시간 상태 모니터링
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[11px]">
          <Legend color="green" label="RUN" />
          <Legend color="amber" label="IDLE" />
          <Legend color="red" label="STOP" />
          <Legend color="blue" label="SETUP" />
          <button className="flex items-center gap-1.5 px-2.5 py-1 ml-1 rounded bg-gray-800/80 hover:bg-gray-700 text-gray-400 font-medium transition-colors text-[11px]">
            <RefreshCw className="w-3 h-3" />
            새로고침
          </button>
        </div>
      </div>

      {/* 상태별 카운트 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatusCount icon={Play} label="가동 중" count={statusCounts.RUN} total={19} color="green" />
        <StatusCount icon={Pause} label="대기 중" count={statusCounts.IDLE} color="amber" />
        <StatusCount icon={AlertCircle} label="정지" count={statusCounts.STOP} color="red" />
        <StatusCount icon={Settings} label="셋업" count={statusCounts.SETUP} color="blue" />
      </div>

      {/* 메인 흐름도 */}
      <div className="flex-1 grid grid-cols-1 xl:grid-cols-[1fr_auto_minmax(0,0.55fr)_auto_minmax(0,0.18fr)] gap-3 items-stretch">
        
        {/* === 좌측: 내지 + 표지 === */}
        <div className="flex flex-col gap-3 min-w-0">
          {/* 내지 */}
          <GroupBox title="내지" titleColor="text-blue-500/80">
            <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
              <ProcessCard process={p[1]} />
              <Arrow />
              <ProcessCard process={p[3]} />
              <ProcessCard process={p[2]} />
              <Arrow />
              <ProcessCard process={p[4]} />
            </div>
          </GroupBox>

          {/* 표지 */}
          <GroupBox title="표지" titleColor="text-pink-500/80">
            <div
              className="grid gap-2 items-center"
              style={{
                gridTemplateColumns: '1fr auto 1fr minmax(0,0.85fr) 1fr',
                gridTemplateRows: 'auto auto',
              }}
            >
              {/* row 1 */}
              <div style={{ gridColumn: '1', gridRow: '1' }}><ProcessCard process={p[5]} /></div>
              <div style={{ gridColumn: '2', gridRow: '1' }} className="flex items-center"><Arrow /></div>
              <div style={{ gridColumn: '3', gridRow: '1' }}><ProcessCard process={p[7]} /></div>
              <div style={{ gridColumn: '5', gridRow: '1' }}><ProcessCard process={p[10]} /></div>

              {/* row 2 */}
              <div style={{ gridColumn: '1', gridRow: '2' }}><ProcessCard process={p[6]} /></div>
              <div style={{ gridColumn: '2', gridRow: '2' }} className="flex items-center"><Arrow /></div>
              <div style={{ gridColumn: '3', gridRow: '2' }}><ProcessCard process={p[8]} /></div>
              <div style={{ gridColumn: '5', gridRow: '2' }}><ProcessCard process={p[11]} /></div>

              {/* 09 에폭시 - 가운데 (행 사이) */}
              <div style={{ gridColumn: '4', gridRow: '1 / span 2' }} className="flex items-center">
                <ProcessCard process={p[9]} />
              </div>
            </div>
          </GroupBox>
        </div>

        {/* 큰 화살표: 내지/표지 → 제본 */}
        <div className="hidden xl:flex items-center justify-center">
          <Arrow size="lg" />
        </div>

        {/* === 중앙: 제본 === */}
        <div className="min-w-0">
          <GroupBox title="제본" titleColor="text-blue-500/80" className="h-full">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-2 h-full">
              {[12, 13, 14, 15, 16, 17].map((n) => (
                <ProcessCard key={n} process={p[n]} />
              ))}
            </div>
          </GroupBox>
        </div>

        {/* 큰 화살표: 제본 → 포장 */}
        <div className="hidden xl:flex items-center justify-center">
          <Arrow size="lg" />
        </div>

        {/* === 우측: 포장 === */}
        <div className="min-w-0">
          <GroupBox title="포장" titleColor="text-cyan-500/80" className="h-full">
            <div className="grid grid-cols-1 gap-2 h-full">
              <ProcessCard process={p[18]} />
              <ProcessCard process={p[19]} />
            </div>
          </GroupBox>
        </div>
      </div>

      {/* 하단 합계 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <TotalCard label="전 공정 누적 생산량" value={totals.production} unit="매" color="white" />
        <TotalCard label="총 대기 물량" value={totals.waiting} color="amber" border="border-l-amber-700/60" />
        <TotalCard label="총 잔여 물량" value={totals.remaining} color="red" border="border-l-red-700/60" />
      </div>
    </div>
  );
};

// ============================================
// 보조 컴포넌트들 — 톤 다운 적용
// ============================================
const Legend: React.FC<{ color: 'green' | 'amber' | 'red' | 'blue'; label: string }> = ({ color, label }) => {
  const map = {
    green: 'bg-green-900/30 border-green-800/40 text-green-500/90',
    amber: 'bg-amber-900/30 border-amber-800/40 text-amber-500/90',
    red:   'bg-red-900/30 border-red-800/40 text-red-500/90',
    blue:  'bg-blue-900/30 border-blue-800/40 text-blue-500/90',
  };
  const dotMap = {
    green: 'bg-green-600',
    amber: 'bg-amber-600',
    red: 'bg-red-600',
    blue: 'bg-blue-600',
  };
  return (
    <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded border ${map[color]} font-medium`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotMap[color]}`}></span>
      {label}
    </span>
  );
};

const StatusCount: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  total?: number;
  color: 'green' | 'amber' | 'red' | 'blue';
}> = ({ icon: Icon, label, count, total, color }) => {
  const bgMap = {
    green: 'bg-green-900/30 text-green-500/90 border border-green-800/30',
    amber: 'bg-amber-900/30 text-amber-500/90 border border-amber-800/30',
    red:   'bg-red-900/30 text-red-500/90 border border-red-800/30',
    blue:  'bg-blue-900/30 text-blue-500/90 border border-blue-800/30',
  };
  return (
    <div className="bg-gray-900/80 rounded-lg p-3 border border-gray-800 flex items-center gap-3">
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
  color?: 'white' | 'amber' | 'red';
  border?: string;
}> = ({ label, value, unit, color = 'white', border = '' }) => {
  const colorMap = {
    white: 'text-gray-100',
    amber: 'text-amber-500/90',
    red:   'text-red-500/90',
  };
  return (
    <div className={`bg-gray-900/80 rounded-lg px-4 py-3 border border-gray-800 ${border ? `border-l-4 ${border}` : ''}`}>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${colorMap[color]}`}>
        {value.toLocaleString()}
        {unit && <span className="text-sm text-gray-500 font-normal ml-1">{unit}</span>}
      </p>
    </div>
  );
};

export default ProcessFlowDiagram;
