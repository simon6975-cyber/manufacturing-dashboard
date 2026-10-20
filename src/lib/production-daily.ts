// src/lib/production-daily.ts
// 일일 생산량 누계 — Firestore(production_daily/{YYYY-MM-DD}/machines/{no})
'use client';

import { db } from './firebase';
import {
  collection, doc, getDoc, getDocs, setDoc, query, where, orderBy, onSnapshot, Timestamp,
} from 'firebase/firestore';

export interface DailyProductionEntry {
  machineNo: number;
  machineName: string;
  equipmentGroup: string;
  group: string;          // 내지/표지/제본/포장
  dayCompletedCount: number;
  date: string;           // YYYY-MM-DD
  updatedAt: Date;
}

// 오늘 날짜 문자열 (KST 기준)
export function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

// 날짜 문자열 생성 (KST 기준)
export function formatDateKST(d: Date): string {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

// 일일 생산량 저장 (dspm_live/snapshot에서 읽은 DAYCOMCNT를 기록)
export async function saveDailyProduction(
  machineNo: number,
  machineName: string,
  equipmentGroup: string,
  group: string,
  dayCompletedCount: number,
  date?: string,
): Promise<void> {
  const dateStr = date || todayKST();
  const ref = doc(db, 'production_daily', dateStr, 'machines', String(machineNo));
  await setDoc(ref, {
    machineNo,
    machineName,
    equipmentGroup,
    group,
    dayCompletedCount,
    date: dateStr,
    updatedAt: Timestamp.now(),
  }, { merge: true });
}

// 특정 날짜의 모든 장비 생산량 조회
export async function getDailyProduction(date: string): Promise<DailyProductionEntry[]> {
  const snap = await getDocs(collection(db, 'production_daily', date, 'machines'));
  const result: DailyProductionEntry[] = [];
  snap.forEach((d) => {
    const data = d.data();
    result.push({
      machineNo: data.machineNo ?? parseInt(d.id, 10),
      machineName: data.machineName ?? '',
      equipmentGroup: data.equipmentGroup ?? '',
      group: data.group ?? '',
      dayCompletedCount: typeof data.dayCompletedCount === 'number' ? data.dayCompletedCount : 0,
      date: data.date ?? date,
      updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
    });
  });
  return result;
}

// 날짜 범위의 모든 생산량 조회 (startDate ~ endDate, 포함)
export async function getDailyProductionRange(
  startDate: string,
  endDate: string,
): Promise<DailyProductionEntry[]> {
  const result: DailyProductionEntry[] = [];
  // 순수 문자열 기반 날짜 순회 (UTC 변환 없음)
  let [y, m, d] = startDate.split('-').map(Number);
  const toStr = (yy: number, mm: number, dd: number) =>
    `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  const daysInMonth = (yy: number, mm: number) => new Date(yy, mm, 0).getDate();

  let cur = toStr(y, m, d);
  while (cur <= endDate) {
    const entries = await getDailyProduction(cur);
    result.push(...entries);
    d++;
    if (d > daysInMonth(y, m)) { d = 1; m++; if (m > 12) { m = 1; y++; } }
    cur = toStr(y, m, d);
  }
  return result;
}

// 특정 날짜의 생산량 실시간 구독
export function subscribeDailyProduction(
  date: string,
  callback: (entries: DailyProductionEntry[]) => void,
): () => void {
  return onSnapshot(collection(db, 'production_daily', date, 'machines'), (snap) => {
    const result: DailyProductionEntry[] = [];
    snap.forEach((d) => {
      const data = d.data();
      result.push({
        machineNo: data.machineNo ?? parseInt(d.id, 10),
        machineName: data.machineName ?? '',
        equipmentGroup: data.equipmentGroup ?? '',
        group: data.group ?? '',
        dayCompletedCount: typeof data.dayCompletedCount === 'number' ? data.dayCompletedCount : 0,
        date: data.date ?? date,
        updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
      });
    });
    callback(result);
  });
}
