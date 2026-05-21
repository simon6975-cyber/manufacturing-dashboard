// src/app/codes/page.tsx
'use client';

import React, { useState } from 'react';
import Sidebar from '../../components/Sidebar';
import {
  Plus,
  Trash2,
  Save,
  RotateCcw,
  ChevronUp,
  ChevronDown,
  Square,
  AlertTriangle,
} from 'lucide-react';

// ============================================
// 타입 정의
// ============================================
type Severity = '높음' | '보통' | '낮음';

interface StopCode {
  id: string;
  code: string;
  name: string;
  description: string;
  active: boolean;
}

interface BottleneckCode {
  id: string;
  code: string;
  name: string;
  description: string;
  severity: Severity;
  active: boolean;
}

// ============================================
// 기본 데이터
// ============================================
const defaultStopCodes: StopCode[] = [
  { id: 's1', code: 'S1', name: '설비 고장', description: '기계 트러블 / 오작동 / 부품 파손', active: true },
  { id: 's2', code: 'S2', name: '자재 부족', description: '용지/잉크/소모품 공급 지연', active: true },
  { id: 's3', code: 'S3', name: '품질 불량', description: '인쇄파일 부적합 / 재작업 / 색상 보정', active: true },
  { id: 's4', code: 'S4', name: '인력 부재', description: '작업자 교대 / 휴게 / 결원', active: true },
  { id: 's5', code: 'S5', name: '예방정비', description: '정기 PM / 셋업 변경 / 청소', active: true },
  { id: 's6', code: 'S6', name: '장비셋업', description: '제작을 위한 장비 셋업', active: true },
  { id: 's7', code: 'S7', name: '검수', description: '표지 / 내지 및 산출물 샘플 제작 후 검수', active: true },
  { id: 's8', code: 'S8', name: '기타', description: '전력 / 환경 / 외부요인', active: true },
];

const defaultBottleneckCodes: BottleneckCode[] = [
  { id: 'bn1', code: 'BN1', name: '전공정 지연 누적', description: '이전 공정의 산출 지연', severity: '높음', active: true },
  { id: 'bn2', code: 'BN2', name: '후공정 적체', description: 'WIP 과다 / 후공정 처리 한계', severity: '높음', active: true },
  { id: 'bn3', code: 'BN3', name: '설비 처리속도 한계', description: '장비 사양상 최대속도 도달', severity: '보통', active: true },
  { id: 'bn4', code: 'BN4', name: '셋업', description: '장비 셋업 빈발', severity: '보통', active: true },
  { id: 'bn5', code: 'BN5', name: '품질 검수 지연', description: '검수 단계 처리 지연', severity: '보통', active: true },
  { id: 'bn6', code: 'BN6', name: '운반 / 이송 지연', description: '공정 간 이동 시간 과다', severity: '낮음', active: true },
  { id: 'bn7', code: 'BN7', name: '기타', description: '기타 병목 요인', severity: '낮음', active: true },
];

// ============================================
// 유틸리티
// ============================================
const generateNextCode = (prefix: string, existing: { code: string }[]): string => {
  const nums = existing
    .map((c) => parseInt(c.code.replace(prefix, ''), 10))
    .filter((n) => !isNaN(n));
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `${prefix}${next}`;
};

const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// ============================================
// 보조 컴포넌트
// ============================================
const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void }> = ({ checked, onChange }) => (
  <button
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
      checked ? 'bg-green-600' : 'bg-gray-700'
    }`}
    role="switch"
    aria-checked={checked}
  >
    <span
      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
        checked ? 'translate-x-[18px]' : 'translate-x-1'
      }`}
    />
  </button>
);

