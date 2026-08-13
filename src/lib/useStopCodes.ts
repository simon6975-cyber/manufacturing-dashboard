// src/lib/useStopCodes.ts
'use client';

import { useState, useEffect } from 'react';
import { db } from './firebase';
import { doc, onSnapshot } from 'firebase/firestore';

export interface StopCodeItem {
  code: string;
  name: string;
  active: boolean;
}

const DEFAULT_STOP_CODES: StopCodeItem[] = [
  { code: 'S1', name: '장비 셋팅', active: true },
  { code: 'S2', name: '자재 준비', active: true },
  { code: 'S3', name: '작업 준비', active: true },
  { code: 'S4', name: '검수', active: true },
  { code: 'S5', name: '예방 정비', active: true },
  { code: 'S6', name: '설비 장애', active: true },
  { code: 'S7', name: '작업 중단', active: true },
  { code: 'S8', name: '인력 부재', active: true },
  { code: 'S9', name: '기타', active: true },
];

// 실시간 구독 훅 — 터미널, 공정흐름도에서 공유
export function useStopCodes(): { codes: StopCodeItem[]; codeMap: Record<string, string> } {
  const [codes, setCodes] = useState<StopCodeItem[]>(DEFAULT_STOP_CODES);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'code_settings', 'stop_codes'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const arr = data.codes;
        if (Array.isArray(arr) && arr.length > 0) {
          setCodes(arr.filter((c: any) => c.code && c.name).map((c: any) => ({
            code: c.code,
            name: c.name,
            active: c.active !== false,
          })));
        }
      }
    }, () => {
      // 에러 시 기본값 유지
    });
    return unsub;
  }, []);

  // code → name 매핑 (공정흐름도 배너 표시용)
  const codeMap: Record<string, string> = {};
  codes.forEach(c => { codeMap[c.code] = c.name; });

  return { codes, codeMap };
}
