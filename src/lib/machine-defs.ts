// src/lib/machine-defs.ts
'use client';

import { db } from './firebase';
import { doc, setDoc, deleteDoc, onSnapshot, collection } from 'firebase/firestore';
import { useState, useEffect } from 'react';

export interface MachineDef {
  no: number;
  name: string;
  model: string;
  maker: string;
  group: string; // 내지, 표지, 제본, 포장
  mcno?: number; // 실측 DSPM API 설비번호(MCNO) — 매핑 안 됐으면 undefined(수동 터미널 유지)
  equipmentGroup?: string; // 장비군 이름 (같은 이름끼리 한 장비군으로 묶임)
}

// 기본 장비 정의 (Firebase에 데이터 없을 때 사용)
export const DEFAULT_MACHINES: MachineDef[] = [
  { no:1,  name:'연속지출력 1호기', model:'520HD+',       maker:'SCREEN',     group:'내지', equipmentGroup:'연속지출력기' },
  { no:2,  name:'연속지출력 2호기', model:'520HD+',       maker:'SCREEN',     group:'내지', equipmentGroup:'연속지출력기' },
  { no:3,  name:'롤재단 1호기',     model:'S2020',        maker:'TECHNAU',    group:'내지', equipmentGroup:'롤재단' },
  { no:4,  name:'롤재단 2호기',     model:'S2320',        maker:'TECHNAU',    group:'내지', equipmentGroup:'롤재단' },
  { no:5,  name:'날장출력 1호기',   model:'이리데스',      maker:'FUJI FILM',  group:'표지', equipmentGroup:'낱장출력' },
  { no:6,  name:'날장출력 2호기',   model:'레보리아',      maker:'FUJI FILM',  group:'표지', equipmentGroup:'낱장출력' },
  { no:7,  name:'코팅 1호기',       model:'EUROLAM 540',  maker:'GMP',        group:'표지', equipmentGroup:'코팅' },
  { no:8,  name:'코팅 2호기',       model:'PROTOPIC 540', maker:'GMP',        group:'표지', equipmentGroup:'코팅' },
  { no:9,  name:'에폭시',           model:'DDC 810',      maker:'DUPLO',      group:'표지', equipmentGroup:'에폭시' },
  { no:10, name:'낱장재단 1호기',   model:'POLAR 92',     maker:'HEIDELBERG', group:'표지', equipmentGroup:'낱장재단' },
  { no:11, name:'낱장재단 2호기',   model:'C860',         maker:'대호',        group:'표지', equipmentGroup:'낱장재단' },
  { no:12, name:'제본 1호기',       model:'BQ470/HT80',   maker:'HORIZON',    group:'제본', equipmentGroup:'제본' },
  { no:13, name:'제본 2호기',       model:'BQ470/HT80',   maker:'HORIZON',    group:'제본', equipmentGroup:'제본' },
  { no:14, name:'제본 3호기',       model:'BQ500/HT300',  maker:'HORIZON',    group:'제본', equipmentGroup:'제본' },
  { no:15, name:'중철기',           model:'SPF-200A',     maker:'HORIZON',    group:'제본', equipmentGroup:'중철기' },
  { no:16, name:'날개접지기',       model:'ZK320',        maker:'',           group:'제본', equipmentGroup:'날개접지기' },
  { no:17, name:'시험지접지기',     model:'CSMO',         maker:'HUNKELER',   group:'제본', equipmentGroup:'시험지접지기' },
  { no:18, name:'박스포장',         model:'',             maker:'',           group:'포장', equipmentGroup:'포장' },
  { no:19, name:'댐지포장',         model:'',             maker:'',           group:'포장', equipmentGroup:'포장' },
];

// Firebase에 장비 정보 저장
export async function saveMachineDefs(machines: MachineDef[]): Promise<void> {
  const promises = machines.map(m =>
    setDoc(doc(db, 'machine_definitions', String(m.no)), {
      no: m.no, name: m.name, model: m.model, maker: m.maker, group: m.group,
      mcno: m.mcno ?? null, // Firestore는 undefined 저장 불가 → 미매핑은 null
      equipmentGroup: m.equipmentGroup || m.name.replace(/\s*\d+호기$/,'').replace(/\s+/g,''),
    })
  );
  await Promise.all(promises);
}

// 장비 삭제
export async function deleteMachineDef(no: number): Promise<void> {
  await deleteDoc(doc(db, 'machine_definitions', String(no)));
  // machines 컬렉션(상태 데이터)도 삭제
  await deleteDoc(doc(db, 'machines', String(no))).catch(() => {});
}

// DEFAULT_MACHINES의 equipmentGroup 참조 맵 (Firebase fallback용)
const DEFAULT_EQ_GROUP: Record<number, string> = {};
DEFAULT_MACHINES.forEach(d => { if (d.equipmentGroup) DEFAULT_EQ_GROUP[d.no] = d.equipmentGroup; });

// 실시간 구독 훅 — 공정흐름도, 터미널에서 공유
export function useMachineDefs(): { defs: Record<number, MachineDef>; loading: boolean; allDefs: MachineDef[] } {
  const [defs, setDefs] = useState<Record<number, MachineDef>>(() => {
    const m: Record<number, MachineDef> = {};
    DEFAULT_MACHINES.forEach(d => { m[d.no] = d; });
    return m;
  });
  const [loading, setLoading] = useState(true);
  const [firebaseLoaded, setFirebaseLoaded] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'machine_definitions'), (snap) => {
      if (snap.empty && !firebaseLoaded) {
        // Firebase에 데이터가 없으면 기본값 사용
        const merged: Record<number, MachineDef> = {};
        DEFAULT_MACHINES.forEach(d => { merged[d.no] = { ...d }; });
        setDefs(merged);
      } else {
        // Firebase 데이터만 사용 (추가/삭제 반영을 위해)
        const result: Record<number, MachineDef> = {};
        // 먼저 기본값으로 채우기 (Firebase에 없는 장비도 보이도록)
        if (!firebaseLoaded && snap.empty) {
          DEFAULT_MACHINES.forEach(d => { result[d.no] = { ...d }; });
        }
        snap.forEach(docSnap => {
          const data = docSnap.data();
          const no = parseInt(docSnap.id);
          result[no] = {
            no,
            name: data.name || `장비 ${no}`,
            model: data.model ?? '',
            maker: data.maker ?? '',
            group: data.group || '내지',
            mcno: typeof data.mcno === 'number' ? data.mcno : undefined,
            equipmentGroup: data.equipmentGroup || DEFAULT_EQ_GROUP[no] || data.name?.replace(/\s*\d+호기$/,'').replace(/\s+/g,'') || `장비군${no}`,
          };
        });
        // Firebase에 아직 아무 데이터도 없으면 기본값 유지
        if (Object.keys(result).length === 0) {
          DEFAULT_MACHINES.forEach(d => { result[d.no] = { ...d }; });
        }
        setDefs(result);
        setFirebaseLoaded(true);
      }
      setLoading(false);
    }, () => { setLoading(false); });
    return unsub;
  }, []);

  // allDefs: 정렬된 배열 반환
  const allDefs = Object.values(defs).sort((a, b) => a.no - b.no);

  return { defs, loading, allDefs };
}
