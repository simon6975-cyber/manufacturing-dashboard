// src/app/api/production-daily/route.ts
// 기간별 생산현황 데이터 조회 API — Admin SDK 사용 (보안 규칙 우회)
import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

// 순수 문자열 기반 날짜 범위 생성
function getDateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  let [y, m, d] = start.split('-').map(Number);
  const toStr = (yy: number, mm: number, dd: number) =>
    `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  const daysInMonth = (yy: number, mm: number) => new Date(yy, mm, 0).getDate();

  let cur = toStr(y, m, d);
  while (cur <= end) {
    dates.push(cur);
    d++;
    if (d > daysInMonth(y, m)) { d = 1; m++; if (m > 12) { m = 1; y++; } }
    cur = toStr(y, m, d);
  }
  return dates;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const startDate = url.searchParams.get('start');
  const endDate = url.searchParams.get('end');

  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'start, end 파라미터 필요' }, { status: 400 });
  }

  try {
    const adminDb = getAdminDb();
    const dates = getDateRange(startDate, endDate);

    const allEntries: Array<{
      machineNo: number;
      machineName: string;
      equipmentGroup: string;
      group: string;
      dayCompletedCount: number;
      date: string;
    }> = [];

    // 날짜별 병렬 조회
    const results = await Promise.all(
      dates.map(async (date) => {
        const snap = await adminDb.collection(`production_daily/${date}/machines`).get();
        const entries: typeof allEntries = [];
        snap.forEach((doc) => {
          const data = doc.data();
          entries.push({
            machineNo: data.machineNo ?? parseInt(doc.id, 10),
            machineName: data.machineName ?? '',
            equipmentGroup: data.equipmentGroup ?? '',
            group: data.group ?? '',
            dayCompletedCount: typeof data.dayCompletedCount === 'number' ? data.dayCompletedCount : 0,
            date: data.date ?? date,
          });
        });
        return entries;
      })
    );

    results.forEach((entries) => allEntries.push(...entries));

    return NextResponse.json({ ok: true, count: allEntries.length, entries: allEntries });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('production-daily API error:', errMsg);
    return NextResponse.json({ ok: false, error: errMsg }, { status: 500 });
  }
}
