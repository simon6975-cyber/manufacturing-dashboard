// src/app/api/dspm/sync-request/route.ts
// DSPM 이력 데이터 동기화 요청 관리 API
// POST /api/dspm/sync-request  → 새 동기화 요청 생성
// GET  /api/dspm/sync-request?id=xxx → 요청 상태 조회
import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export interface SyncRequestMachine {
  no: number;
  mcno: number;
  name: string;
}

export interface SyncRequest {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'error' | 'timeout';
  dateFrom: string;           // YYYY-MM-DD
  dateTo: string;             // YYYY-MM-DD
  machines: SyncRequestMachine[];
  requestedAt: string;        // ISO timestamp
  startedAt: string | null;
  completedAt: string | null;
  progress: {
    total: number;
    done: number;
    currentMachine: string;
  } | null;
  error: string | null;
}

// POST — 새 동기화 요청 생성
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { dateFrom, dateTo, machines } = body as {
      dateFrom: string;
      dateTo: string;
      machines: SyncRequestMachine[];
    };

    if (!dateFrom || !dateTo || !machines || machines.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'dateFrom, dateTo, machines[] 필수' },
        { status: 400 }
      );
    }

    // MCNO가 없는 수동 장비는 제외
    const dspmMachines = machines.filter(m => m.mcno > 0);
    if (dspmMachines.length === 0) {
      return NextResponse.json(
        { ok: false, error: '조회 가능한 DSPM 연결 장비가 없습니다 (모두 수동 장비)' },
        { status: 400 }
      );
    }

    const db = getAdminDb();
    const docRef = db.collection('dspm_sync_requests').doc();

    const requestData = {
      status: 'pending',
      dateFrom,
      dateTo,
      machines: dspmMachines,
      requestedAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      progress: null,
      error: null,
    };

    await docRef.set(requestData);

    return NextResponse.json({
      ok: true,
      requestId: docRef.id,
      ...requestData,
    });
  } catch (err) {
    console.error('[sync-request] POST error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

// GET — 요청 상태 조회
export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');

  if (!id) {
    return NextResponse.json(
      { ok: false, error: 'id 파라미터 필수' },
      { status: 400 }
    );
  }

  try {
    const db = getAdminDb();
    const snap = await db.collection('dspm_sync_requests').doc(id).get();

    if (!snap.exists) {
      return NextResponse.json(
        { ok: false, error: '요청을 찾을 수 없습니다' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      id: snap.id,
      ...snap.data(),
    });
  } catch (err) {
    console.error('[sync-request] GET error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
