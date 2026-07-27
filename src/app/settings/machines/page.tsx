// src/app/settings/machines/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Save, Loader2, RotateCcw, Factory } from 'lucide-react';
import { useMachineDefs, saveMachineDefs, DEFAULT_MACHINES, MachineDef } from '@/lib/machine-defs';

const GROUPS = ['내지', '표지', '제본', '포장'];

export default function MachineSettingsPage() {
  const { defs, loading } = useMachineDefs();
  const [machines, setMachines] = useState<MachineDef[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Firebase 데이터 로드 시 로컬 상태에 반영
  useEffect(() => {
    if (!loading) {
      setMachines(Object.values(defs).sort((a, b) => a.no - b.no));
    }
  }, [defs, loading]);

  const updateField = (no: number, field: keyof MachineDef, value: string) => {
    setMachines(machines.map(m => m.no === no ? { ...m, [field]: value } : m));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveMachineDefs(machines);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      alert('저장 실패: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!confirm('모든 장비 정보를 기본값으로 복원하시겠습니까?')) return;
    setMachines([...DEFAULT_MACHINES]);
    setSaved(false);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-full">
        <div className="text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-400 mb-3" /><p className="text-sm text-gray-400">장비 정보를 불러오는 중...</p></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">장비 관리</h1>
          <p className="text-sm text-gray-500 mt-1">
            장비명, 기종, 제조사를 수정하면 공정흐름도와 터미널에 실시간 반영됩니다
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-gray-900 hover:bg-gray-800 text-gray-300 font-medium transition-colors text-sm border border-gray-800">
            <RotateCcw className="w-3.5 h-3.5" />기본값 복원
          </button>
          <button onClick={handleSave} disabled={saving}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded font-medium transition-colors text-sm ${
              saving ? 'bg-blue-600/40 text-white/60 cursor-not-allowed' : saved ? 'bg-green-600 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'
            }`}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? '저장 중...' : saved ? '✓ 저장 완료' : '저장'}
          </button>
        </div>
      </div>

      {/* 장비 테이블 */}
      <div className="bg-gray-900/60 rounded-lg border border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-gray-500 uppercase tracking-wider border-b border-gray-800/60 bg-gray-900/40">
                <th className="text-center px-3 py-3 w-14">NO</th>
                <th className="text-left px-3 py-3 min-w-[180px]">장비명</th>
                <th className="text-left px-3 py-3 min-w-[140px]">기종 (모델)</th>
                <th className="text-left px-3 py-3 min-w-[120px]">제조사</th>
                <th className="text-center px-3 py-3 w-24">공정</th>
              </tr>
            </thead>
            <tbody>
              {machines.map((m) => (
                <tr key={m.no} className="border-b border-gray-800/30 hover:bg-gray-800/20 transition-colors">
                  <td className="text-center px-3 py-2 font-mono font-bold text-gray-400">
                    {String(m.no).padStart(2, '0')}
                  </td>
                  <td className="px-3 py-2">
                    <input type="text" value={m.name}
                      onChange={(e) => updateField(m.no, 'name', e.target.value)}
                      className="w-full bg-transparent text-gray-200 hover:bg-gray-800/40 focus:bg-gray-800/60 px-2 py-1.5 rounded outline-none focus:ring-1 focus:ring-blue-500/30 transition-colors font-medium" />
                  </td>
                  <td className="px-3 py-2">
                    <input type="text" value={m.model}
                      onChange={(e) => updateField(m.no, 'model', e.target.value)}
                      placeholder="-"
                      className="w-full bg-transparent text-gray-300 hover:bg-gray-800/40 focus:bg-gray-800/60 px-2 py-1.5 rounded outline-none focus:ring-1 focus:ring-blue-500/30 transition-colors placeholder:text-gray-600" />
                  </td>
                  <td className="px-3 py-2">
                    <input type="text" value={m.maker}
                      onChange={(e) => updateField(m.no, 'maker', e.target.value)}
                      placeholder="-"
                      className="w-full bg-transparent text-gray-300 hover:bg-gray-800/40 focus:bg-gray-800/60 px-2 py-1.5 rounded outline-none focus:ring-1 focus:ring-blue-500/30 transition-colors placeholder:text-gray-600" />
                  </td>
                  <td className="px-3 py-2">
                    <select value={m.group}
                      onChange={(e) => updateField(m.no, 'group', e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 text-gray-200 px-2 py-1.5 rounded outline-none focus:border-blue-500/50 text-center">
                      {GROUPS.map(g => <option key={g} value={g} className="bg-gray-900">{g}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-gray-600 pb-4">
        💡 장비명, 기종, 제조사를 클릭해서 바로 수정할 수 있습니다. 수정 후 <strong>[저장]</strong>을 누르면 공정흐름도와 터미널에 실시간 반영됩니다.
      </p>
    </div>
  );
}
