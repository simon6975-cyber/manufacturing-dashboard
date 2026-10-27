// src/app/api/dspm/log/route.ts
// DSPM 장비 상태 이력 로그 API 프록시
// GET /api/dspm/log?mcno=52                              → 전체 이력 (raw)
// GET /api/dspm/log?mcno=52&date=2026-09-07              → 단일 날짜(KST) 집계
// GET /api/dspm/log?mcno=52&dateFrom=2026-09-01&dateTo=2026-09-07 → 기간(KST) 집계
import { NextResponse } from 'next/server';
import { fetchDspmMachineLog, aggregateDspmLogByDate, aggregateDspmLogByDateRange } from '@/lib/dspm-log';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

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

  const date = url.searchParams.get('date');         // 단일 날짜 YYYY-MM-DD (KST)
  const dateFrom = url.searchParams.get('dateFrom'); // 기간 시작 YYYY-MM-DD (KST)
  const dateTo = url.searchParams.get('dateTo');     // 기간 종료 YYYY-MM-DD (KST)

  try {
    const entries = await fetchDspmMachineLog(mcno, 15000);

    // 기간 조회
    if (dateFrom && dateTo) {
      const result = aggregateDspmLogByDateRange(entries, dateFrom, dateTo, 0, '', mcno);
      return NextResponse.json({
        ok: true,
        mcno,
        dateFrom,
        dateTo,
        totalRawEntries: entries.length,
        events: result.events,
        states: result.states,
        dailySummary: result.dailySummary,
      });
    }

    // 단일 날짜 조회
    if (date) {
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

    // 전체 raw 데이터
    return NextResponse.json({ ok: true, mcno, count: entries.length, data: entries });
  } catch (err) {
    console.error(`[dspm/log] mcno=${mcno}:`, err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
