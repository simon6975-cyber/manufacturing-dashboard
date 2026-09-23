// src/app/settings/machines/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Save, Loader2, RotateCcw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { useMachineDefs, saveMachineDefs, DEFAULT_MACHINES, MachineDef } from '@/lib/machine-defs';
import type { DspmMachineState } from '@/lib/machine-sync';

const GROUPS = ['내지', '표지', '제본', '포장'];

export default function MachineSettingsPage() {
  const { defs, loading } = useMachineDefs();
  const [machines, setMachines] = useState<MachineDef[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // 실측 DSPM 설비 목록(참고/매핑용).
  // Vercel 서버는 사내망(dspm.dsjs.co.kr:10920)에 방화벽 때문에 직접 못 붙는다 —
  // 대신 사내 PC에서 도는 dspm-local-sync 스크립트가 매번 Firestore(dspm_live/snapshot)에
  // 최신 스냅샷을 남기고, 여기서는 그 문서를 실시간 구독만 한다.
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

  const updateField = (no: number, field: 'name' | 'model' | 'maker' | 'group', value: string) => {
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
    if (!confirm('모든 장비 정보를 기본값으로 복원하시겠습니까? (실측 설비번호 매핑도 초기화됩니다)')) return;
    setMachines([...DEFAULT_MACHINES]);
    setSaved(false);
  };

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
                <th className="text-left px-3 py-3 min-w-[220px]">실측 설비(MCNO) — 자동연동</th>
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
                        className="w-full bg-gray-800 border border-gray-700 text-gray-200 px-2 py-1.5 rounded outline-none focus:border-blue-500/50 text-center">
                        {GROUPS.map(g => <option key={g} value={g} className="bg-gray-900">{g}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <input type="number" value={m.mcno ?? ''}
                          onChange={(e) => updateMcno(m.no, e.target.value)}
                          placeholder="미연결"
                          className="w-24 bg-gray-800 border border-gray-700 text-gray-200 px-2 py-1.5 rounded outline-none focus:border-blue-500/50 font-mono placeholder:text-gray-600" />
                        {m.mcno == null ? (
                          <span className="text-xs text-gray-600">수동 터미널 입력 사용</span>
                        ) : liveMatch ? (
                          <span className="flex items-center gap-1 text-xs text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" />{liveMatch.MCNM} · {liveMatch.STATE}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-amber-400">
                            <AlertTriangle className="w-3.5 h-3.5" />현재 응답에 없음
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-gray-600">
        💡 실측 설비(MCNO)를 채우면 해당 공정은 사람이 터미널에서 누르지 않아도 사내 DSPM 실측 API로부터
        자동으로 RUN/IDLE/정지코드가 반영됩니다(사내망 PC에서 도는 동기화 스크립트가 반영). 비워두면
        지금처럼 <code>/terminal/[no]</code>에서 수동 입력합니다. 장비명·기종·제조사 수정 후
        <strong> [저장]</strong>을 눌러야 반영됩니다.
      </p>

      {/* 실측 설비 미리보기 — 어떤 MCNO가 어떤 이름/상태인지 보고 위 입력칸에 채워 넣는다 */}
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
