// src/app/terminal/[no]/page.tsx
'use client';

import React, { useState, useEffect, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import {
  Play, Square, AlertTriangle, XCircle, Clock, ChevronDown,
} from 'lucide-react';
import { updateMachineStatus, subscribeMachine, MachineStatus, MachineHistoryEntry } from '@/lib/machine-service';

type Status = MachineStatus;

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
  { code: 'S1', name: '장비 셋팅' }, { code: 'S2', name: '자재 준비' },
  { code: 'S3', name: '작업 준비' }, { code: 'S4', name: '검수' },
  { code: 'S5', name: '예방 정비' }, { code: 'S6', name: '설비 장애' },
  { code: 'S7', name: '작업 중단' }, { code: 'S8', name: '인력 부재' },
  { code: 'S9', name: '기타' },
];

// 터미널 버튼 설정 (SETUP → CANCEL 표시)
const BTN_CONFIG: Record<Status, { label: string; korLabel: string; bg: string; text: string; icon: React.ComponentType<{ className?: string }>; activeClass: string; hoverClass: string }> = {
  RUN:   { label: 'RUN',    korLabel: '가동', bg: 'bg-emerald-500', text: 'text-white', icon: Play,          activeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500 ring-2 ring-emerald-500/30', hoverClass: 'hover:border-emerald-500/60 hover:bg-emerald-950/30' },
  IDLE:  { label: 'IDLE',   korLabel: '대기', bg: 'bg-amber-400',   text: 'text-black', icon: Square,        activeClass: 'bg-amber-400/20 text-amber-300 border-amber-400 ring-2 ring-amber-400/30',       hoverClass: 'hover:border-amber-400/60 hover:bg-amber-950/30' },
  STOP:  { label: 'STOP',   korLabel: '정지', bg: 'bg-rose-500',    text: 'text-white', icon: AlertTriangle, activeClass: 'bg-rose-500/20 text-rose-300 border-rose-500 ring-2 ring-rose-500/30',           hoverClass: 'hover:border-rose-500/60 hover:bg-rose-950/30' },
  SETUP: { label: 'CANCEL', korLabel: '취소', bg: 'bg-sky-500',     text: 'text-white', icon: XCircle,       activeClass: 'bg-sky-500/20 text-sky-300 border-sky-500 ring-2 ring-sky-500/30',               hoverClass: 'hover:border-sky-500/60 hover:bg-sky-950/30' },
};

const STATUS_BG: Record<Status, string> = {
  RUN: 'from-emerald-950/40', IDLE: 'from-amber-950/30', STOP: 'from-rose-950/40', SETUP: 'from-sky-950/30',
};

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function nowStr(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
}

export default function TerminalPage({ params }: { params: Promise<{ no: string }> }) {
  const { no: noStr } = use(params);
  const machineNo = parseInt(noStr, 10);
  const machine = MACHINES[machineNo];
  const router = useRouter();

  const [status, setStatus] = useState<Status>('IDLE');
  const [stopCode, setStopCode] = useState('');
  const [showStopModal, setShowStopModal] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [history, setHistory] = useState<MachineHistoryEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const statusChangedAtRef = useRef<Date>(new Date());

  // 실시간 타이머
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - statusChangedAtRef.current.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Firebase 실시간 구독
  useEffect(() => {
    if (!machine) return;
    const unsub = subscribeMachine(machineNo, (state) => {
      if (state) {
        setStatus(state.status);
        setStopCode(state.stopReason);
        statusChangedAtRef.current = state.statusChangedAt;
        setElapsed(Math.floor((Date.now() - state.statusChangedAt.getTime()) / 1000));
        if (state.history.length > 0) setHistory(state.history);
      }
      setConnected(true);
    });
    return unsub;
  }, [machineNo, machine]);

  // 상태 변경 → Firebase 저장
  const changeStatus = async (newStatus: Status, code?: string) => {
    const isStopAgain = newStatus === 'STOP' && status === 'STOP';
    const entry: MachineHistoryEntry = {
      status: newStatus,
      stopCode: code || '',
      time: nowStr(),
      timestamp: Date.now(),
    };
    const newHistory = [entry, ...history].slice(0, 50);
    setHistory(newHistory);

    // STOP 재클릭 시 소요시간 리셋하지 않음 (정지 상태 유지, 코드만 추가)
    if (!isStopAgain) {
      statusChangedAtRef.current = new Date();
      setElapsed(0);
    }
    setStatus(newStatus);
    setStopCode(code || '');

    try {
      await updateMachineStatus(machineNo, newStatus, code || '', newHistory);
    } catch (err) {
      console.error('Firebase 저장 실패:', err);
    }
  };

  const handleStopSelect = (code: string) => {
    changeStatus('STOP', code);
    setShowStopModal(false);
  };

  if (!machine) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
        <p className="text-xl text-gray-400">공정 #{noStr}을 찾을 수 없습니다</p>
      </div>
    );
  }

  const cfg = BTN_CONFIG[status];
  const StatusIcon = cfg.icon;
  const stopName = STOP_CODES.find((c) => c.code === stopCode)?.name || '';

  return (
    <div className={`fixed inset-0 z-50 bg-gradient-to-b ${STATUS_BG[status]} to-black overflow-y-auto`}>
      <div className="max-w-lg mx-auto p-5 min-h-full flex flex-col">

        {/* 상단: 공정 전환 */}
        <div className="mb-5">
          <div className="relative">
            <select value={machineNo} onChange={(e) => router.push(`/terminal/${e.target.value}`)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-sm text-gray-200 outline-none appearance-none focus:border-blue-500/50">
              {Object.entries(MACHINES).map(([no, m]) => (
                <option key={no} value={no} className="bg-gray-900">[{m.group}] NO.{String(no).padStart(2,'0')} {m.name}</option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-gray-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
          <div className="flex items-center gap-1.5 mt-1.5 px-1">
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-500' : 'bg-gray-600 animate-pulse'}`} />
            <span className="text-[10px] text-gray-600">{connected ? 'Firebase 연결됨' : '연결 중...'}</span>
          </div>
        </div>

        {/* 장비 정보 */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-white mb-1">{machine.name}</h1>
          <p className="text-sm text-gray-500">{machine.model}{machine.maker ? ` · ${machine.maker}` : ''}</p>
        </div>

        {/* 현재 상태 + 타이머 */}
        <div className={`rounded-2xl p-6 mb-6 text-center ${cfg.bg} shadow-lg`}>
          <div className="flex items-center justify-center gap-2 mb-2">
            <StatusIcon className={`w-6 h-6 ${cfg.text}`} />
            <span className={`text-2xl font-bold ${cfg.text}`}>{cfg.korLabel}</span>
          </div>
          {status === 'STOP' && stopCode && (
            <p className={`text-sm ${cfg.text} opacity-80 mb-2`}>{stopCode} · {stopName}</p>
          )}
          <div className="flex items-center justify-center gap-2 mt-3">
            <Clock className={`w-4 h-4 ${cfg.text} opacity-60`} />
            <span className={`text-4xl font-mono font-bold ${cfg.text} tabular-nums tracking-wider`}>{formatTime(elapsed)}</span>
          </div>
        </div>

        {/* 4개 버튼 — STOP은 항상 클릭 가능 */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {(['RUN', 'IDLE', 'STOP', 'SETUP'] as Status[]).map((s) => {
            const btnCfg = BTN_CONFIG[s];
            const BtnIcon = btnCfg.icon;
            const isActive = status === s;
            // STOP은 항상 활성 (여러 번 정지코드 입력 가능)
            const isDisabled = s === 'STOP' ? false : isActive;
            return (
              <button key={s}
                onClick={() => s === 'STOP' ? setShowStopModal(true) : changeStatus(s)}
                disabled={isDisabled}
                className={`flex flex-col items-center justify-center gap-2 py-6 rounded-xl font-bold text-lg transition-all border-2 ${
                  isActive
                    ? btnCfg.activeClass
                    : `bg-gray-900 text-gray-300 border-gray-700 ${btnCfg.hoverClass} active:scale-95`
                } ${isDisabled ? '' : 'cursor-pointer'}`}
              >
                <BtnIcon className="w-8 h-8" />
                <span>{btnCfg.label}</span>
                <span className="text-[11px] font-normal opacity-60">{btnCfg.korLabel}</span>
              </button>
            );
          })}
        </div>

        {/* 상태 변경 이력 */}
        <div className="flex-1">
          <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2 px-1">
            상태 변경 이력 {history.length > 0 && <span className="text-gray-600">({history.length})</span>}
          </h3>
          <div className="space-y-1.5">
            {history.length === 0 ? (
              <p className="text-sm text-gray-600 text-center py-4">아직 상태 변경 이력이 없습니다</p>
            ) : history.map((h, i) => {
              const hCfg = BTN_CONFIG[h.status];
              return (
                <div key={i} className="flex items-center gap-3 bg-gray-900/60 rounded-lg px-3 py-2.5 border border-gray-800/50">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${hCfg.bg} ${hCfg.text}`}>{hCfg.label}</span>
                  {h.stopCode && <span className="text-xs text-rose-400">{h.stopCode} {STOP_CODES.find(c=>c.code===h.stopCode)?.name}</span>}
                  <span className="text-xs text-gray-500 ml-auto font-mono">{h.time}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* STOP 코드 선택 모달 */}
      {showStopModal && (<>
        <div className="fixed inset-0 bg-black/70 z-60" onClick={() => setShowStopModal(false)} />
        <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-70 max-w-md mx-auto bg-gray-950 rounded-2xl border border-gray-800 shadow-2xl overflow-hidden">
          <div className="p-4 border-b border-gray-800">
            <h3 className="text-lg font-bold text-gray-100 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-rose-400" />정지 사유 선택</h3>
            {status === 'STOP' && <p className="text-xs text-amber-400 mt-1">현재 정지 중 — 추가 정지 사유를 기록합니다</p>}
          </div>
          <div className="p-2 max-h-80 overflow-y-auto">
            {STOP_CODES.map((sc) => (
              <button key={sc.code} onClick={() => handleStopSelect(sc.code)}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl hover:bg-rose-950/30 transition-colors text-left">
                <span className="text-sm font-bold text-rose-400 font-mono w-8">{sc.code}</span>
                <span className="text-sm text-gray-200">{sc.name}</span>
              </button>
            ))}
          </div>
          <div className="p-3 border-t border-gray-800">
            <button onClick={() => setShowStopModal(false)} className="w-full py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium transition-colors">취소</button>
          </div>
        </div>
      </>)}
    </div>
  );
}
