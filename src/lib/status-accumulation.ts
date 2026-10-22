// src/lib/status-accumulation.ts
// 장비별 상태(RUN/IDLE/S1-S9) 소요시간·횟수 일별 누적 관리
// Firestore 구조: machine_status_daily/{YYYY-MM-DD}/machines/{no}

import { getAdminDb } from './firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

/* ── Firestore 문서 구조 ── */
export interface StateAccum {
  totalSeconds: number;
  count: number;
}

export interface StatusEvent {
  state: string;       // 'RUN' | 'IDLE' | 'S1'-'S9'
  startTime: string;   // HH:MM:SS
  startTimestamp: number; // Unix ms
  endTime: string;     // HH:MM:SS
  endTimestamp: number; // Unix ms
  durationSeconds: number;
}

export interface MachineStatusDaily {
  machineNo: number;
  machineName: string;
  date: string;        // YYYY-MM-DD
  states: Record<string, StateAccum>; // 키: RUN, IDLE, S1..S9
  events: StatusEvent[];              // 당일 이벤트 로그 (최대 200)
  updatedAt: Date;
}

/* ── KST 기준 오늘 날짜 ── */
export function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function hhmmss(ts: number): string {
  const d = new Date(ts);
  // KST 기준
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${String(kst.getUTCHours()).padStart(2, '0')}:${String(kst.getUTCMinutes()).padStart(2, '0')}:${String(kst.getUTCSeconds()).padStart(2, '0')}`;
}

/* ── DSPM 상태값 → 저장 키 ── */
// RUN → 'RUN', IDLE → 'IDLE', S1~S9 → 'S1'~'S9'
export function stateKey(status: string, stopReason: string): string {
  if (status === 'STOP' && stopReason) return stopReason; // S1~S9
  return status; // RUN, IDLE
}

/* ── 상태 변경 시 이전 상태 소요시간 누적 ── */
export async function accumulateStatusDuration(params: {
  machineNo: number;
  machineName: string;
  prevStatus: string;      // 이전 상태: 'RUN' | 'IDLE' | 'STOP'
  prevStopReason: string;  // 이전 정지 코드: '' | 'S1'-'S9'
  prevStartTimestamp: number; // 이전 상태 시작 시각 (Unix ms)
  changedTimestamp: number;   // 상태 변경 시각 (Unix ms)
}): Promise<void> {
  const { machineNo, machineName, prevStatus, prevStopReason, prevStartTimestamp, changedTimestamp } = params;

  if (!prevStartTimestamp || prevStartTimestamp <= 0) return;

  const durationMs = changedTimestamp - prevStartTimestamp;
  if (durationMs <= 0) return;

  // 24시간 이상이면 비정상 — 최대 24시간으로 클램프
  const durationSeconds = Math.min(Math.round(durationMs / 1000), 86400);

  const date = todayKST();
  const key = stateKey(prevStatus, prevStopReason);
  const adminDb = getAdminDb();
  const ref = adminDb.doc(`machine_status_daily/${date}/machines/${machineNo}`);

  const event: StatusEvent = {
    state: key,
    startTime: hhmmss(prevStartTimestamp),
    startTimestamp: prevStartTimestamp,
    endTime: hhmmss(changedTimestamp),
    endTimestamp: changedTimestamp,
    durationSeconds,
  };

  const snap = await ref.get();
  if (snap.exists) {
    const data = snap.data()!;
    const states = data.states || {};
    const prev: StateAccum = states[key] || { totalSeconds: 0, count: 0 };
    states[key] = {
      totalSeconds: prev.totalSeconds + durationSeconds,
      count: prev.count + 1,
    };

    // 이벤트 로그 — 최대 200건 유지
    const events: StatusEvent[] = data.events || [];
    events.push(event);
    if (events.length > 200) events.splice(0, events.length - 200);

    await ref.update({
      states,
      events,
      updatedAt: FieldValue.serverTimestamp(),
    });
  } else {
    // 문서 신규 생성
    await ref.set({
      machineNo,
      machineName,
      date,
      states: {
        [key]: { totalSeconds: durationSeconds, count: 1 },
      },
      events: [event],
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
}

/* ── 특정 날짜의 모든 장비 상태 누적 데이터 조회 ── */
export async function getStatusDaily(date: string): Promise<MachineStatusDaily[]> {
  const adminDb = getAdminDb();
  const snap = await adminDb.collection(`machine_status_daily/${date}/machines`).get();
  const results: MachineStatusDaily[] = [];
  snap.forEach((doc) => {
    const data = doc.data();
    results.push({
      machineNo: data.machineNo ?? parseInt(doc.id, 10),
      machineName: data.machineName ?? '',
      date: data.date ?? date,
      states: data.states ?? {},
      events: data.events ?? [],
      updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
    });
  });
  return results;
}

/* ── 날짜 범위의 모든 장비 상태 누적 데이터 조회 ── */
export async function getStatusDailyRange(startDate: string, endDate: string): Promise<MachineStatusDaily[]> {
  const dates: string[] = [];
  let [y, m, d] = startDate.split('-').map(Number);
  const toStr = (yy: number, mm: number, dd: number) =>
    `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  const daysInMonth = (yy: number, mm: number) => new Date(yy, mm, 0).getDate();

  let cur = toStr(y, m, d);
  while (cur <= endDate) {
    dates.push(cur);
    d++;
    if (d > daysInMonth(y, m)) { d = 1; m++; if (m > 12) { m = 1; y++; } }
    cur = toStr(y, m, d);
  }

  const results = await Promise.all(dates.map(getStatusDaily));
  return results.flat();
}
