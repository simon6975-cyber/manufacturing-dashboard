// src/app/api/sync-machines/route.ts
// 실측 DSPM API를 읽어 Firestore(machines/*)에 반영하고, 모든 장비의 상태 시간을 누적한다.
// 트리거: 대시보드가 열려 있는 동안 클라이언트가 주기적으로 호출.
// 재접속 시 비접속 기간의 시간도 자동으로 보정(lastAccumulatedAt 기반).
import { NextResponse } from 'next/server';
import { syncMachinesFromDspm } from '@/lib/machine-sync';
import {
  accumulateStatusDuration,
  accumulateOngoingStatus,
  updateLastAccumulatedAt,
} from '@/lib/status-accumulation';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const secret = process.env.SYNC_SECRET;
  if (secret) {
    const url = new URL(req.url);
    const provided = url.searchParams.get('secret') || req.headers.get('x-sync-secret');
    if (provided !== secret) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }
  }

  try {
    const result = await syncMachinesFromDspm();
    const now = Date.now();
    let accumulatedChanged = 0;
    let accumulatedOngoing = 0;

    // 1) 상태 변경된 장비: 이전 상태 소요시간 누적 + lastAccumulatedAt 업데이트
    for (const entry of result.updated) {
      try {
        if (entry.prevStatus && entry.prevStatusChangedAt && entry.changedAt) {
          await accumulateStatusDuration({
            machineNo: entry.no,
            machineName: entry.name,
            prevStatus: entry.prevStatus,
            prevStopReason: entry.prevStopReason || '',
            prevStartTimestamp: entry.prevStatusChangedAt,
            changedTimestamp: entry.changedAt,
          });
          accumulatedChanged++;
        }
        await updateLastAccumulatedAt(entry.no, now);
      } catch (accErr) {
        console.error(`[sync-machines] 상태변경 누적 실패 (no=${entry.no}):`, accErr);
      }
    }

    // 2) 상태 미변경 장비: 진행 중인 상태의 시간 누적 (비접속 기간 보정 포함)
    for (const entry of result.unchanged) {
      try {
        // lastAccumulatedAt이 없으면 statusChangedAt 사용 (최초 누적)
        const fromTime = entry.lastAccumulatedAt || entry.statusChangedAt;
        if (fromTime > 0 && now > fromTime) {
          await accumulateOngoingStatus({
            machineNo: entry.no,
            machineName: entry.name,
            currentStatus: entry.status,
            currentStopReason: entry.stopReason,
            lastAccumulatedAt: fromTime,
            nowTimestamp: now,
          });
          accumulatedOngoing++;
        }
        await updateLastAccumulatedAt(entry.no, now);
      } catch (accErr) {
        console.error(`[sync-machines] 진행중 누적 실패 (no=${entry.no}):`, accErr);
      }
    }

    return NextResponse.json({
      ok: true,
      accumulatedChanged,
      accumulatedOngoing,
      updated: result.updated.length,
      unchanged: result.unchanged.length,
      stale: result.stale,
    });
  } catch (err) {
    console.error('[sync-machines]', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
