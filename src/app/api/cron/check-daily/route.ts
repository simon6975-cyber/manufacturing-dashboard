// 진단용: production_daily 데이터 확인 (배포 후 삭제 예정)
import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const date = url.searchParams.get('date');
  if (!date) {
    return NextResponse.json({ error: 'date 파라미터 필요 (?date=2026-10-20)' });
  }

  try {
    const adminDb = getAdminDb();
    const snap = await adminDb.collection(`production_daily/${date}/machines`).get();
    const docs = snap.docs.map(d => ({
      id: d.id,
      machineNo: d.data().machineNo,
      machineName: d.data().machineName,
      dayCompletedCount: d.data().dayCompletedCount,
      date: d.data().date,
    }));
    return NextResponse.json({ date, count: snap.size, docs });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
