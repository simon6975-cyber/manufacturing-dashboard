// src/components/BottleneckRuleSettings.tsx
// 설정 > 정지/병목코드 — 병목 판정 규칙(BN1~BN5) 설정
'use client';

import React, { useEffect, useState } from 'react';
import { Save, Loader2, RotateCcw, Activity } from 'lucide-react';
import {
  BottleneckRules, BottleneckCode, BOTTLENECK_CODES, DEFAULT_BOTTLENECK_RULES, describeRule,
} from '@/lib/bottleneck-rules';
import { fetchApiJson, describeLoadError } from '@/lib/fetch-error';

type NumField = { key: string; label: string; unit: string };
// 규칙별 숫자 입력 칸
const NUM_FIELDS: Record<BottleneckCode, NumField[]> = {
  BN1: [
    { key: 'overloadMinutes', label: '초과 지속', unit: '분 이상' },
    { key: 'windowHours', label: '빈도 기준 시간', unit: '시간' },
    { key: 'countThreshold', label: '초과 빈도', unit: '회 이상' },
  ],
  BN2: [{ key: 'emptyMinutes', label: '대기물량 0 지속', unit: '분 이상' }],
  BN3: [
    { key: 'windowHours', label: '기준 시간', unit: '시간' },
    { key: 'countThreshold', label: '정지 빈도', unit: '회 이상' },
  ],
  BN4: [{ key: 'runMinutes', label: '한 작업 RUN 지속', unit: '분 이상' }],
  BN5: [
    { key: 'windowHours', label: '기준 시간', unit: '시간' },
    { key: 'countThreshold', label: '정지 빈도', unit: '회 이상' },
  ],
};

export default function BottleneckRuleSettings() {
  const [rules, setRules] = useState<BottleneckRules | null>(null);
  const [saved, setSaved] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchApiJson<{ rules: BottleneckRules }>('/api/bottleneck-rules?fresh=1')
      .then((j) => { if (!cancelled) { setRules(j.rules); setSaved(JSON.stringify(j.rules)); } })
      .catch((err) => { if (!cancelled) { setError(describeLoadError(err)); setRules(DEFAULT_BOTTLENECK_RULES); } });
    return () => { cancelled = true; };
  }, []);

  if (!rules) {
    return (
      <section className="bg-gray-900/60 rounded-lg border border-gray-800 p-4 text-sm text-gray-500 flex items-center gap-1.5">
        <Loader2 className="w-4 h-4 animate-spin" />병목 판정 규칙을 불러오는 중...
      </section>
    );
  }

  const hasChanges = JSON.stringify(rules) !== saved;
  const update = (code: BottleneckCode, patch: Record<string, unknown>) =>
    setRules((prev) => (prev ? { ...prev, [code]: { ...prev[code], ...patch } } : prev));

  const handleSave = async () => {
    setSaving(true);
    try {
      const j = await fetchApiJson<{ rules: BottleneckRules }>('/api/bottleneck-rules', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules }),
      });
      setRules(j.rules);
      setSaved(JSON.stringify(j.rules));
      setError(null);
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch (err) {
      alert(`저장 실패: ${describeLoadError(err)}`);
    }
    setSaving(false);
  };

  return (
    <section className="bg-gray-900/60 rounded-lg border border-gray-800">
      <header className="flex items-center justify-between gap-3 p-4 border-b border-gray-800 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-gray-100 flex items-center gap-2">
            <Activity className="w-4 h-4 text-violet-400" />병목 판정 규칙
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            사내PC 동기화 스크립트가 1분마다 모든 장비에 이 규칙을 적용하고, 걸리면 공정흐름도에 병목 알람을 띄웁니다. 바꾼 규칙은 5분 안에 반영됩니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setRules(DEFAULT_BOTTLENECK_RULES)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-gray-900 hover:bg-gray-800 text-gray-300 font-medium transition-colors text-sm border border-gray-800">
            <RotateCcw className="w-3.5 h-3.5" />기본값
          </button>
          <button onClick={handleSave} disabled={saving || !hasChanges}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded font-medium transition-colors text-sm ${
              saving || !hasChanges ? 'bg-blue-600/40 text-white/60 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white'
            }`}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? '저장 중...' : done ? '✓ 저장 완료' : '규칙 저장'}
          </button>
        </div>
      </header>
      {error && <p className="text-xs text-amber-400 px-4 pt-3">⚠ 저장된 규칙을 불러오지 못해 기본값을 보여줍니다 · {error}</p>}
      <div className="divide-y divide-gray-800/60">
        {BOTTLENECK_CODES.map((code) => {
          const r = rules[code] as unknown as Record<string, unknown> & { enabled: boolean; name: string };
          return (
            <div key={code} className={`p-4 space-y-2 ${r.enabled ? '' : 'opacity-50'}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={r.enabled} onChange={(e) => update(code, { enabled: e.target.checked })} className="w-4 h-4 accent-violet-500" />
                  <span className="text-xs font-mono font-bold px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 border border-violet-500/30">{code}</span>
                </label>
                <input type="text" value={r.name} onChange={(e) => update(code, { name: e.target.value })}
                  className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 w-40 outline-none focus:border-blue-500" />
                <span className="text-xs text-gray-500">{describeRule(code, rules)}</span>
              </div>
              <div className="flex items-center gap-x-4 gap-y-2 flex-wrap pl-6">
                {NUM_FIELDS[code].map((f) => (
                  <label key={f.key} className="flex items-center gap-1.5 text-xs text-gray-400">
                    {f.label}
                    <input type="number" min={1} value={Number(r[f.key]) || ''}
                      onChange={(e) => update(code, { [f.key]: Number(e.target.value) })}
                      className="w-20 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-right font-mono text-gray-100 outline-none focus:border-blue-500" />
                    <span className="text-gray-500">{f.unit}</span>
                  </label>
                ))}
                {(code === 'BN3' || code === 'BN5') && (
                  <label className="flex items-center gap-1.5 text-xs text-gray-400">
                    정지코드
                    <input type="text" defaultValue={(r.stopCodes as string[]).join(', ')} key={(r.stopCodes as string[]).join(',')}
                      onBlur={(e) => {
                        const codes = e.target.value.split(/[,\s]+/).map((x) => x.trim().toUpperCase()).filter((x) => /^S\d+$/.test(x));
                        if (codes.length > 0) update(code, { stopCodes: Array.from(new Set(codes)) });
                      }}
                      placeholder="S1, S2"
                      className="w-32 bg-gray-900 border border-gray-700 rounded px-2 py-1 font-mono text-gray-100 outline-none focus:border-blue-500" />
                  </label>
                )}
                {code === 'BN2' && (
                  <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
                    <input type="checkbox" checked={Boolean(r.excludePrevIdle)} onChange={(e) => update(code, { excludePrevIdle: e.target.checked })} className="accent-violet-500" />
                    전공정 장비가 모두 IDLE 이면 제외
                  </label>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
