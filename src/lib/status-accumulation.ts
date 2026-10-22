// src/lib/status-accumulation.ts
// 장비별 상태(RUN/IDLE/S1-S9) 소요시간·횟수 일별 누적 관리
// Firestore 구조: machine_status_daily/{YYYY-MM-DD}/machines/{no}
//
// 핵심 메커니즘:
// 1) 대시보드 동기화 시 → 모든 장비(변경/미변경)의 시간 누적
// 2) 일일 Cron 시 → 대시보드 꺼져있어도 1일 1회 누적
// 3) 재접속 시 → lastAccumulatedAt ~ 현재까지의 비접속 기간 자동 보정
// 4) 다일 비접속 → KST 날짜 경계로 분할하여 각 날짜에 정확히 배분

import { getAdminDb } from './firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/* ── Firestore 문서 구조 ── */
export interface StateAccum {
  totalSeconds: number;
  count: number;
}

export interface StatusEvent {
  state: string;       // 'RUN' | 'IDLE' | 'S1'-'S9'
  startTime: string;   // HH:MM:SS (KST)
  startTimestamp: number; // Unix ms
  endTime: string;     // HH:MM:SS (KST)
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

/* ── KST 유틸리티 ── */
export function todayKST(): string {
  return dateStrKST(Date.now());
}

function dateStrKST(tsMs: number): string {
  const kst = new Date(tsMs + KST_OFFSET_MS);
  return kst.toISOString().slice(0, 10);
}

function hhmmssKST(tsMs: number): string {
  const kst = new Date(tsMs + KST_OFFSET_MS);
  return `${String(kst.getUTCHours()).padStart(2, '0')}:${String(kst.getUTCMinutes()).padStart(2, '0')}:${String(kst.getUTCSeconds()).padStart(2, '0')}`;
}

/** KST 기준 자정(UTC) 타임스탬프 — 해당 KST 날짜의 시작 시각 */
function kstMidnightMs(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  // KST 자정 = UTC 전날 15:00
  return Date.UTC(y, m - 1, d) - KST_OFFSET_MS;
}

/* ── DSPM 상태값 → 저장 키 ── */
export function stateKey(status: string, stopReason: string): string {
  if (status === 'STOP' && stopReason) return stopReason; // S1~S9
  return status; // RUN, IDLE
}

/* ── 시간 범위를 KST 날짜별로 분할 ── */
interface DateSegment {
  date: string;
  startMs: number;
  endMs: number;
  durationSeconds: number;
}

function splitByKSTDay(startMs: number, endMs: number): DateSegment[] {
  if (endMs <= startMs) return [];

  const segments: DateSegment[] = [];
  let cursor = startMs;

  while (cursor < endMs) {
    const curDate = dateStrKST(cursor);
    // 다음 KST 자정
    const nextDay = shiftDateStr(curDate, 1);
    const nextMidnightMs = kstMidnightMs(nextDay);
    const segEnd = Math.min(endMs, nextMidnightMs);
    const durSec = Math.round((segEnd - cursor) / 1000);

    if (durSec > 0) {
      segments.push({ date: curDate, startMs: cursor, endMs: segEnd, durationSeconds: durSec });
    }
    cursor = nextMidnightMs;
  }
  return segments;
}

function shiftDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/* ── 단일 날짜 문서에 소요시간 누적 (내부 공통) ── */
async function addDurationToDate(params: {
  date: string;
  machineNo: number;
  machineName: string;
  key: string;           // 'RUN' | 'IDLE' | 'S1'-'S9'
  durationSeconds: number;
  addCount: number;       // 상태 변경 시 1, 진행 중 누적 시 0
  event?: StatusEvent;    // 이벤트 로그 (옵션)
}): Promise<void> {
  const { date, machineNo, machineName, key, durationSeconds, addCount, event } = params;
  if (durationSeconds <= 0) return;

  const adminDb = getAdminDb();
  const ref = adminDb.doc(`machine_status_daily/${date}/machines/${machineNo}`);
  const snap = await ref.get();

  if (snap.exists) {
    const data = snap.data()!;
    const states = data.states || {};
    const prev: StateAccum = states[key] || { totalSeconds: 0, count: 0 };
    states[key] = {
      totalSeconds: prev.totalSeconds + durationSeconds,
      count: prev.count + addCount,
    };

    const updateData: Record<string, unknown> = {
      states,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (event) {
      const events: StatusEvent[] = data.events || [];
      events.push(event);
      if (events.length > 200) events.splice(0, events.length - 200);
      updateData.events = events;
    }

    await ref.update(updateData);
  } else {
    await ref.set({
      machineNo,
      machineName,
      date,
      states: { [key]: { totalSeconds: durationSeconds, count: addCount } },
      events: event ? [event] : [],
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
}

/* ──────────────────────────────────────────────────────────
   공개 API
   ────────────────────────────────────────────────────────── */

/**
 * 상태 변경 시 이전 상태 소요시간 누적.
 * 비접속 기간이 길어도 KST 날짜별로 분할하여 정확히 배분.
 */
export async function accumulateStatusDuration(params: {
  machineNo: number;
  machineName: string;
  prevStatus: string;
  prevStopReason: string;
  prevStartTimestamp: number;  // 이전 상태 시작 시각 (Unix ms)
  changedTimestamp: number;    // 상태 변경 시각 (Unix ms)
}): Promise<void> {
  const { machineNo, machineName, prevStatus, prevStopReason, prevStartTimestamp, changedTimestamp } = params;
  if (!prevStartTimestamp || prevStartTimestamp <= 0) return;
  if (changedTimestamp <= prevStartTimestamp) return;

  const key = stateKey(prevStatus, prevStopReason);

  // 최대 7일(604800초)로 클램프 — 그 이상은 비정상
  const clampedEnd = Math.min(changedTimestamp, prevStartTimestamp + 7 * 86400 * 1000);
  const segments = splitByKSTDay(prevStartTimestamp, clampedEnd);

  for (const seg of segments) {
    const event: StatusEvent = {
      state: key,
      startTime: hhmmssKST(seg.startMs),
      startTimestamp: seg.startMs,
      endTime: hhmmssKST(seg.endMs),
      endTimestamp: seg.endMs,
      durationSeconds: seg.durationSeconds,
    };
    await addDurationToDate({
      date: seg.date,
      machineNo, machineName, key,
      durationSeconds: seg.durationSeconds,
      addCount: 1, // 상태 변경 = 1회
      event,
    });
  }
}

/**
 * 진행 중인 상태의 시간 누적 (상태 변경 없을 때).
 * lastAccumulatedAt ~ now까지의 시간을 현재 상태에 더함.
 * 이벤트 로그도 남김 (같은 날짜에 이미 동일 상태 ongoing 이벤트가 있으면 병합).
 * count는 증가하지 않음(동일 상태 유지 중이므로).
 */
export async function accumulateOngoingStatus(params: {
  machineNo: number;
  machineName: string;
  currentStatus: string;
  currentStopReason: string;
  lastAccumulatedAt: number;  // 마지막 누적 시각 (Unix ms)
  nowTimestamp: number;        // 현재 시각 (Unix ms)
}): Promise<void> {
  const { machineNo, machineName, currentStatus, currentStopReason, lastAccumulatedAt, nowTimestamp } = params;
  if (!lastAccumulatedAt || lastAccumulatedAt <= 0) return;
  if (nowTimestamp <= lastAccumulatedAt) return;

  const key = stateKey(currentStatus, currentStopReason);

  // 최대 7일로 클램프
  const clampedEnd = Math.min(nowTimestamp, lastAccumulatedAt + 7 * 86400 * 1000);
  const segments = splitByKSTDay(lastAccumulatedAt, clampedEnd);

  for (const seg of segments) {
    // 진행 중 누적도 이벤트 로그를 남겨 이력 조회 가능하게 함
    // 같은 날짜의 마지막 이벤트가 동일 상태면 endTime/duration만 확장
    const adminDb = getAdminDb();
    const ref = adminDb.doc(`machine_status_daily/${seg.date}/machines/${machineNo}`);
    const snap = await ref.get();
    const existingEvents: StatusEvent[] = snap.exists ? (snap.data()!.events || []) : [];

    // 마지막 이벤트가 동일 상태이면 병합 (endTime 확장)
    const lastEvent = existingEvents.length > 0 ? existingEvents[existingEvents.length - 1] : null;
    if (lastEvent && lastEvent.state === key) {
      // 기존 이벤트의 endTime 확장
      lastEvent.endTime = hhmmssKST(seg.endMs);
      lastEvent.endTimestamp = seg.endMs;
      lastEvent.durationSeconds = Math.round((seg.endMs - lastEvent.startTimestamp) / 1000);

      // events 배열만 업데이트 (states 누적은 아래에서)
      const states = snap.exists ? (snap.data()!.states || {}) : {};
      const prev: StateAccum = states[key] || { totalSeconds: 0, count: 0 };
      states[key] = {
        totalSeconds: prev.totalSeconds + seg.durationSeconds,
        count: prev.count, // 횟수 증가 없음
      };

      if (snap.exists) {
        await ref.update({
          states,
          events: existingEvents,
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        await ref.set({
          machineNo, machineName, date: seg.date,
          states, events: existingEvents,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    } else {
      // 새 이벤트 추가
      const event: StatusEvent = {
        state: key,
        startTime: hhmmssKST(seg.startMs),
        startTimestamp: seg.startMs,
        endTime: hhmmssKST(seg.endMs),
        endTimestamp: seg.endMs,
        durationSeconds: seg.durationSeconds,
      };
      await addDurationToDate({
        date: seg.date,
        machineNo, machineName, key,
        durationSeconds: seg.durationSeconds,
        addCount: 0,
        event,
      });
    }
  }
}

/**
 * machines/{no} 문서에 lastAccumulatedAt 업데이트 (Admin SDK).
 */
export async function updateLastAccumulatedAt(machineNo: number, timestamp: number): Promise<void> {
  const adminDb = getAdminDb();
  await adminDb.doc(`machines/${machineNo}`).set(
    { lastAccumulatedAt: timestamp },
    { merge: true }
  );
}

/* ── 조회 API ── */

export async function getStatusDaily(date: string): Promise<MachineStatusDaily[]> {
  const adminDb = getAdminDb();
  const snap = await adminDb.collection(`machine_status_daily/${date}/machines`).get();
  const results: MachineStatusDaily[] = [];
  snap.forEach((docSnap) => {
    const data = docSnap.data();
    results.push({
      machineNo: data.machineNo ?? parseInt(docSnap.id, 10),
      machineName: data.machineName ?? '',
      date: data.date ?? date,
      states: data.states ?? {},
      events: data.events ?? [],
      updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
    });
  });
  return results;
}

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