const SeveritySelector: React.FC<{ value: Severity; onChange: (v: Severity) => void }> = ({ value, onChange }) => {
  const colorMap: Record<Severity, string> = {
    '높음': 'text-red-400 border-red-900/40',
    '보통': 'text-amber-400 border-amber-900/40',
    '낮음': 'text-gray-400 border-gray-700/50',
  };
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Severity)}
      className={`bg-gray-800/40 border rounded px-2 py-1 text-sm outline-none focus:border-blue-500/50 ${colorMap[value]}`}
    >
      <option value="높음" className="bg-gray-900 text-red-400">높음</option>
      <option value="보통" className="bg-gray-900 text-amber-400">보통</option>
      <option value="낮음" className="bg-gray-900 text-gray-400">낮음</option>
    </select>
  );
};

const EditableCell: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}> = ({ value, onChange, placeholder, className = '' }) => (
  <input
    type="text"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    className={`bg-transparent text-gray-200 hover:bg-gray-800/40 focus:bg-gray-800/60 px-2 py-1 rounded w-full outline-none focus:ring-1 focus:ring-blue-500/30 transition-colors text-sm placeholder:text-gray-600 ${className}`}
  />
);

const ReorderControls: React.FC<{
  canUp: boolean;
  canDown: boolean;
  onUp: () => void;
  onDown: () => void;
}> = ({ canUp, canDown, onUp, onDown }) => (
  <div className="opacity-30 group-hover:opacity-100 transition-opacity flex flex-col items-center -my-1">
    <button
      onClick={onUp}
      disabled={!canUp}
      className="p-0.5 text-gray-500 hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
      title="위로"
    >
      <ChevronUp className="w-3 h-3" />
    </button>
    <button
      onClick={onDown}
      disabled={!canDown}
      className="p-0.5 text-gray-500 hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
      title="아래로"
    >
      <ChevronDown className="w-3 h-3" />
    </button>
  </div>
);

