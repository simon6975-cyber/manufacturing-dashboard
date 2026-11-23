// src/app/api/queue-limits/route.ts
// 장비군별 대기물량 최대치 조회·저장 — Admin SDK 사용 (Firestore 보안 규칙상 클라이언트가 settings/* 에 못 씀)
// GET  /api/queue-limits            → { ok, limits: { 장비군명: 숫자 } }
// POST /api/queue-limits { limits } → 통째로 교체 (0·빈 값은 빼고 저장)
import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { cached, invalidate } from '@/lib/server-cache';

export const dynamic = 'force-dynamic';

const DOC_PATH = 'settings/queue_limits';
const CACHE_KEY = 'queue-limits';

function clean(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = typeof v === 'number' ? v : Number(v);
    const key = k.replace(/\s+/g, '').slice(0, 40);
    if (key && Number.isFinite(n) && n > 0) out[key] = Math.round(n);
  }
  return out;
}

export async function GET(req: Request) {
  try {
    // 화면마다 5분 주기로 부르므로 서버에서 1분 캐시 (저장 직후 화면은 ?fresh=1 로 다시 읽음)
    const fresh = new URL(req.url).searchParams.get('fresh') === '1';
    const limits = await cached(CACHE_KEY, 60 * 1000, async () => {
      const snap = await getAdminDb().doc(DOC_PATH).get();
      return clean(snap.exists ? snap.data()?.limits : null);
    }, fresh);
    return NextResponse.json({ ok: true, limits });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const limits = clean(body?.limits);
    await getAdminDb().doc(DOC_PATH).set({ limits, updatedAt: new Date().toISOString() });
    invalidate(CACHE_KEY);
    return NextResponse.json({ ok: true, limits });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
