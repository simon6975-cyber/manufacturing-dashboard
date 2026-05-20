// src/components/ProcessFlowDiagram.tsx
'use client';

import React, { useMemo } from 'react';
import { Play, Pause, AlertCircle, Settings, ChevronRight, RefreshCw } from 'lucide-react';

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

interface GroupData {
  title: string;
  processes: ProcessData[];
}

// ============================================
// 19개 공정 데이터 정의
// (나중에 Firebase 연동 시 이 부분을 props로 받아옴)
// ============================================
const processGroups: GroupData[] = [
  {
    title: '내지',
    processes: [
      { no: 1, name: '연속지출력 1호기', model: '520HD+', maker: 'SCREEN', status: 'RUN', production: 9318, waiting: 1280, remaining: 3682 },
      { no: 2, name: '연속지출력 2호기', model: '520HD+', maker: 'SCREEN', status: 'RUN', production: 7939, waiting: 2388, remaining: 5061 },
      { no: 3, name: 'R2C 1호기', model: 'S2020', maker: 'TECHNAU', status: 'RUN', production: 5047, waiting: 1190, remaining: 4953 },
      { no: 4, name: 'R2C 2호기', model: 'S2320', maker: 'TECHNAU', status: 'IDLE', production: 4239, waiting: 2071, remaining: 5761 },
    ],
  },
  {
    title: '표지',
    processes: [
      { no: 5, name: '날장출력 1호기', model: '이리데스', maker: 'FUJI FILM', status: 'RUN', production: 2424, waiting: 488, remaining: 1076 },
      { no: 6, name: '날장출력 2호기', model: '레보리아', maker: 'FUJI FILM', status: 'STOP', production: 714, waiting: 991, remaining: 2786 },
      { no: 7, name: '코팅 1호기', model: 'EUROLAM 540', maker: 'GMP', status: 'RUN', production: 4402, waiting: 800, remaining: 598 },
      { no: 8, name: '코팅 2호기', model: 'PROTOPIC 540', maker: 'GMP', status: 'SETUP', production: 2529, waiting: 726, remaining: 2471 },
      { no: 9, name: '에폭시', model: 'DDC 810', maker: 'DUPLO', status: 'RUN', production: 1336, waiting: 361, remaining: 664 },
      { no: 10, name: '수동재단 1호기', model: 'POLAR 92', maker: 'HEIDELBERG', status: 'RUN', production: 3373, waiting: 695, remaining: 2627 },
      { no: 11, name: '수동재단 2호기', model: 'C860', maker: '대호', status: 'IDLE', production: 2802, waiting: 1211, remaining: 3198 },
    ],
  },
  {
    title: '제본',
    processes: [
      { no: 12, name: '제본 1호기', model: 'BQ470/HT80', maker: 'HORIZON', status: 'RUN', production: 1500, waiting: 273, remaining: 500 },
      { no: 13, name: '제본 2호기', model: 'BQ470/HT80', maker: 'HORIZON', status: 'RUN', production: 1288, waiting: 143, remaining: 712 },
      { no: 14, name: '제본 3호기', model: 'BQ500/HT300', maker: 'HORIZON', status: 'STOP', production: 382, waiting: 863, remaining: 1818 },
      { no: 15, name: '중철기', model: 'SPF-200A', maker: 'HORIZON', status: 'RUN', production: 2911, waiting: 322, remaining: 589 },
      { no: 16, name: '날개접지기', model: 'ZK320', maker: '', status: 'SETUP', production: 1173, waiting: 568, remaining: 1327 },
      { no: 17, name: '시험지접지기', model: 'CSMO', maker: 'HUNKELER', status: 'IDLE', production: 522, waiting: 548, remaining: 1278 },
    ],
  },
  {
    title: '포장',
    processes: [
      { no: 18, name: '박스포장', model: '', maker: '', status: 'RUN', production: 770, waiting: 297, remaining: 730 },
      { no: 19, name: '댐지포장', model: '', maker: '', status: 'IDLE', production: 646, waiting: 508, remaining: 854 },
    ],
  },
];

// ============================================
// 상태별 색상 설정
// ============================================
const statusStyles: Record<Status, {
  badgeBg: string;
  badgeText: string;
  border: string;
  bar: string;
  dot: string;
}> = {
  RUN: {
    badgeBg: 'bg-green-500',
    badgeText: 'text-white',
    border: 'border-l-green-500',
    bar: 'bg-green-500',
    dot: 'bg-green-500',
  },
  IDLE: {
    badgeBg: 'bg-amber-500',
    badgeText: 'text-white',
    border: 'border-l-amber-500',
    bar: 'bg-amber-500',
    dot: 'bg-amber-500',
  },
  STOP: {
    badgeBg: 'bg-red-500',
    badgeText: 'text-white',
    border: 'border-l-red-500',
    bar: 'bg-red-500',
    dot: 'bg-red-500',
  },
  SETUP: {
    badgeBg: 'bg-blue-500',
    badgeText: 'text-white',
    border: 'border-l-blue-500',
    bar: 'bg-blue-500',
    dot: 'bg-blue-500',
  },
};