// ============================================
// 메인 페이지
// ============================================
export default function CodesPage() {
  const [stopCodes, setStopCodes] = useState<StopCode[]>(defaultStopCodes);
  const [bottleneckCodes, setBottleneckCodes] = useState<BottleneckCode[]>(defaultBottleneckCodes);
  const [hasChanges, setHasChanges] = useState(false);

  // ===== Stop Code Operations =====
  const addStopCode = () => {
    const newCode: StopCode = {
      id: generateId(),
      code: generateNextCode('S', stopCodes),
      name: '',
      description: '',
      active: true,
    };
    setStopCodes([...stopCodes, newCode]);
    setHasChanges(true);
  };

  const deleteStopCode = (id: string) => {
    if (confirm('이 코드를 삭제하시겠습니까?')) {
      setStopCodes(stopCodes.filter((c) => c.id !== id));
      setHasChanges(true);
    }
  };

  const updateStopCode = <K extends keyof StopCode>(id: string, key: K, value: StopCode[K]) => {
    setStopCodes(stopCodes.map((c) => (c.id === id ? { ...c, [key]: value } : c)));
    setHasChanges(true);
  };

  const moveStopCode = (id: string, dir: -1 | 1) => {
    const idx = stopCodes.findIndex((c) => c.id === id);
    const newIdx = idx + dir;
    if (idx === -1 || newIdx < 0 || newIdx >= stopCodes.length) return;
    const next = [...stopCodes];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    setStopCodes(next);
    setHasChanges(true);
  };

  // ===== Bottleneck Code Operations =====
  const addBottleneckCode = () => {
    const newCode: BottleneckCode = {
      id: generateId(),
      code: generateNextCode('BN', bottleneckCodes),
      name: '',
      description: '',
      severity: '보통',
      active: true,
    };
    setBottleneckCodes([...bottleneckCodes, newCode]);
    setHasChanges(true);
  };

  const deleteBottleneckCode = (id: string) => {
    if (confirm('이 코드를 삭제하시겠습니까?')) {
      setBottleneckCodes(bottleneckCodes.filter((c) => c.id !== id));
      setHasChanges(true);
    }
  };

  const updateBottleneckCode = <K extends keyof BottleneckCode>(id: string, key: K, value: BottleneckCode[K]) => {
    setBottleneckCodes(bottleneckCodes.map((c) => (c.id === id ? { ...c, [key]: value } : c)));
    setHasChanges(true);
  };

  const moveBottleneckCode = (id: string, dir: -1 | 1) => {
    const idx = bottleneckCodes.findIndex((c) => c.id === id);
    const newIdx = idx + dir;
    if (idx === -1 || newIdx < 0 || newIdx >= bottleneckCodes.length) return;
    const next = [...bottleneckCodes];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    setBottleneckCodes(next);
    setHasChanges(true);
  };

  // ===== Global Actions =====
  const resetToDefault = () => {
    if (confirm('모든 코드를 기본값으로 복원하시겠습니까?\n변경된 내용은 사라집니다.')) {
      setStopCodes(defaultStopCodes);
      setBottleneckCodes(defaultBottleneckCodes);
      setHasChanges(false);
    }
  };

  const save = () => {
    // TODO: Firebase 저장 연동
    console.log('저장 - 정지 코드:', stopCodes);
    console.log('저장 - 병목 코드:', bottleneckCodes);
    alert('저장되었습니다!\n\n(현재는 임시 저장입니다. Firebase 연동 후 영구 저장됩니다.)');
    setHasChanges(false);
  };

  return (
    <div className="flex h-screen bg-black text-white overflow-hidden">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-auto">
        <div className="p-6 space-y-6">
          {/* ========== 헤더 ========== */}
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-100">정지/병목 코드 관리</h1>
              <p className="text-sm text-gray-500 mt-1">
                코드를 추가, 수정, 삭제하고 활성/비활성 상태를 관리합니다
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={resetToDefault}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-gray-900 hover:bg-gray-800 text-gray-300 font-medium transition-colors text-sm border border-gray-800"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                기본값 복원
              </button>
              <button
                onClick={save}
                disabled={!hasChanges}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded font-medium transition-colors text-sm ${
                  hasChanges
                    ? 'bg-blue-600 hover:bg-blue-500 text-white'
                    : 'bg-blue-600/40 text-white/60 cursor-not-allowed'
                }`}
              >
                <Save className="w-3.5 h-3.5" />
                저장
              </button>
            </div>
          </div>

          {/* ========== 정지 코드 ========== */}
          <section className="bg-gray-900/60 rounded-lg border border-gray-800">
            <header className="flex items-center justify-between p-4 border-b border-gray-800">
              <h2 className="text-base font-bold text-gray-100 flex items-center gap-2">
                <Square className="w-4 h-4 text-gray-500" />
                정지 코드 (Stop Codes)
                <span className="text-xs text-gray-500 font-normal ml-1">{stopCodes.length}개</span>
              </h2>
              <button
                onClick={addStopCode}
                className="flex items-center gap-1 px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm border border-gray-700 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                추가
              </button>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-[11px] text-gray-500 uppercase tracking-wider border-b border-gray-800/60">
                    <th className="w-8 py-2"></th>
                    <th className="text-left px-3 py-2 w-20">코드</th>
                    <th className="text-left px-3 py-2 w-44">명칭</th>
                    <th className="text-left px-3 py-2">설명</th>
                    <th className="text-center px-3 py-2 w-20">사용</th>
                    <th className="w-12 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {stopCodes.map((code, idx) => (
                    <tr
                      key={code.id}
                      className={`group border-b border-gray-800/40 hover:bg-gray-800/20 transition-colors ${
                        !code.active ? 'opacity-50' : ''
                      }`}
                    >
                      <td className="py-2 px-1">
                        <ReorderControls
                          canUp={idx > 0}
                          canDown={idx < stopCodes.length - 1}
                          onUp={() => moveStopCode(code.id, -1)}
                          onDown={() => moveStopCode(code.id, 1)}
                        />
                      </td>
                      <td className="px-3 py-2 text-gray-300 font-mono text-sm font-medium">
                        {code.code}
                      </td>
                      <td className="px-3 py-2">
                        <EditableCell
                          value={code.name}
                          onChange={(v) => updateStopCode(code.id, 'name', v)}
                          placeholder="명칭 입력"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <EditableCell
                          value={code.description}
                          onChange={(v) => updateStopCode(code.id, 'description', v)}
                          placeholder="설명 입력"
                          className="text-gray-400"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-center">
                          <Toggle
                            checked={code.active}
                            onChange={(v) => updateStopCode(code.id, 'active', v)}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => deleteStopCode(code.id)}
                          className="text-red-500/60 hover:text-red-500 transition-colors p-1"
                          title="삭제"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {stopCodes.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center text-gray-500 py-8 text-sm">
                        등록된 정지 코드가 없습니다. 우측 상단 [추가] 버튼을 눌러주세요.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* ========== 병목 코드 ========== */}
          <section className="bg-gray-900/60 rounded-lg border border-gray-800">
            <header className="flex items-center justify-between p-4 border-b border-gray-800">
              <h2 className="text-base font-bold text-gray-100 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500/80" />
                병목 코드 (Bottleneck Codes)
                <span className="text-xs text-gray-500 font-normal ml-1">{bottleneckCodes.length}개</span>
              </h2>
              <button
                onClick={addBottleneckCode}
                className="flex items-center gap-1 px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm border border-gray-700 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                추가
              </button>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-[11px] text-gray-500 uppercase tracking-wider border-b border-gray-800/60">
                    <th className="w-8 py-2"></th>
                    <th className="text-left px-3 py-2 w-20">코드</th>
                    <th className="text-left px-3 py-2 w-44">명칭</th>
                    <th className="text-left px-3 py-2">설명</th>
                    <th className="text-center px-3 py-2 w-24">심각도</th>
                    <th className="text-center px-3 py-2 w-20">사용</th>
                    <th className="w-12 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {bottleneckCodes.map((code, idx) => (
                    <tr
                      key={code.id}
                      className={`group border-b border-gray-800/40 hover:bg-gray-800/20 transition-colors ${
                        !code.active ? 'opacity-50' : ''
                      }`}
                    >
                      <td className="py-2 px-1">
                        <ReorderControls
                          canUp={idx > 0}
                          canDown={idx < bottleneckCodes.length - 1}
                          onUp={() => moveBottleneckCode(code.id, -1)}
                          onDown={() => moveBottleneckCode(code.id, 1)}
                        />
                      </td>
                      <td className="px-3 py-2 text-gray-300 font-mono text-sm font-medium">
                        {code.code}
                      </td>
                      <td className="px-3 py-2">
                        <EditableCell
                          value={code.name}
                          onChange={(v) => updateBottleneckCode(code.id, 'name', v)}
                          placeholder="명칭 입력"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <EditableCell
                          value={code.description}
                          onChange={(v) => updateBottleneckCode(code.id, 'description', v)}
                          placeholder="설명 입력"
                          className="text-gray-400"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-center">
                          <SeveritySelector
                            value={code.severity}
                            onChange={(v) => updateBottleneckCode(code.id, 'severity', v)}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-center">
                          <Toggle
                            checked={code.active}
                            onChange={(v) => updateBottleneckCode(code.id, 'active', v)}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => deleteBottleneckCode(code.id)}
                          className="text-red-500/60 hover:text-red-500 transition-colors p-1"
                          title="삭제"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {bottleneckCodes.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center text-gray-500 py-8 text-sm">
                        등록된 병목 코드가 없습니다. 우측 상단 [추가] 버튼을 눌러주세요.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* 하단 안내 */}
          <div className="text-xs text-gray-600 pb-4">
            💡 행 위에 마우스를 올리면 좌측에 ↑↓ 순서 변경 버튼이 나타납니다. 명칭/설명은 클릭해서 바로 수정 가능합니다.
          </div>
        </div>
      </main>
    </div>
  );
}
