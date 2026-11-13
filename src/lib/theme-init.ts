// src/lib/theme-init.ts
// 서버 컴포넌트(layout.tsx)에서도 import 할 수 있게 'use client' 없는 파일로 분리
export const THEME_STORAGE_KEY = 'theme';

// 저장된 테마를 첫 그리기 전에 <html data-theme> 에 적용하는 인라인 스크립트
export const THEME_INIT_SCRIPT =
  `try{if(localStorage.getItem('${THEME_STORAGE_KEY}')==='light')document.documentElement.dataset.theme='light'}catch(e){}`;
