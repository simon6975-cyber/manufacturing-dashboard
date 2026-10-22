// src/app/api/cron/save-daily-production/route.ts
// Vercel Cron: 매일 23:55 KST에 실행
// 1) dspm_live/snapshot → production_daily 저장
// 2) machines/{no} → machine_status_daily 상태 시간 누적
//    (대시보드가 꺼져있어도 하루 1회 상태 시간이 기록됨)
import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import {
  accumulateOngoingStatus,
  stateKey,
} from '@/lib/status-accumulation';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 상태 누적 포함하여 60초

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
    const adminDb = getAdminDb();
    const now = Date.now();

    // ═══════════════════════════════════════════════════
    // PART 1: 생산량 저장 (기존 로직)
    // ═══════════════════════════════════════════════════
    let savedCount = 0;

    const snapshotDoc = await adminDb.doc('dspm_live/snapshot').get();
    const rawList = snapshotDoc.exists ? snapshotDoc.data()?.data : null;

    // 장비 정의 읽기 (두 파트 공통)
    const machineDefSnap = await adminDb.collection('machine_definitions').get();

    if (Array.isArray(rawList) && rawList.length > 0 && !machineDefSnap.empty) {
      // MCNO → DAYCOMCNT 매핑
      const dspmMap: Record<number, number> = {};
      rawList.forEach((s: Record<string, unknown>) => {
        const mcno = typeof s.MCNO === 'string' ? parseInt(s.MCNO, 10) : Number(s.MCNO) || 0;
        if (mcno > 0) {
          dspmMap[mcno] = typeof s.DAYCOMCNT === 'number' ? s.DAYCOMCNT
            : typeof s.DAYCOMCNT === 'string' ? parseInt(s.DAYCOMCNT, 10) || 0 : 0;
        }
      });

      const batch = adminDb.batch();

      machineDefSnap.forEach((docSnap) => {
        const data = docSnap.data();
        const no = data.no ?? parseInt(docSnap.id, 10);
        const mcno = typeof data.mcno === 'number' ? data.mcno : null;

        if (mcno == null) return;

        const dayComCnt = dspmMap[mcno];
        if (dayComCnt == null || dayComCnt <= 0) return;

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
    }

    // ═══════════════════════════════════════════════════
    // PART 2: 상태 시간 누적 (Admin SDK로 machines 직접 읽기)
    // ═══════════════════════════════════════════════════
    let statusAccumulated = 0;

    // machines 컬렉션에서 모든 장비의 현재 상태 읽기
    const machinesSnap = await adminDb.collection('machines').get();

    // machine_definitions에서 이름 매핑 (no → name)
    const machineNames: Record<number, string> = {};
    machineDefSnap.forEach((docSnap) => {
      const data = docSnap.data();
      const no = data.no ?? parseInt(docSnap.id, 10);
      machineNames[no] = data.name || `장비 ${no}`;
    });

    for (const docSnap of machinesSnap.docs) {
      const no = parseInt(docSnap.id, 10);
      if (isNaN(no)) continue;

      const data = docSnap.data();
      const status = data.status;
      if (!status) continue; // 상태 데이터 없는 장비 스킵

      const stopReason = data.stopReason || '';
      const machineName = machineNames[no] || `장비 ${no}`;

      // lastAccumulatedAt이 없으면 statusChangedAt 사용
      const lastAccum = data.lastAccumulatedAt || 0;
      const statusChangedAt = data.statusChangedAt?.toDate?.()?.getTime?.()
        ?? (data.statusChangedAt?._seconds ? data.statusChangedAt._seconds * 1000 : 0);
      const fromTime = lastAccum || statusChangedAt;

      if (fromTime > 0 && now > fromTime) {
        try {
          await accumulateOngoingStatus({
            machineNo: no,
            machineName,
            currentStatus: status,
            currentStopReason: stopReason,
            lastAccumulatedAt: fromTime,
            nowTimestamp: now,
          });

          // lastAccumulatedAt 업데이트
          await adminDb.doc(`machines/${no}`).set(
            { lastAccumulatedAt: now },
            { merge: true }
          );
          statusAccumulated++;
        } catch (accErr) {
          console.error(`[cron] 상태 누적 실패 (no=${no}):`, accErr);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      date,
      savedCount,
      statusAccumulated,
      message: `생산량 ${savedCount}건, 상태누적 ${statusAccumulated}건 저장 완료`,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('save-daily-production error:', errMsg);
    return NextResponse.json(
      {
        ok: false,
        error: errMsg,
        hint: errMsg.includes('Project Id') || errMsg.includes('credential')
          ? 'Vercel 환경변수 FIREBASE_SERVICE_ACCOUNT_KEY가 올바르게 설정되었는지 확인하세요.'
          : undefined,
      },
      { status: 500 },
    );
  }
}