// ============================================
// 공정 카드 컴포넌트
// ============================================
const ProcessCard: React.FC<{ process: ProcessData }> = ({ process }) => {
  const style = statusStyles[process.status];
  const total = process.production + process.remaining;
  const progress = total > 0 ? (process.production / total) * 100 : 0;

  return (
    <div className={`bg-gray-900 rounded-lg p-3 border border-gray-800 border-l-4 ${style.border} hover:bg-gray-800/80 transition-colors`}>
      {/* 상태 배지 + 공정 번호 */}
      <div className="flex items-center justify-between mb-2">
        <span className={`${style.badgeBg} ${style.badgeText} text-[10px] font-bold px-2 py-0.5 rounded tracking-wide`}>
          {process.status}
        </span>
        <span className="text-gray-500 text-xs font-mono">
          {String(process.no).padStart(2, '0')}
        </span>
      </div>

      {/* 공정명 */}
      <h3 className="text-white text-sm font-semibold mb-3 truncate" title={process.name}>
        {process.name}
      </h3>

      {/* 수치 3종 */}
      <div className="grid grid-cols-3 gap-1 mb-2">
        <div className="text-center">
          <p className="text-[10px] text-gray-500 mb-0.5">생산</p>
          <p className="text-sm font-bold text-white">{process.production.toLocaleString()}</p>
        </div>
        <div className="text-center bg-amber-950/30 rounded px-1 py-0.5">
          <p className="text-[10px] text-gray-400 mb-0.5">대기</p>
          <p className="text-sm font-bold text-amber-400">{process.waiting.toLocaleString()}</p>
        </div>
        <div className="text-center bg-red-950/30 rounded px-1 py-0.5">
          <p className="text-[10px] text-gray-400 mb-0.5">잔여</p>
          <p className="text-sm font-bold text-red-400">{process.remaining.toLocaleString()}</p>
        </div>
      </div>

      {/* 진행률 바 */}
      <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full ${style.bar} transition-all`} style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
};

// ============================================
// 카테고리 박스 (내지/표지/제본/포장 각각의 컨테이너)
// ============================================
const GroupBox: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-gray-950/50 rounded-xl p-4 border border-gray-800">
    <h3 className="text-sm font-bold text-blue-400 mb-3 tracking-wider">{title}</h3>
    {children}
  </div>
);

// ============================================
// 메인 컴포넌트
// ============================================
const ProcessFlowDiagram: React.FC = () => {
  // 상태별 카운트 계산
  const statusCounts = useMemo(() => {
    const counts = { RUN: 0, IDLE: 0, STOP: 0, SETUP: 0 };
    processGroups.forEach(g => g.processes.forEach(p => counts[p.status]++));
    return counts;
  }, []);

  // 합계 계산
  const totals = useMemo(() => {
    let production = 0, waiting = 0, remaining = 0;
    processGroups.forEach(g => g.processes.forEach(p => {
      production += p.production;
      waiting += p.waiting;
      remaining += p.remaining;
    }));
    return { production, waiting, remaining };
  }, []);

  // 그룹 가져오기
  const naeji = processGroups.find(g => g.title === '내지')!;
  const pyoji = processGroups.find(g => g.title === '표지')!;
  const jebon = processGroups.find(g => g.title === '제본')!;
  const pojang = processGroups.find(g => g.title === '포장')!;

  return (
    <div className="space-y-6 p-6 bg-black">
      {/* ========== 상단 헤더 ========== */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">제작공정 흐름도</h2>
          <p className="text-sm text-gray-400 mt-1">
            내지 · 표지 (병렬) → 제본 → 포장 · 실시간 상태 모니터링
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="flex items-center gap-1.5 px-2 py-1 rounded bg-green-500/10 border border-green-500/30">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            <span className="text-green-400 font-medium">RUN</span>
          </span>
          <span className="flex items-center gap-1.5 px-2 py-1 rounded bg-amber-500/10 border border-amber-500/30">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            <span className="text-amber-400 font-medium">IDLE</span>
          </span>
          <span className="flex items-center gap-1.5 px-2 py-1 rounded bg-red-500/10 border border-red-500/30">
            <span className="w-2 h-2 rounded-full bg-red-500"></span>
            <span className="text-red-400 font-medium">STOP</span>
          </span>
          <span className="flex items-center gap-1.5 px-2 py-1 rounded bg-blue-500/10 border border-blue-500/30">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            <span className="text-blue-400 font-medium">SETUP</span>
          </span>
          <button className="flex items-center gap-1.5 px-3 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium transition-colors">
            <RefreshCw className="w-3 h-3" />
            새로고침
          </button>
        </div>
      </div>

      {/* ========== 상태별 카운트 ========== */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-900 rounded-lg p-4 border border-gray-800 flex items-center gap-3">
          <div className="w-10 h-10 rounded bg-green-500/20 flex items-center justify-center">
            <Play className="w-5 h-5 text-green-500" />
          </div>
          <div>
            <p className="text-2xl font-bold text-white">
              {statusCounts.RUN}<span className="text-sm text-gray-500 font-normal"> / 19</span>
            </p>
            <p className="text-xs text-gray-400">가동 중</p>
          </div>
        </div>
        <div className="bg-gray-900 rounded-lg p-4 border border-gray-800 flex items-center gap-3">
          <div className="w-10 h-10 rounded bg-amber-500/20 flex items-center justify-center">
            <Pause className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <p className="text-2xl font-bold text-white">{statusCounts.IDLE}</p>
            <p className="text-xs text-gray-400">대기 중</p>
          </div>
        </div>
        <div className="bg-gray-900 rounded-lg p-4 border border-gray-800 flex items-center gap-3">
          <div className="w-10 h-10 rounded bg-red-500/20 flex items-center justify-center">
            <AlertCircle className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <p className="text-2xl font-bold text-white">{statusCounts.STOP}</p>
            <p className="text-xs text-gray-400">정지</p>
          </div>
        </div>
        <div className="bg-gray-900 rounded-lg p-4 border border-gray-800 flex items-center gap-3">
          <div className="w-10 h-10 rounded bg-blue-500/20 flex items-center justify-center">
            <Settings className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <p className="text-2xl font-bold text-white">{statusCounts.SETUP}</p>
            <p className="text-xs text-gray-400">셋업</p>
          </div>
        </div>
      </div>

      {/* ========== 메인 흐름도 ========== */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr_auto_0.5fr] gap-3 items-stretch">
        {/* 좌측: 내지 + 표지 */}
        <div className="space-y-3">
          <GroupBox title={naeji.title}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {naeji.processes.map(p => <ProcessCard key={p.no} process={p} />)}
            </div>
          </GroupBox>

          <GroupBox title={pyoji.title}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {pyoji.processes.map(p => <ProcessCard key={p.no} process={p} />)}
            </div>
          </GroupBox>
        </div>

        {/* 화살표 */}
        <div className="hidden lg:flex items-center justify-center">
          <ChevronRight className="w-6 h-6 text-gray-600" />
        </div>

        {/* 중앙: 제본 */}
        <div>
          <GroupBox title={jebon.title}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {jebon.processes.map(p => <ProcessCard key={p.no} process={p} />)}
            </div>
          </GroupBox>
        </div>

        {/* 화살표 */}
        <div className="hidden lg:flex items-center justify-center">
          <ChevronRight className="w-6 h-6 text-gray-600" />
        </div>

        {/* 우측: 포장 */}
        <div>
          <GroupBox title={pojang.title}>
            <div className="grid grid-cols-1 gap-3">
              {pojang.processes.map(p => <ProcessCard key={p.no} process={p} />)}
            </div>
          </GroupBox>
        </div>
      </div>

      {/* ========== 하단 합계 ========== */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <div className="bg-gray-900 rounded-lg p-5 border border-gray-800">
          <p className="text-sm text-gray-400 mb-1">전 공정 누적 생산량</p>
          <p className="text-3xl font-bold text-white">
            {totals.production.toLocaleString()}
            <span className="text-base text-gray-500 font-normal ml-1">매</span>
          </p>
        </div>
        <div className="bg-gray-900 rounded-lg p-5 border border-gray-800 border-l-4 border-l-amber-500">
          <p className="text-sm text-gray-400 mb-1">총 대기 물량</p>
          <p className="text-3xl font-bold text-amber-400">
            {totals.waiting.toLocaleString()}
          </p>
        </div>
        <div className="bg-gray-900 rounded-lg p-5 border border-gray-800 border-l-4 border-l-red-500">
          <p className="text-sm text-gray-400 mb-1">총 잔여 물량</p>
          <p className="text-3xl font-bold text-red-400">
            {totals.remaining.toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
};

export default ProcessFlowDiagram;
