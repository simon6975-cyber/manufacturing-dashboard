// src/components/QueueLimitSettings.tsx
// 장비 관리 — 장비군별 대기물량 최대치 입력 (공정흐름도 '초과' 경고 기준)
'use client';

import React, { useState } from 'react';
import { Save, Loader2 } from 'lucide-react';
import { EQUIPMENT_GROUPS, useQueueLimits, saveQueueLimits, groupKey, queueUnit, QueueLimits } from '@/lib/queue-limits';

export default function QueueLimitSettings() {
  const { limits, loading } = useQueueLimits();
  // 사용자가 고친 칸만 보관 — 나머지는 Firestore 값을 그대로 보여준다
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const valueOf = (name: string) => edits[name] ?? (limits[groupKey(name)]?.toString() ?? '');
  const hasChanges = Object.keys(edits).length > 0;

  const handleSave = async () => {
    setSaving(true);
    try {
      const next: QueueLimits = {};
      for (const name of EQUIPMENT_GROUPS) {
        const n = Number(valueOf(name).replace(/,/g, ''));
        if (n > 0) next[name] = n;
      }
      await saveQueueLimits(next);
      setEdits({});
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      alert(`저장 실패: ${err instanceof Error ? err.message : String(err)}`);
    }
    setSaving(false);
  };

  return (
    <div className="bg-gray-900/60 rounded-lg border border-gray-800 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-800/60 flex-wrap">
        <div>
          <h2 className="text-sm font-bold text-gray-200">장비군별 대기물량 최대치</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            공정흐름도에서 장비군 대기물량이 이 값 이상이면 &apos;초과&apos; 경고가 깜박입니다. 비워 두면 경고하지 않습니다.
          </p>
        </div>
        <button onClick={handleSave} disabled={saving || !hasChanges}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded font-medium transition-colors text-sm ${
            saving || !hasChanges ? 'bg-blue-600/40 text-white/60 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white'
          }`}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {saving ? '저장 중...' : saved ? '✓ 저장 완료' : '최대치 저장'}
        </button>
      </div>
      <div className="p-4">
        {loading ? (
          <p className="text-sm text-gray-500 flex items-center gap-1.5"><Loader2 className="w-4 h-4 animate-spin" />불러오는 중...</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {EQUIPMENT_GROUPS.map((name) => {
              const changed = edits[name] !== undefined;
              return (
                <label key={name}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${changed ? 'border-blue-500/50 bg-blue-500/5' : 'border-gray-800 bg-gray-950/40'}`}>
                  <span className="text-sm text-gray-300 w-24 shrink-0">{name}</span>
                  <input type="text" inputMode="numeric" placeholder="없음"
                    value={valueOf(name)}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^\d]/g, '');
                      setEdits((prev) => ({ ...prev, [name]: v }));
                    }}
                    className="flex-1 min-w-0 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-right font-mono text-gray-100 placeholder:text-gray-600 outline-none focus:border-blue-500" />
                  <span className="text-xs text-gray-500 w-10 shrink-0">{queueUnit(name)}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
