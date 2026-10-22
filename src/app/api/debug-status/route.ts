// src/app/api/debug-status/route.ts
// 디버그: machine_status_daily 데이터 확인 + sync-machines 트리거
import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

function todayKST(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  try {
    const adminDb = getAdminDb();
    const date = todayKST();

    // 1. machine_status_daily 데이터 확인
    const statusSnap = await adminDb.collection(`machine_status_daily/${date}/machines`).get();
    const statusData: Record<string, unknown>[] = [];
    statusSnap.forEach((d) => {
      const data = d.data();
      statusData.push({
        docId: d.id,
        machineNo: data.machineNo,
        machineName: data.machineName,
        eventsCount: (data.events || []).length,
        states: data.states,
        lastEvent: (data.events || []).slice(-1)[0] || null,
      });
    });

    // 2. machines 컬렉션에서 몇 개 샘플 확인 (lastAccumulatedAt 등)
    const machinesSnap = await adminDb.collection('machines').limit(5).get();
    const machinesData: Record<string, unknown>[] = [];
    machinesSnap.forEach((d) => {
      const data = d.data();
      machinesData.push({
        docId: d.id,
        status: data.status,
        stopReason: data.stopReason,
        lastAccumulatedAt: data.lastAccumulatedAt,
        statusChangedAt: data.statusChangedAt?.toDate?.()?.toISOString?.() || data.statusChangedAt,
        historyCount: (data.history || []).length,
      });
    });

    // 3. status-daily API 직접 호출 결과 시뮬레이션
    const { getStatusDaily } = await import('@/lib/status-accumulation');
    const entries = await getStatusDaily(date);

    return NextResponse.json({
      ok: true,
      date,
      statusDailyDocs: statusData.length,
      statusDailyData: statusData,
      machinesSample: machinesData,
      apiEntries: entries.length,
      apiEntriesSample: entries.slice(0, 3).map(e => ({
        machineNo: e.machineNo,
        machineName: e.machineName,
        eventsCount: e.events.length,
        firstEvent: e.events[0] || null,
      })),
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    }, { status: 500 });
  }
}
