// src/app/api/status-daily/route.ts
// 장비별 상태 누적 데이터 조회 API — Admin SDK 사용
import { NextResponse } from 'next/server';
import { getStatusDaily } from '@/lib/status-accumulation';
import { cached, dateTtlMs, cacheHeaders } from '@/lib/server-cache';

export const dynamic = 'force-dynamic';

// 날짜 단위로 캐시 — 공정흐름도(어제+오늘)·상세패널(하루)·분석(기간)이 같은 날짜 캐시를 나눠 쓴다
// ?fresh=1 이면 캐시를 건너뛴다 (분석 화면이 사내PC 동기화 완료 직후 다시 읽을 때)
function statusDailyCached(date: string, fresh: boolean) {
  return cached(`status-daily:${date}`, dateTtlMs(date), () => getStatusDaily(date), fresh);
}

function dateList(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  for (let i = 0; d <= last && i < 400; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const date = url.searchParams.get('date');
  const startDate = url.searchParams.get('start');
  const endDate = url.searchParams.get('end');
  const fresh = url.searchParams.get('fresh') === '1';

  try {
    if (date) {
      // 단일 날짜 조회
      const entries = await statusDailyCached(date, fresh);
      return NextResponse.json({ ok: true, date, count: entries.length, entries }, { headers: cacheHeaders(fresh) });
    } else if (startDate && endDate) {
      // 날짜 범위 조회
      const entries = (await Promise.all(dateList(startDate, endDate).map(d => statusDailyCached(d, fresh)))).flat();
      return NextResponse.json({ ok: true, startDate, endDate, count: entries.length, entries }, { headers: cacheHeaders(fresh) });
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
