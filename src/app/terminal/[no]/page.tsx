// src/app/terminal/[no]/page.tsx
'use client';

import React, { useState, useEffect, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import {
  Play, Square, AlertTriangle, Settings, ArrowLeft, Clock, ChevronDown,
} from 'lucide-react';

type Status = 'RUN' | 'IDLE' | 'STOP' | 'SETUP';

// ============================================
// 19개 공정 기본 정보
// ============================================
const MACHINES: Record<number, { name: string; model: string; maker: string; group: string }> = {
  1:  { name: '연속지출력 1호기', model: '520HD+',       maker: 'SCREEN',     group: '내지' },
  2:  { name: '연속지출력 2호기', model: '520HD+',       maker: 'SCREEN',     group: '내지' },
  3:  { name: 'R2C 1호기',       model: 'S2020',        maker: 'TECHNAU',    group: '내지' },
  4:  { name: 'R2C 2호기',       model: 'S2320',        maker: 'TECHNAU',    group: '내지' },
  5:  { name: '날장출력 1호기',   model: '이리데스',      maker: 'FUJI FILM',  group: '표지' },
  6:  { name: '날장출력 2호기',   model: '레보리아',      maker: 'FUJI FILM',  group: '표지' },
  7:  { name: '코팅 1호기',       model: 'EUROLAM 540',  maker: 'GMP',        group: '표지' },
  8:  { name: '코팅 2호기',       model: 'PROTOPIC 540', maker: 'GMP',        group: '표지' },
  9:  { name: '에폭시',           model: 'DDC 810',      maker: 'DUPLO',      group: '표지' },
  10: { name: '수동재단 1호기',   model: 'POLAR 92',     maker: 'HEIDELBERG', group: '표지' },
  11: { name: '수동재단 2호기',   model: 'C860',         maker: '대호',        group: '표지' },
  12: { name: '제본 1호기',       model: 'BQ470/HT80',   maker: 'HORIZON',    group: '제본' },
  13: { name: '제본 2호기',       model: 'BQ470/HT80',   maker: 'HORIZON',    group: '제본' },
  14: { name: '제본 3호기',       model: 'BQ500/HT300',  maker: 'HORIZON',    group: '제본' },
  15: { name: '중철기',           model: 'SPF-200A',     maker: 'HORIZON',    group: '제본' },
  16: { name: '날개접지기',       model: 'ZK320',        maker: '',           group: '제본' },
  17: { name: '시험지접지기',     model: 'CSMO',         maker: 'HUNKELER',   group: '제본' },
  18: { name: '박스포장',         model: '',             maker: '',           group: '포장' },
  19: { name: '댐지포장',         model: '',             maker: '',           group: '포장' },
};

const STOP_CODES = [
  { code: 'S1', name: '장비 셋팅' },
  { code: 'S2', name: '자재 준비' },
  { code: 'S3', name: '작업 준비' },
  { code: 'S4', name: '검수' },
  { code: 'S5', name: '예방 정비' },
  { code: 'S6', name: '설비 장애' },
  { code: 'S7', name: '작업 중단' },
  { code: 'S8', name: '인력 부재' },
  { code: 'S9', name: '기타' },
];

const STATUS_CONFIG: Record<Status, { label: string; bg: string; text: string; icon: React.ComponentType<{ className?: string }> }> = {
  RUN:   { label: '가동',  bg: 'bg-emerald-500', text: 'text-white', icon: Play },
  IDLE: { label: '대기',  bg: 'bg-amber-400',   text: 'text-black', icon: Square },
  STOP:  { label: '정지',  bg: 'bg-rose-500',    text: 'text-white', icon: AlertTriangle },
  SETUP: { label: '셋업',  bg: 'bg-sky-500',     text: 'text-white', icon: Settings },
};

const STATUS_BG: Record<Status, string> = {
  RUN: 'from-emerald-950/40', IDLE: 'from-amber-950/30', STOP: 'from-rose-950/40', SETUP: 'from-sky-950/30',
};

interface HistoryEntry {
  status: Status;
  stopCode?: string;
  time: string;
}

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function nowStr(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

// ============================================
// 메인 터미널 페이지
// ============================================
export default function TerminalPage({ params }: { params: Promise<{ no: string }> }) {
  const { no: noStr } = use(params);
  const machineNo = parseInt(noStr, 10);
  const machine = MACHINES[machineNo];
  const router = useRouter();

  const [status, setStatus] = useState<Status>('IDLE');
  const [stopCode, setStopCode] = useState('');
  const [showStopModal, setShowStopModal] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const elapsedRef = useRef(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // 타이머
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  // localStorage 복원
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`terminal_${machineNo}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        setStatus(parsed.status || 'IDLE');
        setStopCode(parsed.stopCode || '');
        setHistory(parsed.history || []);
        // 경과시간 복원
        if (parsed.statusChangedAt) {
          const diff = Math.floor((Date.now() - parsed.statusChangedAt) / 1000);
          elapsedRef.current = diff;
          setElapsed(diff);
        }
      }
    } catch {}
  }, [machineNo]);

  // 상태 변경
  const changeStatus = (newStatus: Status, code?: string) => {
    setStatus(newStatus);
    setStopCode(code || '');
    elapsedRef.current = 0;
    setElapsed(0);

    const entry: HistoryEntry = {
      status: newStatus,
      stopCode: code,
      time: nowStr(),
    };
    const newHistory = [entry, ...history].slice(0, 20);
    setHistory(newHistory);

    // localStorage 저장
    try {
      localStorage.setItem(`terminal_${machineNo}`, JSON.stringify({
        status: newStatus,
        stopCode: code || '',
        statusChangedAt: Date.now(),
        history: newHistory,
      }));
    } catch {}
  };

  const handleStopSelect = (code: string) => {
    changeStatus('STOP', code);
    setShowStopModal(false);
  };

  if (!machine) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
        <div className="text-center">
          <p className="text-2xl text-gray-400 mb-4">공정 #{noStr}을 찾을 수 없습니다</p>
          <button onClick={() => router.push('/')} className="text-blue-400 underline">대시보드로 돌아가기</button>
        </div>
      </div>
    );
  }

  const cfg = STATUS_CONFIG[status];
  const StatusIcon = cfg.icon;
  const stopName = STOP_CODES.find((c) => c.code === stopCode)?.name || '';

  return (
    <div className={`fixed inset-0 z-50 bg-gradient-to-b ${STATUS_BG[status]} to-black overflow-y-auto`}>
      <div className="max-w-lg mx-auto p-5 min-h-full flex flex-col">

        {/* 상단 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => router.push('/')}
            className="flex items-center gap-1 text-gray-500 hover:text-gray-300 transition-colors text-sm">
            <ArrowLeft className="w-4 h-4" />대시보드
          </button>
          <span className="text-xs text-gray-600 font-mono">{machine.group} · NO.{String(machineNo).padStart(2, '0')}</span>
        </div>

        {/* 장비 정보 */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-white mb-1">{machine.name}</h1>
          <p className="text-sm text-gray-500">
            {machine.model}{machine.maker ? ` · ${machine.maker}` : ''}
          </p>
        </div>

        {/* 현재 상태 + 타이머 */}
        <div className={`rounded-2xl p-6 mb-6 text-center ${cfg.bg} shadow-lg`}>
          <div className="flex items-center justify-center gap-2 mb-2">
            <StatusIcon className={`w-6 h-6 ${cfg.text}`} />
            <span className={`text-2xl font-bold ${cfg.text}`}>{cfg.label}</span>
          </div>
          {status === 'STOP' && stopCode && (
            <p className={`text-sm ${cfg.text} opacity-80 mb-2`}>{stopCode} · {stopName}</p>
          )}
          <div className="flex items-center justify-center gap-2 mt-3">
            <Clock className={`w-4 h-4 ${cfg.text} opacity-60`} />
            <span className={`text-4xl font-mono font-bold ${cfg.text} tabular-nums tracking-wider`}>
              {formatTime(elapsed)}
            </span>
          </div>
        </div>

        {/* 4개 버튼 */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <button
            onClick={() => changeStatus('RUN')}
            disabled={status === 'RUN'}
            className={`flex flex-col items-center justify-center gap-2 py-6 rounded-xl font-bold text-lg transition-all ${
              status === 'RUN'
                ? 'bg-emerald-500/20 text-emerald-300 border-2 border-emerald-500 ring-2 ring-emerald-500/30'
                : 'bg-gray-900 text-gray-300 border-2 border-gray-700 hover:border-emerald-500/60 hover:bg-emerald-950/30 active:scale-95'
            }`}
          >
            <Play className="w-8 h-8" />
            <span>RUN</span>
            <span className="text-[11px] font-normal opacity-60">가동</span>
          </button>

          <button
            onClick={() => changeStatus('IDLE')}
            disabled={status === 'IDLE'}
            className={`flex flex-col items-center justify-center gap-2 py-6 rounded-xl font-bold text-lg transition-all ${
              status === 'IDLE'
                ? 'bg-amber-400/20 text-amber-300 border-2 border-amber-400 ring-2 ring-amber-400/30'
                : 'bg-gray-900 text-gray-300 border-2 border-gray-700 hover:border-amber-400/60 hover:bg-amber-950/30 active:scale-95'
            }`}
          >
            <Square className="w-8 h-8" />
            <span>IDLE</span>
            <span className="text-[11px] font-normal opacity-60">대기</span>
          </button>

          <button
            onClick={() => setShowStopModal(true)}
            disabled={status === 'STOP'}
            className={`flex flex-col items-center justify-center gap-2 py-6 rounded-xl font-bold text-lg transition-all ${
              status === 'STOP'
                ? 'bg-rose-500/20 text-rose-300 border-2 border-rose-500 ring-2 ring-rose-500/30'
                : 'bg-gray-900 text-gray-300 border-2 border-gray-700 hover:border-rose-500/60 hover:bg-rose-950/30 active:scale-95'
            }`}
          >
            <AlertTriangle className="w-8 h-8" />
            <span>STOP</span>
            <span className="text-[11px] font-normal opacity-60">정지</span>
          </button>

          <button
            onClick={() => changeStatus('SETUP')}
            disabled={status === 'SETUP'}
            className={`flex flex-col items-center justify-center gap-2 py-6 rounded-xl font-bold text-lg transition-all ${
              status === 'SETUP'
                ? 'bg-sky-500/20 text-sky-300 border-2 border-sky-500 ring-2 ring-sky-500/30'
                : 'bg-gray-900 text-gray-300 border-2 border-gray-700 hover:border-sky-500/60 hover:bg-sky-950/30 active:scale-95'
            }`}
          >
            <Settings className="w-8 h-8" />
            <span>SETUP</span>
            <span className="text-[11px] font-normal opacity-60">셋업</span>
          </button>
        </div>

        {/* 상태 변경 이력 */}
        <div className="flex-1">
          <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2 px-1">상태 변경 이력</h3>
          <div className="space-y-1.5">
            {history.length === 0 ? (
              <p className="text-sm text-gray-600 text-center py-4">아직 상태 변경 이력이 없습니다</p>
            ) : history.map((h, i) => {
              const hCfg = STATUS_CONFIG[h.status];
              return (
                <div key={i} className="flex items-center gap-3 bg-gray-900/60 rounded-lg px-3 py-2.5 border border-gray-800/50">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${hCfg.bg} ${hCfg.text}`}>
                    {h.status}
                  </span>
                  {h.stopCode && (
                    <span className="text-xs text-rose-400">
                      {h.stopCode} {STOP_CODES.find((c) => c.code === h.stopCode)?.name}
                    </span>
                  )}
                  <span className="text-xs text-gray-500 ml-auto font-mono">{h.time}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 공정 선택 (하단) */}
        <div className="mt-6 pt-4 border-t border-gray-800">
          <label className="block text-xs text-gray-500 mb-1.5">공정 전환</label>
          <div className="relative">
            <select
              value={machineNo}
              onChange={(e) => router.push(`/terminal/${e.target.value}`)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-sm text-gray-200 outline-none appearance-none focus:border-blue-500/50"
            >
              {Object.entries(MACHINES).map(([no, m]) => (
                <option key={no} value={no} className="bg-gray-900">
                  [{m.group}] NO.{String(no).padStart(2, '0')} {m.name}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-gray-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* STOP 코드 선택 모달 */}
      {showStopModal && (
        <>
          <div className="fixed inset-0 bg-black/70 z-60" onClick={() => setShowStopModal(false)} />
          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-70 max-w-md mx-auto bg-gray-950 rounded-2xl border border-gray-800 shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-gray-800">
              <h3 className="text-lg font-bold text-gray-100 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-400" />
                정지 사유 선택
              </h3>
              <p className="text-xs text-gray-500 mt-1">정지 사유를 선택하면 상태가 STOP으로 변경됩니다</p>
            </div>
            <div className="p-2 max-h-80 overflow-y-auto">
              {STOP_CODES.map((sc) => (
                <button
                  key={sc.code}
                  onClick={() => handleStopSelect(sc.code)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl hover:bg-rose-950/30 transition-colors text-left"
                >
                  <span className="text-sm font-bold text-rose-400 font-mono w-8">{sc.code}</span>
                  <span className="text-sm text-gray-200">{sc.name}</span>
                </button>
              ))}
            </div>
            <div className="p-3 border-t border-gray-800">
              <button onClick={() => setShowStopModal(false)}
                className="w-full py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium transition-colors">
                취소
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
