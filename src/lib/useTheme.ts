// src/lib/useTheme.ts
// 화면 테마(블랙/화이트) — <html data-theme="light"> 로 전환, localStorage 'theme' 에 기억
// 첫 화면 깜박임을 막으려고 초기 적용은 layout.tsx 의 인라인 스크립트(theme-init.ts)가 한다
'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { THEME_STORAGE_KEY as STORAGE_KEY } from './theme-init';

export type Theme = 'dark' | 'light';
const CHANGE_EVENT = 'theme-change';

function subscribe(cb: () => void) {
  window.addEventListener(CHANGE_EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(CHANGE_EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}

function readTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => 'dark' as Theme);

  const toggle = useCallback(() => {
    const next: Theme = readTheme() === 'light' ? 'dark' : 'light';
    if (next === 'light') document.documentElement.dataset.theme = 'light';
    else delete document.documentElement.dataset.theme;
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* 저장 불가 환경 — 이번 화면에만 적용 */ }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return { theme, toggle };
}
