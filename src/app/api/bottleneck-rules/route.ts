// src/app/api/bottleneck-rules/route.ts
// 병목 판정 규칙 조회·저장 — Admin SDK (Firestore 보안 규칙상 브라우저가 settings/* 에 못 씀)
// GET  /api/bottleneck-rules           → { ok, rules }
// POST /api/bottleneck-rules { rules } → 기본값 위에 정리해서 통째로 저장
import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { cached, invalidate } from '@/lib/server-cache';
import { normalizeBottleneckRules } from '@/lib/bottleneck-rules';

export const dynamic = 'force-dynamic';

const DOC_PATH = 'settings/bottleneck_rules';
const CACHE_KEY = 'bottleneck-rules';

export async function GET(req: Request) {
  try {
    const fresh = new URL(req.url).searchParams.get('fresh') === '1';
    const rules = await cached(CACHE_KEY, 60 * 1000, async () => {
      const snap = await getAdminDb().doc(DOC_PATH).get();
      return normalizeBottleneckRules(snap.exists ? snap.data()?.rules : null);
    }, fresh);
    return NextResponse.json({ ok: true, rules });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rules = normalizeBottleneckRules(body?.rules);
    await getAdminDb().doc(DOC_PATH).set({ rules, updatedAt: new Date().toISOString() });
    invalidate(CACHE_KEY);
    return NextResponse.json({ ok: true, rules });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
