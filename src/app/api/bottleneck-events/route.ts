// src/app/api/bottleneck-events/route.ts
// 병목 이력 조회 — 사내PC 스크립트가 발생·해제 때 쓰는 bottleneck_events (정지/병목 분석 화면용)
// GET /api/bottleneck-events?start=YYYY-MM-DD&end=YYYY-MM-DD → 그 기간(KST)에 발생한 이력
import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { cached, cacheHeaders } from '@/lib/server-cache';
import type { BottleneckEvent } from '@/lib/bottleneck-rules';

export const dynamic = 'force-dynamic';

const kstDayStart = (date: string) => new Date(`${date}T00:00:00+09:00`).getTime();

export async function GET(req: Request) {
  const url = new URL(req.url);
  const start = url.searchParams.get('start');
  const end = url.searchParams.get('end');
  const fresh = url.searchParams.get('fresh') === '1';
  if (!start || !end || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return NextResponse.json({ ok: false, error: 'start, end (YYYY-MM-DD) 필요' }, { status: 400 });
  }
  try {
    const from = kstDayStart(start);
    const to = kstDayStart(end) + 86400000;
    const events = await cached(`bottleneck-events:${start}:${end}`, 60 * 1000, async () => {
      const snap = await getAdminDb().collection('bottleneck_events')
        .where('detectedAt', '>=', from).where('detectedAt', '<', to).get();
      const list: BottleneckEvent[] = [];
      snap.forEach((d) => {
        const x = d.data();
        list.push({
          id: d.id, machineNo: Number(x.machineNo), machineName: String(x.machineName || ''),
          code: String(x.code || ''), name: String(x.name || ''),
          detectedAt: Number(x.detectedAt), since: typeof x.since === 'number' ? x.since : null,
          endedAt: typeof x.endedAt === 'number' ? x.endedAt : null,
          detail: String(x.detail || ''), lastDetail: String(x.lastDetail || x.detail || ''),
        });
      });
      return list.sort((a, b) => b.detectedAt - a.detectedAt);
    }, fresh);
    return NextResponse.json({ ok: true, events }, { headers: cacheHeaders(fresh) });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
