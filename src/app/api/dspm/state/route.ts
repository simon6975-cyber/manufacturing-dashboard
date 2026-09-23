// src/app/api/dspm/state/route.ts
// DSPM 실측 API의 읽기전용 프록시. 대시보드는 https(Vercel)인데 실측 API는 http라
// 브라우저에서 직접 fetch하면 Mixed Content로 막힌다 — 같은 오리진(https)인 이 라우트를
// 거치게 해서 /settings/machines 의 "실측 설비 미리보기"가 동작하게 한다. Firestore는 건드리지 않는다.
import { NextResponse } from 'next/server';
import { fetchDspmMachineStates } from '@/lib/machine-sync';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await fetchDspmMachineStates();
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
