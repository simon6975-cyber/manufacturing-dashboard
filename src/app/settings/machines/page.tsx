// src/app/settings/machines/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Save, Loader2, RotateCcw, CheckCircle2, AlertTriangle, Plus, Trash2, X } from 'lucide-react';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { useMachineDefs, saveMachineDefs, deleteMachineDef, DEFAULT_MACHINES, MachineDef } from '@/lib/machine-defs';
import type { DspmMachineState } from '@/lib/machine-sync';

const GROUPS = ['내지', '표지', '제본', '포장'];

export default function MachineSettingsPage() {
  const { defs, loading } = useMachineDefs();
  const [machines, setMachines] = useState<MachineDef[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MachineDef | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newMachine, setNewMachine] = useState<MachineDef>({
    no: 20, name: '', model: '', maker: '', group: '내지', equipmentGroup: ''
  });

  // 실측 DSPM 설비 목록(참고/매핑용).
  const [live, setLive] = useState<DspmMachineState[]>([]);
  const [liveFetchedAt, setLiveFetchedAt] = useState<string>('');
  const [liveMissing, setLiveMissing] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'dspm_live', 'snapshot'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setLive(Array.isArray(data.data) ? data.data : []);
        setLiveFetchedAt(data.fetchedAtIso || '');
        setLiveMissing(false);
      } else {
        setLiveMissing(true);
      }
    });
    return unsub;
  }, []);

  // Firebase 데이터 로드 시 로컬 상태에 반영
  useEffect(() => {
    if (!loading) {
      setMachines(Object.values(defs).sort((a, b) => a.no - b.no));
    }
  }, [defs, loading]);

  // 새 장비 추가 시 다음 번호 자동 계산
  useEffect(() => {
    if (machines.length > 0) {
      const maxNo = Math.max(...machines.map(m => m.no));
      setNewMachine(prev => ({ ...prev, no: maxNo + 1 }));
    }
  }, [machines.length]);

  const updateField = (no: number, field: 'name' | 'model' | 'maker' | 'group' | 'equipmentGroup', value: string) => {
    setMachines(machines.map(m => m.no === no ? { ...m, [field]: value } : m));
    setSaved(false);
  };

  const updateMcno = (no: number, value: string) => {
    const parsed = value.trim() === '' ? undefined : parseInt(value, 10);
    setMachines(machines.map(m => m.no === no ? { ...m, mcno: Number.isNaN(parsed as number) ? undefined : parsed } : m));
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
    if (!confirm('모든 장비 정보를 기본값(19대)으로 복원하시겠습니까?\n추가된 장비는 삭제되고, 실측 설비번호 매핑도 초기화됩니다.')) return;
    setMachines([...DEFAULT_MACHINES]);
    setSaved(false);
  };

  const handleAddMachine = async () => {
    if (!newMachine.name.trim()) {
      alert('장비명을 입력해주세요.');
      return;
    }
    // 중복 번호 체크
    if (machines.some(m => m.no === newMachine.no)) {
      alert(`장비 번호 ${newMachine.no}은(는) 이미 사용 중입니다.`);
      return;
    }
    const machineToAdd: MachineDef = {
      ...newMachine,
      equipmentGroup: newMachine.equipmentGroup.trim() || newMachine.name.replace(/\s*\d+호기$/, '').replace(/\s+/g, ''),
    };
    const updated = [...machines, machineToAdd].sort((a, b) => a.no - b.no);
    setMachines(updated);
    setShowAddForm(false);
    setNewMachine({ no: machineToAdd.no + 1, name: '', model: '', maker: '', group: '내지', equipmentGroup: '' });
    setSaved(false);
    // 즉시 Firebase에 저장
    setSaving(true);
    try {
      await saveMachineDefs(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      alert('저장 실패: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMachine = async (machine: MachineDef) => {
    setSaving(true);
    try {
      await deleteMachineDef(machine.no);
      setMachines(prev => prev.filter(m => m.no !== machine.no));
      setDeleteTarget(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      alert('삭제 실패: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  };

  // 기존 장비군 목록 (자동완성용)
  const existingGroups = [...new Set(machines.map(m =>
    m.equipmentGroup || m.name.replace(/\s*\d+호기$/, '').replace(/\s+/g, '')
  ).filter(Boolean))];

  const liveByMcno = new Map(live.map(s => [s.MCNO, s]));
  const mappedMcnos = new Set(machines.filter(m => m.mcno != null).map(m => m.mcno));
  const unmappedLive = live.filter(s => !mappedMcnos.has(s.MCNO));

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
            장비 추가/삭제 및 정보 수정 → 공정흐름도와 터미널에 실시간 반영
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowAddForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors text-sm">
            <Plus className="w-3.5 h-3.5" />장비 추가
          </button>
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

      {/* 장비 추가 폼 */}
      {showAddForm && (
        <div className="bg-emerald-950/30 rounded-lg border border-emerald-500/30 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-emerald-300">새 장비 추가</h2>
            <button onClick={() => setShowAddForm(false)} className="text-gray-400 hover:text-gray-200"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <div>
              <label className="text-[10px] text-gray-500 uppercase mb-1 block">번호</label>
              <input type="number" value={newMachine.no}
                onChange={(e) => setNewMachine({ ...newMachine, no: parseInt(e.target.value) || 0 })}
                className="w-full bg-gray-800 border border-gray-700 text-gray-200 px-2 py-1.5 rounded outline-none focus:border-emerald-500/50 font-mono text-sm" />
            </div>
            <div className="col-span-1 md:col-span-1 lg:col-span-2">
              <label className="text-[10px] text-gray-500 uppercase mb-1 block">장비명 *</label>
              <input type="text" value={newMachine.name} placeholder="예: 코팅 3호기"
                onChange={(e) => setNewMachine({ ...newMachine, name: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 text-gray-200 px-2 py-1.5 rounded outline-none focus:border-emerald-500/50 text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 uppercase mb-1 block">기종</label>
              <input type="text" value={newMachine.model} placeholder="-"
                onChange={(e) => setNewMachine({ ...newMachine, model: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 text-gray-200 px-2 py-1.5 rounded outline-none focus:border-emerald-500/50 text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 uppercase mb-1 block">제조사</label>
              <input type="text" value={newMachine.maker} placeholder="-"
                onChange={(e) => setNewMachine({ ...newMachine, maker: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 text-gray-200 px-2 py-1.5 rounded outline-none focus:border-emerald-500/50 text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 uppercase mb-1 block">공정</label>
              <select value={newMachine.group}
                onChange={(e) => setNewMachine({ ...newMachine, group: e.target.value })}
                className="w-full bg-gray-800 border border-gray-700 text-gray-200 px-2 py-1.5 rounded outline-none focus:border-emerald-500/50 text-sm">
                {GROUPS.map(g => <option key={g} value={g} className="bg-gray-900">{g}</option>)}
              </select>
            </div>
            <div className="col-span-2 md:col-span-4 lg:col-span-2">
              <label className="text-[10px] text-gray-500 uppercase mb-1 block">장비군 (같은 이름 → 한 그룹)</label>
              <div className="relative">
                <input type="text" value={newMachine.equipmentGroup}
                  placeholder="비워두면 장비명에서 자동 추출"
                  onChange={(e) => setNewMachine({ ...newMachine, equipmentGroup: e.target.value })}
                  list="eq-groups"
                  className="w-full bg-gray-800 border border-gray-700 text-gray-200 px-2 py-1.5 rounded outline-none focus:border-emerald-500/50 text-sm" />
                <datalist id="eq-groups">
                  {existingGroups.map(g => <option key={g} value={g} />)}
                </datalist>
              </div>
            </div>
            <div className="col-span-2 md:col-span-4 lg:col-span-5 flex items-end">
              <button onClick={handleAddMachine} disabled={saving}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors text-sm disabled:opacity-50">
                <Plus className="w-3.5 h-3.5" />추가 및 저장
              </button>
            </div>
          </div>
          <p className="text-[10px] text-gray-600 mt-2">
            💡 장비군이 같은 장비들은 공정흐름도에서 하나의 그룹으로 묶여 표시됩니다. 기존 장비군({existingGroups.join(', ')})에 추가하려면 같은 이름을 입력하세요.
          </p>
        </div>
      )}

      {/* 장비 테이블 */}
      <div className="bg-gray-900/60 rounded-lg border border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-gray-500 uppercase tracking-wider border-b border-gray-800/60 bg-gray-900/40">
                <th className="text-center px-3 py-3 w-14">NO</th>
                <th className="text-left px-3 py-3 min-w-[160px]">장비명</th>
                <th className="text-left px-3 py-3 min-w-[120px]">기종 (모델)</th>
                <th className="text-left px-3 py-3 min-w-[100px]">제조사</th>
                <th className="text-center px-3 py-3 w-20">공정</th>
                <th className="text-left px-3 py-3 min-w-[100px]">장비군</th>
                <th className="text-left px-3 py-3 min-w-[200px]">실측 설비(MCNO)</th>
                <th className="text-center px-3 py-3 w-14">삭제</th>
              </tr>
            </thead>
            <tbody>
              {machines.map((m) => {
                const liveMatch = m.mcno != null ? liveByMcno.get(m.mcno) : undefined;
                return (
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
                        className="w-full bg-gray-800 border border-gray-700 text-gray-200 px-2 py-1.5 rounded outline-none focus:border-blue-500/50 text-center text-xs">
                        {GROUPS.map(g => <option key={g} value={g} className="bg-gray-900">{g}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input type="text"
                        value={m.equipmentGroup || m.name.replace(/\s*\d+호기$/, '').replace(/\s+/g, '')}
                        onChange={(e) => updateField(m.no, 'equipmentGroup', e.target.value)}
                        list="eq-groups-table"
                        className="w-full bg-transparent text-gray-300 hover:bg-gray-800/40 focus:bg-gray-800/60 px-2 py-1.5 rounded outline-none focus:ring-1 focus:ring-blue-500/30 transition-colors text-xs" />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <input type="number" value={m.mcno ?? ''}
                          onChange={(e) => updateMcno(m.no, e.target.value)}
                          placeholder="미연결"
                          className="w-20 bg-gray-800 border border-gray-700 text-gray-200 px-2 py-1.5 rounded outline-none focus:border-blue-500/50 font-mono placeholder:text-gray-600 text-xs" />
                        {m.mcno == null ? (
                          <span className="text-[10px] text-gray-600">수동</span>
                        ) : liveMatch ? (
                          <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                            <CheckCircle2 className="w-3 h-3" />{liveMatch.MCNM}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[10px] text-amber-400">
                            <AlertTriangle className="w-3 h-3" />없음
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button onClick={() => setDeleteTarget(m)}
                        className="p-1 rounded hover:bg-rose-500/20 text-gray-600 hover:text-rose-400 transition-colors"
                        title="장비 삭제">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <datalist id="eq-groups-table">
            {existingGroups.map(g => <option key={g} value={g} />)}
          </datalist>
        </div>
      </div>

      <p className="text-xs text-gray-600">
        💡 장비명·기종·제조사·장비군 수정 후 <strong>[저장]</strong>을 눌러야 반영됩니다.
        장비군이 같으면 공정흐름도에서 한 그룹으로 묶입니다.
        실측 설비(MCNO)를 채우면 DSPM API 자동 연동됩니다.
      </p>

      {/* 삭제 확인 모달 */}
      {deleteTarget && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40" onClick={() => setDeleteTarget(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 rounded-xl border border-gray-700 p-6 max-w-md w-full shadow-2xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-rose-500/15 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-rose-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-100">장비 삭제</h3>
                  <p className="text-sm text-gray-400">이 작업은 되돌릴 수 없습니다</p>
                </div>
              </div>
              <div className="bg-gray-800/60 rounded-lg p-3 mb-4">
                <p className="text-sm text-gray-200">
                  <span className="font-mono text-gray-500">NO {String(deleteTarget.no).padStart(2, '0')}</span>
                  {' '}<span className="font-bold">{deleteTarget.name}</span>
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {deleteTarget.model || '-'} · {deleteTarget.maker || '-'} · {deleteTarget.group}
                </p>
              </div>
              <p className="text-sm text-gray-400 mb-5">
                장비 정의와 상태 데이터가 Firebase에서 삭제되며, 공정흐름도와 터미널에서도 제거됩니다.
              </p>
              <div className="flex items-center justify-end gap-2">
                <button onClick={() => setDeleteTarget(null)}
                  className="px-4 py-2 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium transition-colors text-sm">
                  취소
                </button>
                <button onClick={() => handleDeleteMachine(deleteTarget)} disabled={saving}
                  className="px-4 py-2 rounded bg-rose-600 hover:bg-rose-500 text-white font-medium transition-colors text-sm disabled:opacity-50 flex items-center gap-1.5">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  삭제
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* 실측 설비 미리보기 */}
      <div className="bg-gray-900/60 rounded-lg border border-gray-800 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/60">
          <div>
            <h2 className="text-sm font-bold text-gray-200">실측 DSPM 설비 목록 (참고용)</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              사내망 PC의 동기화 스크립트(dspm-local-sync)가 마지막으로 가져온 실측 상태입니다.
              {liveFetchedAt && <> · 마지막 수신: {new Date(liveFetchedAt).toLocaleString('ko-KR')}</>}
            </p>
          </div>
        </div>
        <div className="p-4">
          {liveMissing && (
            <p className="text-sm text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              아직 데이터가 없습니다 — 사내망 PC에서 dspm-local-sync 스크립트가 한 번도 실행되지 않았을 수 있습니다.
            </p>
          )}
          {!liveMissing && live.length === 0 && (
            <p className="text-sm text-gray-600">보고 중인 설비가 없습니다.</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {live.map((s) => {
              const mapped = mappedMcnos.has(s.MCNO);
              return (
                <div key={s.MCNO} className={`rounded-lg border px-3 py-2 text-xs ${mapped ? 'border-gray-800 bg-gray-950/40' : 'border-amber-500/30 bg-amber-500/5'}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-gray-300">MCNO {s.MCNO}</span>
                    <span className={mapped ? 'text-emerald-400' : 'text-amber-400'}>{mapped ? '연결됨' : '미매핑'}</span>
                  </div>
                  <p className="text-gray-200 font-medium mt-0.5">{s.MCNM}</p>
                  <p className="text-gray-500 mt-0.5">{s.STATE} · {new Date(s.TM).toLocaleString('ko-KR')}</p>
                </div>
              );
            })}
          </div>
          {unmappedLive.length > 0 && (
            <p className="text-xs text-amber-400 mt-3">
              ⚠ {unmappedLive.length}개 설비가 아직 위 표의 어느 공정에도 매핑되지 않았습니다.
              해당 공정을 찾아 &quot;실측 설비(MCNO)&quot; 칸에 번호를 입력하고 저장하세요.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
