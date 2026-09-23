// src/lib/machine-sync.ts
// 사내 DSPM 실측 설비상태 API ↔ Firestore(machines/*) 동기화
// 서버(Route Handler)에서만 호출한다 — 브라우저에서 http:// API를 직접 fetch하면
// (대시보드는 https로 배포되므로) Mixed Content로 차단된다.

import { db } from './firebase';
import {
  collection, doc, getDoc, getDocs, setDoc, Timestamp,
} from 'firebase/firestore';
import { MachineStatus, MachineHistoryEntry } from './machine-service';
import { MachineDef } from './machine-defs';

export interface DspmMachineState {
  MCNO: number;
  MCNM: string;
  TM: string;    // ISO timestamp — 실측상 "상태가 마지막으로 바뀐 시각"에 가깝다(하트비트 아님, 며칠 전 값도 관측됨)
  STATE: string; // 'RUN' | 'IDLE' | 'S1'..'S9'
}

interface DspmApiResponse {
  code: number;
  data: DspmMachineState[];
}

const DEFAULT_API_URL = 'http://dspm.dsjs.co.kr:10920/api/getmachinestate';
export const DSPM_API_URL = process.env.DSPM_API_URL || DEFAULT_API_URL;

// 이 시간보다 TM이 오래됐으면 "정말 그 상태가 며칠째인지" vs "에이전트가 멈춰서 안 올라오는지"
// API만으로는 구분이 안 된다 — 값은 그대로 반영하되 결과에 표시만 해서 운영자가 눈으로 판단하게 한다.
export const STALE_WARN_MS = 24 * 60 * 60 * 1000; // 24시간

export async function fetchDspmMachineStates(): Promise<DspmMachineState[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(DSPM_API_URL, { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`DSPM API HTTP ${res.status}`);
    const json: DspmApiResponse = await res.json();
    if (!Array.isArray(json.data)) throw new Error('DSPM API 응답 형식 오류(data 배열 아님)');
    return json.data;
  } finally {
    clearTimeout(timeout);
  }
}

// 실측 STATE 문자열 → 앱 상태값(status, stopReason)
export function mapDspmState(state: string): { status: MachineStatus; stopReason: string } {
  if (state === 'RUN') return { status: 'RUN', stopReason: '' };
  if (state === 'IDLE') return { status: 'IDLE', stopReason: '' };
  if (/^S\d+$/.test(state)) return { status: 'STOP', stopReason: state };
  console.warn(`[machine-sync] 알 수 없는 STATE 값: "${state}" → IDLE로 처리`);
  return { status: 'IDLE', stopReason: '' };
}

function hhmmss(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

async function loadMachineDefsFromFirestore(): Promise<MachineDef[]> {
  const snap = await getDocs(collection(db, 'machine_definitions'));
  const list: MachineDef[] = [];
  snap.forEach((d) => {
    const data = d.data();
    list.push({
      no: parseInt(d.id, 10),
      name: data.name || `NO.${d.id}`,
      model: data.model || '',
      maker: data.maker || '',
      group: data.group || '',
      mcno: typeof data.mcno === 'number' ? data.mcno : undefined,
    });
  });
  return list;
}

export interface SyncResult {
  updated: { no: number; name: string; mcno: number; status: string; stopReason: string }[];
  unchanged: number[];
  stale: { no: number; mcno: number; ageHours: number }[];
  unmapped: DspmMachineState[]; // /settings/machines 에서 매핑되지 않은 실측 설비(참고용)
}

// 실측 API → Firestore(machines/{no}) 반영. mcno가 매핑된 공정만 대상이며,
// 상태(status+stopReason)가 실제로 바뀐 경우에만 이력을 남기고 기록한다(폴링마다 덮어쓰지 않음).
export async function syncMachinesFromDspm(): Promise<SyncResult> {
  const [realStates, defs] = await Promise.all([
    fetchDspmMachineStates(),
    loadMachineDefsFromFirestore(),
  ]);

  const byMcno = new Map<number, DspmMachineState>();
  realStates.forEach((s) => byMcno.set(s.MCNO, s));
  const mappedMcnos = new Set(defs.filter((d) => d.mcno != null).map((d) => d.mcno as number));

  const result: SyncResult = { updated: [], unchanged: [], stale: [], unmapped: [] };

  for (const def of defs) {
    if (def.mcno == null) continue; // 매핑 안 된 공정 — 수동 터미널 입력 그대로 사용
    const real = byMcno.get(def.mcno);
    if (!real) continue; // 이번 응답에 이 설비가 없음(보고 없음)

    const reportedAt = new Date(real.TM);
    const ageMs = Date.now() - reportedAt.getTime();
    if (ageMs > STALE_WARN_MS) {
      result.stale.push({ no: def.no, mcno: def.mcno, ageHours: Math.round(ageMs / 3600000) });
    }

    const { status, stopReason } = mapDspmState(real.STATE);
    const ref = doc(db, 'machines', String(def.no));
    const snap = await getDoc(ref);
    const prev = snap.exists() ? snap.data() : null;

    if (prev && prev.status === status && (prev.stopReason || '') === stopReason) {
      result.unchanged.push(def.no);
      continue;
    }

    const entry: MachineHistoryEntry = {
      status,
      stopCode: stopReason,
      time: hhmmss(reportedAt),
      timestamp: reportedAt.getTime(),
    };
    const prevHistory: MachineHistoryEntry[] = prev?.history || [];
    const newHistory = [entry, ...prevHistory].slice(0, 50);

    await setDoc(ref, {
      status,
      stopReason,
      statusChangedAt: Timestamp.fromDate(reportedAt),
      updatedAt: Timestamp.now(),
      history: newHistory,
      source: 'dspm-api',
      sourceMcno: def.mcno,
      sourceMcnm: real.MCNM,
    }, { merge: true });

    result.updated.push({ no: def.no, name: def.name, mcno: def.mcno, status, stopReason });
  }

  for (const real of realStates) {
    if (!mappedMcnos.has(real.MCNO)) result.unmapped.push(real);
  }

  return result;
}
