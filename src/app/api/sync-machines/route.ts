// src/app/api/sync-machines/route.ts
// 실측 DSPM API를 읽어 Firestore(machines/*)에 반영한다.
// 트리거: ProcessFlowDiagram이 열려 있는 동안 클라이언트가 주기적으로 이 라우트를 호출한다
// (Vercel Hobby 플랜은 Cron이 1일 1회로 제한되어 있어 대시보드 상시 오픈을 트리거로 사용).
import { NextResponse } from 'next/server';
import { syncMachinesFromDspm } from '@/lib/machine-sync';
import { accumulateStatusDuration } from '@/lib/status-accumulation';

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

    // 상태 변경된 장비의 이전 상태 소요시간 누적
    let accumulated = 0;
    for (const entry of result.updated) {
      if (entry.prevStatus && entry.prevStatusChangedAt && entry.changedAt) {
        try {
          await accumulateStatusDuration({
            machineNo: entry.no,
            machineName: entry.name,
            prevStatus: entry.prevStatus,
            prevStopReason: entry.prevStopReason || '',
            prevStartTimestamp: entry.prevStatusChangedAt,
            changedTimestamp: entry.changedAt,
          });
          accumulated++;
        } catch (accErr) {
          console.error(`[sync-machines] 상태 누적 실패 (no=${entry.no}):`, accErr);
        }
      }
    }

    return NextResponse.json({ ok: true, accumulated, ...result });
  } catch (err) {
    console.error('[sync-machines]', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
