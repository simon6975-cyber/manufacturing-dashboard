// src/app/api/dspm/fix-mcno/route.ts
// DSPM MCNO 매핑을 Firebase machine_definitions에 일괄 적용하는 API
// GET  /api/dspm/fix-mcno  → 현재 매핑 vs 올바른 매핑 비교 (dry-run)
// POST /api/dspm/fix-mcno  → Firebase에 올바른 MCNO 매핑 저장
import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

// ─── v2.10.7 대시보드 장비관리 스크린샷 기준 올바른 전체 매핑 ───
// MCNO가 있으면 DSPM 연결, null이면 수동(미연결)
interface MachineSpec {
  no: number;
  name: string;
  model: string;
  maker: string;
  group: string;
  equipmentGroup: string;
  mcno: number | null;
  dspmName: string | null;
}

const CORRECT_MACHINES: MachineSpec[] = [
  { no:1,  name:'520HD+ 2호기',      model:'Truepress Jet520HD+',  maker:'SCREEN',     group:'내지', equipmentGroup:'연속지출력기', mcno:52, dspmName:'IPHD양면_2호기' },
  { no:2,  name:'520HD+ 3호기',      model:'Truepress Jet520HD+',  maker:'SCREEN',     group:'내지', equipmentGroup:'연속지출력기', mcno:60, dspmName:'IPHD양면-3호기' },
  { no:3,  name:'C2028',             model:'C2028',                maker:'TECHNAU',    group:'내지', equipmentGroup:'롤재단',       mcno:49, dspmName:'Tecnau_1호기' },
  { no:4,  name:'C2328',             model:'C2328',                maker:'TECHNAU',    group:'내지', equipmentGroup:'롤재단',       mcno:50, dspmName:'Tecnau_2호기' },
  { no:5,  name:'PC1120',            model:'Revoria Press PC1120', maker:'FUJI FILM',  group:'표지', equipmentGroup:'날장출력',     mcno:48, dspmName:'코올리너_1호기' },
  { no:6,  name:'PC2120',            model:'Revoria Press PC2120', maker:'FUJI FILM',  group:'표지', equipmentGroup:'날장출력',     mcno:70, dspmName:'코올리너_2호기' },
  { no:7,  name:'EUROLAM 540',       model:'EUROLAM 540',          maker:'GMP',        group:'표지', equipmentGroup:'코팅',         mcno:62, dspmName:'코팅기-1호기' },
  { no:8,  name:'PROTOPIC 540',      model:'PROTOPIC 540',         maker:'GMP',        group:'표지', equipmentGroup:'코팅',         mcno:61, dspmName:'코팅기-2호기' },
  { no:9,  name:'DDC 810 1호기',     model:'DDC 810',              maker:'DUPLO',      group:'표지', equipmentGroup:'에폭시',       mcno:73, dspmName:'에폭시_1호기' },
  { no:10, name:'DDC810 PRO 2호기',  model:'Duplo DDC 810 Pro',    maker:'듀플로',      group:'표지', equipmentGroup:'에폭시',       mcno:74, dspmName:'에폭시_2호기' },
  { no:11, name:'POLAR 92',          model:'POLAR 92',             maker:'HEIDELBERG', group:'표지', equipmentGroup:'낱장재단',     mcno:null, dspmName:null },
  { no:12, name:'C860',              model:'C860',                 maker:'대호',        group:'표지', equipmentGroup:'낱장재단',     mcno:null, dspmName:null },
  { no:13, name:'BQ470 1호기',       model:'BQ470/HT80',           maker:'HORIZON',    group:'제본', equipmentGroup:'제본',         mcno:30, dspmName:'제본기_1호기' },
  { no:14, name:'BQ470 2호기',       model:'BQ470/HT70',           maker:'HORIZON',    group:'제본', equipmentGroup:'제본',         mcno:43, dspmName:'제본기_2호기' },
  { no:15, name:'BQ500 3호기',       model:'BQ500/HT300',          maker:'HORIZON',    group:'제본', equipmentGroup:'제본',         mcno:54, dspmName:'제본기_3호기' },
  { no:16, name:'SPF-200A',          model:'SPF-200A',             maker:'HORIZON',    group:'제본', equipmentGroup:'중철기',       mcno:29, dspmName:'중철기_1호기' },
  { no:17, name:'ZK320',             model:'ZK320',                maker:'',           group:'제본', equipmentGroup:'날개접지기',   mcno:null, dspmName:null },
];

