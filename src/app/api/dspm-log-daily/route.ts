// src/app/api/dspm-log-daily/route.ts
// 전체 장비의 DSPM 로그를 KST 날짜별로 집계하여 반환
// GET /api/dspm-log-daily?date=2026-09-07
// 응답 형식: status-daily API와 호환 (machineNo, states, events)
import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { fetchDspmMachineLog, aggregateDspmLogByDate } from '@/lib/dspm-log';
import type { DspmDaySummary } from '@/lib/dspm-log';

export const dynamic = 'force-dynamic';
export const maxDuration = 55; // 여러 장비 순차 fetch — 넉넉하게

interface MachineDef {
  no: number;
  name: string;
  mcno?: number;
}

async function loadMachineDefsWithMcno(): Promise<MachineDef[]> {
  const db = getAdminDb();
  const snap = await db.collection('machine_definitions').get();
  const list: MachineDef[] = [];
  snap.forEach((d) => {
    const data = d.data();
    const mcno = typeof data.mcno === 'number' ? data.mcno : undefined;
    if (mcno != null) {
      list.push({
        no: parseInt(d.id, 10),
        name: data.name || `NO.${d.id}`,
        mcno,
      });
    }
  });
  return list;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const date = url.searchParams.get('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ ok: false, error: 'date 파라미터 필수 (YYYY-MM-DD)' }, { status: 400 });
  }

  // 선택적: 특정 장비만 조회
  const machineNoParam = url.searchParams.get('machineNo');

  try {
    const defs = await loadMachineDefsWithMcno();
    const targetDefs = machineNoParam
      ? defs.filter(d => d.no === parseInt(machineNoParam, 10))
      : defs;

    if (targetDefs.length === 0) {
      return NextResponse.json({ ok: true, date, count: 0, entries: [] });
    }

    // 전체 장비를 병렬로 DSPM 로그 가져오기 (10개씩 배치, 개별 타임아웃 8초)
    const results: DspmDaySummary[] = [];
    const errors: string[] = [];
    const batchSize = 10;
    for (let i = 0; i < targetDefs.length; i += batchSize) {
      const batch = targetDefs.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map(async (def) => {
          try {
            const entries = await fetchDspmMachineLog(def.mcno!, 8000);
            return aggregateDspmLogByDate(entries, date, def.no, def.name, def.mcno!);
          } catch (err) {
            const msg = `MCNO ${def.mcno} (NO.${def.no}): ${err instanceof Error ? err.message : String(err)}`;
            console.error(`[dspm-log-daily] ${msg}`);
            errors.push(msg);
            return null;
          }
        })
      );
      for (const r of batchResults) {
        if (r.status === 'fulfilled' && r.value) {
          results.push(r.value);
        }
      }
    }

    // status-daily API 호환 형식으로 변환
    const entries = results
      .filter(r => r.events.length > 0)
      .map(r => ({
        machineNo: r.machineNo,
        machineName: r.machineName,
        mcno: r.mcno,
        states: r.states,
        events: r.events,
      }));

    return NextResponse.json({
      ok: true,
      date,
      source: 'dspm-log',
      count: entries.length,
      entries,
    });
  } catch (err) {
    console.error('[dspm-log-daily]', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
