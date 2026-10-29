// src/lib/useCollapsible.ts
// 좁은 화면(모바일·가로보기, lg 미만)에서만 동작하는 접기 상태
// - 접힘 여부는 localStorage 에 기억 (페이지 이동·새로고침 후에도 유지)
// - PC(lg 이상)에서는 항상 펼친 상태로 보고, 토글 버튼도 숨긴다
'use client';

import { useCallback, useSyncExternalStore } from 'react';

const NARROW_QUERY = '(max-width: 1023px)'; // Tailwind lg(1024px) 미만
const CHANGE_EVENT = 'collapsible-change';

function subscribeNarrow(cb: () => void) {
  const mq = window.matchMedia(NARROW_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

function subscribeStorage(cb: () => void) {
  window.addEventListener('storage', cb);
  window.addEventListener(CHANGE_EVENT, cb);
  return () => {
    window.removeEventListener('storage', cb);
    window.removeEventListener(CHANGE_EVENT, cb);
  };
}

function readFlag(key: string): boolean {
  try { return localStorage.getItem(key) === '1'; } catch { return false; }
}

export function useCollapsible(storageKey: string) {
  const isNarrow = useSyncExternalStore(subscribeNarrow, () => window.matchMedia(NARROW_QUERY).matches, () => false);
  const stored = useSyncExternalStore(subscribeStorage, () => readFlag(storageKey), () => false);

  const toggle = useCallback(() => {
    try { localStorage.setItem(storageKey, readFlag(storageKey) ? '0' : '1'); } catch { /* 저장 불가 환경 — 무시 */ }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, [storageKey]);

  return { isNarrow, collapsed: isNarrow && stored, toggle };
}
