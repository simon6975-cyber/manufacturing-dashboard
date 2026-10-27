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

// ─── DSPM MCNO 매핑 기준표 (v2.10.7 · 대시보드 장비관리 스크린샷 기준) ───
// NO | 장비명              | MCNO | DSPM명           | 비고
// 01 | 520HD+ 2호기        |  52  | IPHD양면_2호기   | 연속지출력기
// 02 | 520HD+ 3호기        |  60  | IPHD양면-3호기   | 연속지출력기
// 03 | C2028               |  49  | Tecnau_1호기     | 롤재단
// 04 | C2328               |  50  | Tecnau_2호기     | 롤재단
// 05 | PC1120              |  48  | 코올리너_1호기   | 날장출력
// 06 | PC2120              |  70  | 코올리너_2호기   | 날장출력
// 07 | EUROLAM 540         |  62  | 코팅기-1호기     | 코팅
// 08 | PROTOPIC 540        |  61  | 코팅기-2호기     | 코팅
// 09 | DDC 810 1호기       |  73  | 에폭시_1호기     | 에폭시
// 10 | DDC810 PRO 2호기    |  74  | 에폭시_2호기     | 에폭시
// 11 | POLAR 92            |  --  | (수동)           | 낱장재단
// 12 | C860                |  --  | (수동)           | 낱장재단
// 13 | BQ470 1호기         |  30  | 제본기_1호기     | 제본
// 14 | BQ470 2호기         |  43  | 제본기_2호기     | 제본
// 15 | BQ500 3호기         |  54  | 제본기_3호기     | 제본
// 16 | SPF-200A            |  29  | 중철기_1호기     | 중철기
// 17 | ZK320               |  --  | (수동)           | 날개접지기

// 기본 장비 정의 (Firebase에 데이터 없을 때 사용)
export const DEFAULT_MACHINES: MachineDef[] = [
  { no:1,  name:'520HD+ 2호기',      model:'Truepress Jet520HD+',  maker:'SCREEN',     group:'내지', mcno:52, equipmentGroup:'연속지출력기' },
  { no:2,  name:'520HD+ 3호기',      model:'Truepress Jet520HD+',  maker:'SCREEN',     group:'내지', mcno:60, equipmentGroup:'연속지출력기' },
  { no:3,  name:'C2028',             model:'C2028',                maker:'TECHNAU',    group:'내지', mcno:49, equipmentGroup:'롤재단' },
  { no:4,  name:'C2328',             model:'C2328',                maker:'TECHNAU',    group:'내지', mcno:50, equipmentGroup:'롤재단' },
  { no:5,  name:'PC1120',            model:'Revoria Press PC1120', maker:'FUJI FILM',  group:'표지', mcno:48, equipmentGroup:'날장출력' },
  { no:6,  name:'PC2120',            model:'Revoria Press PC2120', maker:'FUJI FILM',  group:'표지', mcno:70, equipmentGroup:'날장출력' },
  { no:7,  name:'EUROLAM 540',       model:'EUROLAM 540',          maker:'GMP',        group:'표지', mcno:62, equipmentGroup:'코팅' },
  { no:8,  name:'PROTOPIC 540',      model:'PROTOPIC 540',         maker:'GMP',        group:'표지', mcno:61, equipmentGroup:'코팅' },
  { no:9,  name:'DDC 810 1호기',     model:'DDC 810',              maker:'DUPLO',      group:'표지', mcno:73, equipmentGroup:'에폭시' },
  { no:10, name:'DDC810 PRO 2호기',  model:'Duplo DDC 810 Pro',    maker:'듀플로',      group:'표지', mcno:74, equipmentGroup:'에폭시' },
  { no:11, name:'POLAR 92',          model:'POLAR 92',             maker:'HEIDELBERG', group:'표지', equipmentGroup:'낱장재단' },
  { no:12, name:'C860',              model:'C860',                 maker:'대호',        group:'표지', equipmentGroup:'낱장재단' },
  { no:13, name:'BQ470 1호기',       model:'BQ470/HT80',           maker:'HORIZON',    group:'제본', mcno:30, equipmentGroup:'제본' },
  { no:14, name:'BQ470 2호기',       model:'BQ470/HT70',           maker:'HORIZON',    group:'제본', mcno:43, equipmentGroup:'제본' },
  { no:15, name:'BQ500 3호기',       model:'BQ500/HT300',          maker:'HORIZON',    group:'제본', mcno:54, equipmentGroup:'제본' },
  { no:16, name:'SPF-200A',          model:'SPF-200A',             maker:'HORIZON',    group:'제본', mcno:29, equipmentGroup:'중철기' },
  { no:17, name:'ZK320',             model:'ZK320',                maker:'',           group:'제본', equipmentGroup:'날개접지기' },
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
