// src/app/api/dspm/diag/route.ts
// DSPM 연결 진단 + MCNO 매핑 확인 API
// GET /api/dspm/diag → Firebase MCNO 매핑 목록 + DSPM 서버 연결 테스트
import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const DSPM_LOG_API_BASE = 'http://dspm.dsjs.co.kr:10920/api/getmachinelog';

interface MachineMapping {
  no: number;
  name: string;
  model: string;
  group: string;
  mcno: number | null;
}

export async function GET() {
  const diag: {
    timestamp: string;
    firebaseMappings: MachineMapping[];
    dspmTest: {
      url: string;
      status: string;
      responseTime?: number;
      error?: string;
      sampleDataCount?: number;
      sampleFirstEntry?: unknown;
    };
    summary: string;
  } = {
    timestamp: new Date().toISOString(),
    firebaseMappings: [],
    dspmTest: { url: '', status: 'pending' },
    summary: '',
  };

  // 1. Firebase machine_definitions 조회
  try {
    const db = getAdminDb();
    const snap = await db.collection('machine_definitions').get();
    snap.forEach(docSnap => {
      const data = docSnap.data();
      diag.firebaseMappings.push({
        no: parseInt(docSnap.id, 10),
        name: data.name || `장비 ${docSnap.id}`,
        model: data.model || '',
        group: data.group || '',
        mcno: typeof data.mcno === 'number' ? data.mcno : null,
      });
    });
    diag.firebaseMappings.sort((a, b) => a.no - b.no);
  } catch (err) {
    diag.summary += `Firebase 오류: ${err instanceof Error ? err.message : String(err)}. `;
  }

  // MCNO가 있는 첫 번째 장비로 DSPM 연결 테스트
  const testMachine = diag.firebaseMappings.find(m => m.mcno != null);
  const testMcno = testMachine?.mcno ?? 52; // 기본값 52

  // 2. DSPM 서버 연결 테스트
  const testUrl = `${DSPM_LOG_API_BASE}?mcno=${testMcno}`;
  diag.dspmTest.url = testUrl;

  const startTime = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(testUrl, {
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timeout);

    diag.dspmTest.responseTime = Date.now() - startTime;

    if (!res.ok) {
      diag.dspmTest.status = `HTTP ${res.status} ${res.statusText}`;
      const bodyText = await res.text().catch(() => '(읽기 실패)');
      diag.dspmTest.error = bodyText.slice(0, 500);
    } else {
      const json = await res.json();
      diag.dspmTest.status = 'OK';
      diag.dspmTest.sampleDataCount = Array.isArray(json.data) ? json.data.length : 0;
      if (Array.isArray(json.data) && json.data.length > 0) {
        diag.dspmTest.sampleFirstEntry = json.data[0];
      }
    }
  } catch (err) {
    diag.dspmTest.responseTime = Date.now() - startTime;
    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        diag.dspmTest.status = 'TIMEOUT (15초 초과)';
      } else {
        diag.dspmTest.status = 'FAILED';
        diag.dspmTest.error = `${err.name}: ${err.message}`;
      }
    } else {
      diag.dspmTest.status = 'FAILED';
      diag.dspmTest.error = String(err);
    }
  }

  // 3. 요약
  const mappedCount = diag.firebaseMappings.filter(m => m.mcno != null).length;
  const totalCount = diag.firebaseMappings.length;
  diag.summary = `Firebase 장비 ${totalCount}대 중 MCNO 매핑 ${mappedCount}대. ` +
    `DSPM 서버(mcno=${testMcno}): ${diag.dspmTest.status}` +
    (diag.dspmTest.responseTime ? ` (${diag.dspmTest.responseTime}ms)` : '') +
    (diag.dspmTest.sampleDataCount != null ? `, 로그 ${diag.dspmTest.sampleDataCount}건` : '');

  return NextResponse.json(diag);
}
