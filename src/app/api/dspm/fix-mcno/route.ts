// src/app/api/dspm/fix-mcno/route.ts
// DSPM MCNO 매핑을 Firebase machine_definitions에 일괄 적용하는 원타임 API
// POST /api/dspm/fix-mcno  → Firebase에 올바른 MCNO 매핑 저장 + 신규 장비 추가
// GET  /api/dspm/fix-mcno  → 현재 매핑 vs 올바른 매핑 비교 (dry-run)
import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

// ─── DSPM 스크린샷 기준 올바른 매핑 (2026-10-27) ───
const CORRECT_MCNO_MAP: Record<number, { mcno: number; dspmName: string }> = {
  1:  { mcno: 60, dspmName: 'IPHD양면-3호기' },
  2:  { mcno: 52, dspmName: 'IPHD양면_2호기' },
  3:  { mcno: 49, dspmName: 'Technau_1호기' },
  4:  { mcno: 50, dspmName: 'Technau_2호기' },
  7:  { mcno: 62, dspmName: '코팅기-1호기' },
  8:  { mcno: 61, dspmName: '코팅기-2호기' },
  9:  { mcno: 73, dspmName: '에폭시_1호기' },
  12: { mcno: 30, dspmName: '제본기_1호기' },
  13: { mcno: 43, dspmName: '제본기_2호기' },
  14: { mcno: 54, dspmName: '제본기_3호기' },
  15: { mcno: 29, dspmName: '중철기_1호기' },
};

// 신규 장비 (DSPM에는 있지만 대시보드에 없던 것)
const NEW_MACHINES: Array<{
  no: number; name: string; model: string; maker: string;
  group: string; mcno: number; equipmentGroup: string; dspmName: string;
}> = [
  { no: 20, name: '에폭시 2호기',   model: '',  maker: 'DUPLO', group: '표지', mcno: 74, equipmentGroup: '에폭시',   dspmName: '에폭시_2호기' },
  { no: 21, name: '코올리나 1호기', model: '',  maker: '',      group: '표지', mcno: 48, equipmentGroup: '코올리나', dspmName: '코올리나_1호기' },
  { no: 22, name: '코올리나 2호기', model: '',  maker: '',      group: '표지', mcno: 70, equipmentGroup: '코올리나', dspmName: '코올리나_2호기' },
];

// GET — dry-run 비교
export async function GET() {
  const db = getAdminDb();
  const snap = await db.collection('machine_definitions').get();

  const current: Record<number, { name: string; mcno: number | null }> = {};
  snap.forEach(docSnap => {
    const d = docSnap.data();
    current[parseInt(docSnap.id)] = {
      name: d.name || `장비 ${docSnap.id}`,
      mcno: typeof d.mcno === 'number' ? d.mcno : null,
    };
  });

  const changes: Array<{ no: number; name: string; currentMcno: number | null; correctMcno: number; dspmName: string; action: string }> = [];

  // 기존 장비 MCNO 비교
  for (const [noStr, mapping] of Object.entries(CORRECT_MCNO_MAP)) {
    const no = parseInt(noStr);
    const cur = current[no];
    if (!cur) {
      changes.push({ no, name: `(Firebase에 없음)`, currentMcno: null, correctMcno: mapping.mcno, dspmName: mapping.dspmName, action: 'CREATE' });
    } else if (cur.mcno !== mapping.mcno) {
      changes.push({ no, name: cur.name, currentMcno: cur.mcno, correctMcno: mapping.mcno, dspmName: mapping.dspmName, action: 'UPDATE' });
    } else {
      changes.push({ no, name: cur.name, currentMcno: cur.mcno, correctMcno: mapping.mcno, dspmName: mapping.dspmName, action: 'OK' });
    }
  }

  // 신규 장비
  for (const nm of NEW_MACHINES) {
    const cur = current[nm.no];
    changes.push({
      no: nm.no,
      name: cur ? cur.name : nm.name,
      currentMcno: cur?.mcno ?? null,
      correctMcno: nm.mcno,
      dspmName: nm.dspmName,
      action: cur ? (cur.mcno === nm.mcno ? 'OK' : 'UPDATE') : 'ADD_NEW',
    });
  }

  const needsFix = changes.filter(c => c.action !== 'OK');
  return NextResponse.json({
    mode: 'dry-run (GET으로 확인만, POST로 실제 적용)',
    totalMachinesInFirebase: snap.size,
    changes,
    needsFixCount: needsFix.length,
    alreadyOkCount: changes.length - needsFix.length,
  });
}

// POST — 실제 Firebase 업데이트
export async function POST() {
  const db = getAdminDb();
  const results: Array<{ no: number; action: string; mcno: number; status: string }> = [];

  // 1. 기존 장비 MCNO 업데이트
  for (const [noStr, mapping] of Object.entries(CORRECT_MCNO_MAP)) {
    const no = parseInt(noStr);
    const docRef = db.collection('machine_definitions').doc(String(no));
    try {
      const snap = await docRef.get();
      if (snap.exists) {
        await docRef.update({ mcno: mapping.mcno });
        results.push({ no, action: 'UPDATE', mcno: mapping.mcno, status: 'OK' });
      } else {
        // Firebase에 문서가 없으면 기본값으로 생성
        await docRef.set({ no, mcno: mapping.mcno, name: `장비 ${no}`, model: '', maker: '', group: '내지', equipmentGroup: '' });
        results.push({ no, action: 'CREATE', mcno: mapping.mcno, status: 'OK' });
      }
    } catch (err) {
      results.push({ no, action: 'UPDATE', mcno: mapping.mcno, status: `ERROR: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  // 2. 신규 장비 추가
  for (const nm of NEW_MACHINES) {
    const docRef = db.collection('machine_definitions').doc(String(nm.no));
    try {
      const snap = await docRef.get();
      if (snap.exists) {
        // 이미 있으면 mcno만 업데이트
        await docRef.update({ mcno: nm.mcno });
        results.push({ no: nm.no, action: 'UPDATE_EXISTING', mcno: nm.mcno, status: 'OK' });
      } else {
        await docRef.set({
          no: nm.no,
          name: nm.name,
          model: nm.model,
          maker: nm.maker,
          group: nm.group,
          mcno: nm.mcno,
          equipmentGroup: nm.equipmentGroup,
        });
        results.push({ no: nm.no, action: 'ADD_NEW', mcno: nm.mcno, status: 'OK' });
      }
    } catch (err) {
      results.push({ no: nm.no, action: 'ADD_NEW', mcno: nm.mcno, status: `ERROR: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  const okCount = results.filter(r => r.status === 'OK').length;
  const errCount = results.filter(r => r.status.startsWith('ERROR')).length;

  return NextResponse.json({
    mode: 'APPLIED',
    timestamp: new Date().toISOString(),
    totalUpdated: okCount,
    errors: errCount,
    results,
    summary: `${okCount}건 적용 완료${errCount > 0 ? `, ${errCount}건 오류` : ''}. 페이지를 새로고침하면 반영됩니다.`,
  });
}
