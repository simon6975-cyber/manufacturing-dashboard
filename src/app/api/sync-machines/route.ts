// src/app/api/sync-machines/route.ts
// 실측 DSPM API를 읽어 Firestore(machines/*)에 반영한다.
// 트리거: ProcessFlowDiagram이 열려 있는 동안 클라이언트가 주기적으로 이 라우트를 호출한다
// (Vercel Hobby 플랜은 Cron이 1일 1회로 제한되어 있어 대시보드 상시 오픈을 트리거로 사용).
// 필요하면 SYNC_SECRET을 설정해 외부에서 직접 호출(?secret=... 또는 x-sync-secret 헤더)하는 것도 막을 수 있다.
import { NextResponse } from 'next/server';
import { syncMachinesFromDspm } from '@/lib/machine-sync';

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
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[sync-machines]', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
