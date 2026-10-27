// src/lib/dspm-log.ts
// DSPM 장비 상태 이력 로그 API 연동 유틸리티
// API: http://dspm.dsjs.co.kr:10920/api/getmachinelog?mcno={MCNO}
// 응답: { code: 200, data: DspmLogEntry[] }

export interface DspmLogEntry {
  MCNO: number;
  STARTTM: string;  // ISO timestamp UTC e.g. "2026-09-07T00:11:03.000Z"
  ENDTM: string;    // ISO timestamp UTC
  STATE: string;     // 'RUN' | 'IDLE' | 'S1'~'S9'
  RN: number;
}

interface DspmLogApiResponse {
  code: number;
  data: DspmLogEntry[];
}

const DSPM_LOG_API_BASE = 'http://dspm.dsjs.co.kr:10920/api/getmachinelog';

/**
 * DSPM 로그 API에서 장비의 상태 이력을 가져온다 (서버사이드 전용)
 */
export async function fetchDspmMachineLog(mcno: number, timeoutMs = 10000): Promise<DspmLogEntry[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `${DSPM_LOG_API_BASE}?mcno=${mcno}`;
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`DSPM Log API HTTP ${res.status}`);
    const json: DspmLogApiResponse = await res.json();
    if (!Array.isArray(json.data)) throw new Error('DSPM Log API 응답 형식 오류(data 배열 아님)');
    return json.data;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * UTC ISO 타임스탬프를 KST Date로 변환
 */
function toKSTDate(isoStr: string): Date {
  return new Date(new Date(isoStr).getTime() + 9 * 60 * 60 * 1000);
}

/**
 * KST 날짜 문자열(YYYY-MM-DD) 반환
 */
function kstDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * HH:MM:SS 형식 (KST)
 */
function kstTimeStr(isoStr: string): string {
  const kst = toKSTDate(isoStr);
  return `${String(kst.getHours()).padStart(2, '0')}:${String(kst.getMinutes()).padStart(2, '0')}:${String(kst.getSeconds()).padStart(2, '0')}`;
}

export interface DspmDayEvent {
  state: string;       // RUN, IDLE, S1~S9
  startTime: string;   // HH:MM:SS (KST)
  endTime: string;     // HH:MM:SS (KST)
  durationSeconds: number;
}

export interface DspmDaySummary {
  machineNo: number;
  machineName: string;
  mcno: number;
  date: string;          // YYYY-MM-DD (KST)
  events: DspmDayEvent[];
  states: Record<string, { totalSeconds: number; count: number }>;
}

/**
 * DSPM 로그 엔트리를 KST 날짜별로 분할하고 집계한다.
 * 하나의 엔트리가 자정(KST)을 걸치면 두 날짜로 나눈다.
 */
