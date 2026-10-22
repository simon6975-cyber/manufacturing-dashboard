// src/app/api/status-daily/route.ts
// 장비별 상태 누적 데이터 조회 API — Admin SDK 사용
import { NextResponse } from 'next/server';
import { getStatusDaily, getStatusDailyRange } from '@/lib/status-accumulation';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const date = url.searchParams.get('date');
  const startDate = url.searchParams.get('start');
  const endDate = url.searchParams.get('end');

  try {
    if (date) {
      // 단일 날짜 조회
      const entries = await getStatusDaily(date);
      return NextResponse.json({ ok: true, date, count: entries.length, entries });
    } else if (startDate && endDate) {
      // 날짜 범위 조회
      const entries = await getStatusDailyRange(startDate, endDate);
      return NextResponse.json({ ok: true, startDate, endDate, count: entries.length, entries });
    } else {
      return NextResponse.json(
        { error: 'date 또는 start+end 파라미터 필요' },
        { status: 400 }
      );
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('status-daily API error:', errMsg);
    return NextResponse.json({ ok: false, error: errMsg }, { status: 500 });
  }
}
