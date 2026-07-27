// src/lib/machine-defs.ts
'use client';

import { db } from './firebase';
import { doc, setDoc, onSnapshot, collection } from 'firebase/firestore';
import { useState, useEffect } from 'react';

export interface MachineDef {
  no: number;
  name: string;
  model: string;
  maker: string;
  group: string; // 내지, 표지, 제본, 포장
}

// 기본 장비 정의 (Firebase에 데이터 없을 때 사용)
export const DEFAULT_MACHINES: MachineDef[] = [
  { no:1,  name:'연속지출력 1호기', model:'520HD+',       maker:'SCREEN',     group:'내지' },
  { no:2,  name:'연속지출력 2호기', model:'520HD+',       maker:'SCREEN',     group:'내지' },
  { no:3,  name:'롤재단 1호기',     model:'S2020',        maker:'TECHNAU',    group:'내지' },
  { no:4,  name:'롤재단 2호기',     model:'S2320',        maker:'TECHNAU',    group:'내지' },
  { no:5,  name:'날장출력 1호기',   model:'이리데스',      maker:'FUJI FILM',  group:'표지' },
  { no:6,  name:'날장출력 2호기',   model:'레보리아',      maker:'FUJI FILM',  group:'표지' },
  { no:7,  name:'코팅 1호기',       model:'EUROLAM 540',  maker:'GMP',        group:'표지' },
  { no:8,  name:'코팅 2호기',       model:'PROTOPIC 540', maker:'GMP',        group:'표지' },
  { no:9,  name:'에폭시',           model:'DDC 810',      maker:'DUPLO',      group:'표지' },
  { no:10, name:'낱장재단 1호기',   model:'POLAR 92',     maker:'HEIDELBERG', group:'표지' },
  { no:11, name:'낱장재단 2호기',   model:'C860',         maker:'대호',        group:'표지' },
  { no:12, name:'제본 1호기',       model:'BQ470/HT80',   maker:'HORIZON',    group:'제본' },
  { no:13, name:'제본 2호기',       model:'BQ470/HT80',   maker:'HORIZON',    group:'제본' },
  { no:14, name:'제본 3호기',       model:'BQ500/HT300',  maker:'HORIZON',    group:'제본' },
  { no:15, name:'중철기',           model:'SPF-200A',     maker:'HORIZON',    group:'제본' },
  { no:16, name:'날개접지기',       model:'ZK320',        maker:'',           group:'제본' },
  { no:17, name:'시험지접지기',     model:'CSMO',         maker:'HUNKELER',   group:'제본' },
  { no:18, name:'박스포장',         model:'',             maker:'',           group:'포장' },
  { no:19, name:'댐지포장',         model:'',             maker:'',           group:'포장' },
];

// Firebase에 장비 정보 저장
export async function saveMachineDefs(machines: MachineDef[]): Promise<void> {
  const promises = machines.map(m =>
    setDoc(doc(db, 'machine_definitions', String(m.no)), {
      no: m.no, name: m.name, model: m.model, maker: m.maker, group: m.group,
    })
  );
  await Promise.all(promises);
}

// 실시간 구독 훅 — 공정흐름도, 터미널에서 공유
export function useMachineDefs(): { defs: Record<number, MachineDef>; loading: boolean } {
  const [defs, setDefs] = useState<Record<number, MachineDef>>(() => {
    const m: Record<number, MachineDef> = {};
    DEFAULT_MACHINES.forEach(d => { m[d.no] = d; });
    return m;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'machine_definitions'), (snap) => {
      const merged: Record<number, MachineDef> = {};
      // 기본값 먼저 채우기
      DEFAULT_MACHINES.forEach(d => { merged[d.no] = { ...d }; });
      // Firebase 데이터로 덮어쓰기
      snap.forEach(doc => {
        const data = doc.data();
        const no = parseInt(doc.id);
        if (merged[no]) {
          merged[no] = {
            no,
            name: data.name || merged[no].name,
            model: data.model ?? merged[no].model,
            maker: data.maker ?? merged[no].maker,
            group: data.group || merged[no].group,
          };
        }
      });
      setDefs(merged);
      setLoading(false);
    }, () => { setLoading(false); });
    return unsub;
  }, []);

  return { defs, loading };
}
