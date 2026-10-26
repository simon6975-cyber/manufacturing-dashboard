// src/app/api/dspm/log/route.ts
// DSPM 장비 상태 이력 로그 API 프록시
// GET /api/dspm/log?mcno=52           → 해당 장비의 전체 이력
// GET /api/dspm/log?mcno=52&date=2026-09-07 → 해당 날짜(KST)만 필터링
import { NextResponse } from 'next/server';
import { fetchDspmMachineLog, aggregateDspmLogByDate } from '@/lib/dspm-log';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mcnoStr = url.searchParams.get('mcno');
  if (!mcnoStr) {
    return NextResponse.json({ ok: false, error: 'mcno 파라미터 필수' }, { status: 400 });
  }
  const mcno = parseInt(mcnoStr, 10);
  if (isNaN(mcno)) {
    return NextResponse.json({ ok: false, error: 'mcno는 숫자여야 합니다' }, { status: 400 });
  }

  const date = url.searchParams.get('date'); // optional YYYY-MM-DD (KST)

  try {
    const entries = await fetchDspmMachineLog(mcno);

    if (date) {
      // 날짜 필터링 + 집계
      const summary = aggregateDspmLogByDate(entries, date, 0, '', mcno);
      return NextResponse.json({
        ok: true,
        mcno,
        date,
        totalEntries: entries.length,
        events: summary.events,
        states: summary.states,
      });
    }

    return NextResponse.json({ ok: true, mcno, count: entries.length, data: entries });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
