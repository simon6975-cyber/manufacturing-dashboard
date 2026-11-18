// src/lib/theme-init.ts
// 서버 컴포넌트(layout.tsx)에서도 import 할 수 있게 'use client' 없는 파일로 분리
export const THEME_STORAGE_KEY = 'theme';
export const THEME_CHANGE_EVENT = 'theme-change';

// 저장된 테마를 첫 그리기 전에 <html data-theme> 에 적용하는 인라인 스크립트
// 기본은 화이트 — 사용자가 블랙을 고른 경우('dark' 저장)에만 다크로 둔다
export const THEME_INIT_SCRIPT =
  `try{if(localStorage.getItem('${THEME_STORAGE_KEY}')!=='dark')document.documentElement.dataset.theme='light'}catch(e){document.documentElement.dataset.theme='light'}`;

/** 저장된 테마를 <html> 에 다시 적용 — React 가 문서를 다시 그려 data-theme 이 지워졌을 때 복구용 */
export function applyStoredTheme(): void {
  let stored: string | null = null;
  try { stored = localStorage.getItem(THEME_STORAGE_KEY); } catch { /* 저장소 접근 불가 — 기본(화이트) */ }
  if (stored === 'dark') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = 'light';
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT)); // useTheme 구독자(사이드바 버튼) 갱신
}
