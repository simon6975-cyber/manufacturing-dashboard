// src/lib/queue-limits.ts
// 장비군별 대기물량 최대치 — Firestore settings/queue_limits { limits: { 장비군명: 숫자 } }
// 장비 관리 화면에서 입력, 공정흐름도에서 장비군 대기물량이 이 값 이상이면 '초과' 경고
// 보안 규칙상 브라우저가 settings/* 를 직접 못 써서 /api/queue-limits (Admin SDK) 를 거친다
'use client';

import { useEffect, useState } from 'react';
import { getCountUnit } from './count-unit';

// 공정흐름도 순서대로 (이름은 장비 정의의 equipmentGroup 과 같아야 한다)
export const EQUIPMENT_GROUPS = [
  '연속지출력기', '롤재단', '낱장출력', '코팅', '에폭시', '낱장재단',
  '제본', '중철기', '날개접지기', '시험지접지기', '포장',
] as const;

// 대기물량 표시 단위 — 롤재단·낱장출력은 DSPM getproccnt 의 컷팅·표지 단위(장)를 따른다
// (공정흐름도 computeGroupQueues 와 같은 단위여야 최대치 비교가 맞다)
const QUEUE_UNIT_OVERRIDES: Record<string, string> = { '롤재단': '장', '낱장출력': '장' };
export function queueUnit(name: string): string {
  return QUEUE_UNIT_OVERRIDES[name.replace(/\s+/g, '')] ?? getCountUnit(name);
}

export type QueueLimits = Record<string, number>;

const CHANGE_EVENT = 'queue-limits-change';
const REFRESH_MS = 60000; // 다른 PC 에서 바꾼 값도 1분 안에 반영

/** 장비군 이름을 비교용으로 정규화 (공백 제거) */
export function groupKey(name: string): string {
  return name.replace(/\s+/g, '');
}

export function useQueueLimits(): { limits: QueueLimits; loading: boolean; error: string | null } {
  const [limits, setLimits] = useState<QueueLimits>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/queue-limits', { cache: 'no-store' });
        const json = await res.json();
        if (cancelled) return;
        if (!json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
        setLimits(json.limits || {});
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
      if (!cancelled) setLoading(false);
    };
    load();
    const t = setInterval(load, REFRESH_MS);
    window.addEventListener(CHANGE_EVENT, load);
    return () => { cancelled = true; clearInterval(t); window.removeEventListener(CHANGE_EVENT, load); };
  }, []);
  return { limits, loading, error };
}

/** 빈 값·0 은 저장하지 않는다(= 최대치 없음, 초과 경고 안 함) */
export async function saveQueueLimits(limits: QueueLimits): Promise<void> {
  const res = await fetch('/api/queue-limits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limits }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