export function aggregateDspmLogByDate(
  entries: DspmLogEntry[],
  targetDate: string,   // YYYY-MM-DD (KST)
  machineNo: number,
  machineName: string,
  mcno: number,
): DspmDaySummary {
  // KST 기준 하루의 시작/끝 (UTC로 변환)
  const dayStartUTC = new Date(`${targetDate}T00:00:00+09:00`).getTime();
  const dayEndUTC = new Date(`${targetDate}T23:59:59.999+09:00`).getTime();

  const events: DspmDayEvent[] = [];
  const states: Record<string, { totalSeconds: number; count: number }> = {};

  for (const entry of entries) {
    const entryStart = new Date(entry.STARTTM).getTime();
    const entryEnd = new Date(entry.ENDTM).getTime();

    // 이 날짜와 겹치지 않으면 스킵
    if (entryEnd <= dayStartUTC || entryStart >= dayEndUTC + 1) continue;

    // 이 날짜와 겹치는 부분만 잘라냄
    const clampedStart = Math.max(entryStart, dayStartUTC);
    const clampedEnd = Math.min(entryEnd, dayEndUTC + 1);
    const durationSeconds = Math.round((clampedEnd - clampedStart) / 1000);

    if (durationSeconds <= 0) continue;

    // KST 시간 문자열
    const startKST = new Date(clampedStart + 9 * 60 * 60 * 1000);
    const endKST = new Date(clampedEnd + 9 * 60 * 60 * 1000);
    const startTimeStr = `${String(startKST.getUTCHours()).padStart(2, '0')}:${String(startKST.getUTCMinutes()).padStart(2, '0')}:${String(startKST.getUTCSeconds()).padStart(2, '0')}`;
    const endTimeStr = `${String(endKST.getUTCHours()).padStart(2, '0')}:${String(endKST.getUTCMinutes()).padStart(2, '0')}:${String(endKST.getUTCSeconds()).padStart(2, '0')}`;

    events.push({
      state: entry.STATE,
      startTime: startTimeStr,
      endTime: endTimeStr,
      durationSeconds,
    });

    // 상태별 집계
    if (!states[entry.STATE]) {
      states[entry.STATE] = { totalSeconds: 0, count: 0 };
    }
    states[entry.STATE].totalSeconds += durationSeconds;
    states[entry.STATE].count += 1;
  }

  // 인접한 같은 상태 이벤트 병합
  const mergedEvents: DspmDayEvent[] = [];
  for (const evt of events) {
    const last = mergedEvents[mergedEvents.length - 1];
    if (last && last.state === evt.state && last.endTime === evt.startTime) {
      last.endTime = evt.endTime;
      last.durationSeconds += evt.durationSeconds;
    } else {
      mergedEvents.push({ ...evt });
    }
  }

  return {
    machineNo,
    machineName,
    mcno,
    date: targetDate,
    events: mergedEvents,
    states,
  };
}

/**
 * 기간(dateFrom ~ dateTo) 집계 — 각 날짜별로 분할 후 전체 합산
 */
export interface DspmDateRangeResult {
  machineNo: number;
  machineName: string;
  mcno: number;
  dateFrom: string;
  dateTo: string;
  events: DspmDayEvent[];   // 전체 기간의 이벤트 (날짜+시간 포함)
  states: Record<string, { totalSeconds: number; count: number }>;
  dailySummary: { date: string; states: Record<string, { totalSeconds: number; count: number }> }[];
}

export function aggregateDspmLogByDateRange(
  entries: DspmLogEntry[],
  dateFrom: string,
  dateTo: string,
  machineNo: number,
  machineName: string,
  mcno: number,
): DspmDateRangeResult {
  // 날짜 목록 생성
  const dates: string[] = [];
  const startD = new Date(`${dateFrom}T00:00:00+09:00`);
  const endD = new Date(`${dateTo}T00:00:00+09:00`);
  for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${dd}`);
  }

  const allEvents: DspmDayEvent[] = [];
  const totalStates: Record<string, { totalSeconds: number; count: number }> = {};
  const dailySummary: { date: string; states: Record<string, { totalSeconds: number; count: number }> }[] = [];

  for (const dt of dates) {
    const day = aggregateDspmLogByDate(entries, dt, machineNo, machineName, mcno);

    // 이벤트에 날짜 정보 포함 (startTime을 "YYYY-MM-DD HH:MM:SS" 형태로)
    for (const evt of day.events) {
      allEvents.push({
        ...evt,
        startTime: `${dt} ${evt.startTime}`,
        endTime: `${dt} ${evt.endTime}`,
      });
    }

    // 상태 합산
    for (const [state, accum] of Object.entries(day.states)) {
      if (!totalStates[state]) {
        totalStates[state] = { totalSeconds: 0, count: 0 };
      }
      totalStates[state].totalSeconds += accum.totalSeconds;
      totalStates[state].count += accum.count;
    }

    // 일별 요약 (데이터 있는 날만)
    if (day.events.length > 0) {
      dailySummary.push({ date: dt, states: day.states });
    }
  }

  return {
    machineNo,
    machineName,
    mcno,
    dateFrom,
    dateTo,
    events: allEvents,
    states: totalStates,
    dailySummary,
  };
}