// GET — dry-run 비교
export async function GET() {
  const db = getAdminDb();
  const snap = await db.collection('machine_definitions').get();

  const current: Record<number, { name: string; mcno: number | null; model: string }> = {};
  snap.forEach(docSnap => {
    const d = docSnap.data();
    current[parseInt(docSnap.id)] = {
      name: d.name || `장비 ${docSnap.id}`,
      mcno: typeof d.mcno === 'number' ? d.mcno : null,
      model: d.model || '',
    };
  });

  const changes: Array<{
    no: number; correctName: string; currentName: string | null;
    currentMcno: number | null; correctMcno: number | null;
    dspmName: string | null; action: string; details: string;
  }> = [];

  for (const spec of CORRECT_MACHINES) {
    const cur = current[spec.no];
    if (!cur) {
      changes.push({
        no: spec.no, correctName: spec.name, currentName: null,
        currentMcno: null, correctMcno: spec.mcno,
        dspmName: spec.dspmName, action: 'CREATE', details: 'Firebase에 문서 없음 → 새로 생성',
      });
    } else {
      const diffs: string[] = [];
      if (cur.mcno !== spec.mcno) diffs.push(`mcno: ${cur.mcno} → ${spec.mcno}`);
      if (cur.name !== spec.name) diffs.push(`name: "${cur.name}" → "${spec.name}"`);

      changes.push({
        no: spec.no, correctName: spec.name, currentName: cur.name,
        currentMcno: cur.mcno, correctMcno: spec.mcno,
        dspmName: spec.dspmName,
        action: diffs.length > 0 ? 'UPDATE' : 'OK',
        details: diffs.length > 0 ? diffs.join(', ') : '일치',
      });
    }
  }

  // Firebase에 있지만 CORRECT_MACHINES에 없는 장비 (삭제 대상 후보)
  const correctNos = new Set(CORRECT_MACHINES.map(m => m.no));
  const extras: Array<{ no: number; name: string; mcno: number | null }> = [];
  for (const [noStr, cur] of Object.entries(current)) {
    const no = parseInt(noStr);
    if (!correctNos.has(no)) {
      extras.push({ no, name: cur.name, mcno: cur.mcno });
    }
  }

  const needsFix = changes.filter(c => c.action !== 'OK');
  return NextResponse.json({
    mode: 'dry-run (GET으로 확인만, POST로 실제 적용)',
    totalMachinesInFirebase: snap.size,
    correctMachineCount: CORRECT_MACHINES.length,
    changes,
    needsFixCount: needsFix.length,
    alreadyOkCount: changes.length - needsFix.length,
    extrasInFirebase: extras,
    extrasNote: extras.length > 0
      ? `Firebase에 ${extras.length}개 장비가 더 있음 (no: ${extras.map(e => e.no).join(',')}). POST 시 삭제됨.`
      : '없음',
  });
}

// POST — 실제 Firebase 업데이트 (전체 동기화)
export async function POST() {
  const db = getAdminDb();
  const results: Array<{ no: number; name: string; action: string; mcno: number | null; status: string }> = [];

  // 1. 올바른 17대 장비 upsert
  for (const spec of CORRECT_MACHINES) {
    const docRef = db.collection('machine_definitions').doc(String(spec.no));
    try {
      await docRef.set({
        no: spec.no,
        name: spec.name,
        model: spec.model,
        maker: spec.maker,
        group: spec.group,
        mcno: spec.mcno, // null이면 Firestore에 null 저장 (수동 장비)
        equipmentGroup: spec.equipmentGroup,
      });
      results.push({ no: spec.no, name: spec.name, action: 'SET', mcno: spec.mcno, status: 'OK' });
    } catch (err) {
      results.push({ no: spec.no, name: spec.name, action: 'SET', mcno: spec.mcno, status: `ERROR: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  // 2. CORRECT_MACHINES에 없는 기존 문서 삭제 (no:18,19,20,21,22 등)
  const correctNos = new Set(CORRECT_MACHINES.map(m => m.no));
  const snap = await db.collection('machine_definitions').get();
  for (const docSnap of snap.docs) {
    const no = parseInt(docSnap.id);
    if (!correctNos.has(no)) {
      try {
        await docSnap.ref.delete();
        results.push({ no, name: docSnap.data().name || `장비 ${no}`, action: 'DELETE', mcno: null, status: 'OK' });
      } catch (err) {
        results.push({ no, name: `장비 ${no}`, action: 'DELETE', mcno: null, status: `ERROR: ${err instanceof Error ? err.message : String(err)}` });
      }
    }
  }

  const okCount = results.filter(r => r.status === 'OK').length;
  const errCount = results.filter(r => r.status.startsWith('ERROR')).length;

  return NextResponse.json({
    mode: 'APPLIED',
    timestamp: new Date().toISOString(),
    totalProcessed: results.length,
    okCount,
    errors: errCount,
    results,
    summary: `${okCount}건 처리 완료${errCount > 0 ? `, ${errCount}건 오류` : ''}. 페이지를 새로고침하면 반영됩니다.`,
  });
}
