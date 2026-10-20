// src/app/api/cron/save-daily-production/route.ts
// Vercel Cron: 매일 23:55 KST에 dspm_live/snapshot → production_daily 저장
// 수동 호출도 가능 (GET /api/cron/save-daily-production)
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 30; // 최대 30초

// KST 기준 오늘 날짜
function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

// 장비군 → 단위 (count-unit.ts와 동일)
function getCountUnit(equipmentGroup: string): string {
  if (/연속지출력|롤재단|낱장출력/.test(equipmentGroup)) return '페이지';
  if (/코팅|에폭시|낱장재단/.test(equipmentGroup)) return '장';
  if (/제본|중철|날개접지|시험지접지|포장/.test(equipmentGroup)) return '부';
  return '건';
}

// Vercel Cron 인증 (CRON_SECRET 환경변수 설정 시 검증)
function verifyCron(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // 비밀키 미설정이면 통과
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: Request) {
  // 인증 체크
  if (!verifyCron(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const date = todayKST();

    // 1. dspm_live/snapshot에서 현재 데이터 읽기
    const snapshotDoc = await adminDb.doc('dspm_live/snapshot').get();
    if (!snapshotDoc.exists) {
      return NextResponse.json({ ok: false, error: 'dspm_live/snapshot not found', date });
    }
    const rawList = snapshotDoc.data()?.data;
    if (!Array.isArray(rawList) || rawList.length === 0) {
      return NextResponse.json({ ok: false, error: 'No DSPM data in snapshot', date });
    }

    // MCNO → DAYCOMCNT 매핑
    const dspmMap: Record<number, number> = {};
    rawList.forEach((s: Record<string, unknown>) => {
      const mcno = typeof s.MCNO === 'string' ? parseInt(s.MCNO, 10) : Number(s.MCNO) || 0;
      if (mcno > 0) {
        dspmMap[mcno] = typeof s.DAYCOMCNT === 'number' ? s.DAYCOMCNT
          : typeof s.DAYCOMCNT === 'string' ? parseInt(s.DAYCOMCNT, 10) || 0 : 0;
      }
    });

    // 2. machine_definitions에서 장비 목록 읽기
    const machineSnap = await adminDb.collection('machine_definitions').get();
    if (machineSnap.empty) {
      return NextResponse.json({ ok: false, error: 'No machine_definitions found', date });
    }

    // 3. production_daily/{date}/machines/{no}에 저장
    const batch = adminDb.batch();
    let savedCount = 0;

    machineSnap.forEach((docSnap) => {
      const data = docSnap.data();
      const no = data.no ?? parseInt(docSnap.id, 10);
      const mcno = typeof data.mcno === 'number' ? data.mcno : null;

      if (mcno == null) return; // MCNO 매핑 안 된 장비는 스킵

      const dayComCnt = dspmMap[mcno];
      if (dayComCnt == null || dayComCnt <= 0) return; // 생산량 없으면 스킵

      const equipmentGroup = data.equipmentGroup
        || (data.name || '').replace(/\s*\d+호기$/, '').replace(/\s+/g, '');

      const ref = adminDb.doc(`production_daily/${date}/machines/${no}`);
      batch.set(ref, {
        machineNo: no,
        machineName: data.name || `장비 ${no}`,
        equipmentGroup,
        group: data.group || '',
        dayCompletedCount: dayComCnt,
        date,
        updatedAt: new Date(),
      }, { merge: true });

      savedCount++;
    });

    if (savedCount > 0) {
      await batch.commit();
    }

    return NextResponse.json({
      ok: true,
      date,
      savedCount,
      message: `${savedCount}개 장비 생산량 저장 완료`,
    });
  } catch (err) {
    console.error('save-daily-production error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
