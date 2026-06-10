// src/lib/codes-service.ts
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  query,
  orderBy,
  limit as fbLimit,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';

// ============================================
// \ud0c0\uc785 \uc815\uc758
// ============================================
export type Severity = '\ub192\uc74c' | '\ubcf4\ud1b5' | '\ub0ae\uc74c';

export interface StopCodeV2 {
  id: string;
  code: string;
  name: string;
  description: string;
  active: boolean;
}

export interface BottleneckCodeV2 {
  id: string;
  code: string;
  name: string;
  description: string;
  severity: Severity;
  active: boolean;
}

export interface CodeHistoryEntry {
  id: string;
  timestamp: Date;
  user: string;
  action: 'save' | 'restore' | 'init';
  summary: string;
}

// ============================================
// Firestore \uacbd\ub85c
// ============================================
const SETTINGS_COLLECTION = 'code_settings';
const STOP_CODES_DOC_ID = 'stop_codes';
const BN_CODES_DOC_ID = 'bottleneck_codes';
const HISTORY_COLLECTION = 'code_history';

// ============================================
// \uc815\uc9c0 \ucf54\ub4dc
// ============================================
export async function loadStopCodes(): Promise<StopCodeV2[] | null> {
  try {
    const docRef = doc(db, SETTINGS_COLLECTION, STOP_CODES_DOC_ID);
    const snapshot = await getDoc(docRef);
    if (!snapshot.exists()) return null;
    return (snapshot.data().codes || []) as StopCodeV2[];
  } catch (err) {
    console.error('loadStopCodes failed:', err);
    throw err;
  }
}

export async function saveStopCodes(codes: StopCodeV2[]): Promise<void> {
  const docRef = doc(db, SETTINGS_COLLECTION, STOP_CODES_DOC_ID);
  await setDoc(docRef, {
    codes,
    updated_at: Timestamp.now(),
  });
}

// ============================================
// \ubcd1\ubaa9 \ucf54\ub4dc
// ============================================
export async function loadBottleneckCodes(): Promise<BottleneckCodeV2[] | null> {
  try {
    const docRef = doc(db, SETTINGS_COLLECTION, BN_CODES_DOC_ID);
    const snapshot = await getDoc(docRef);
    if (!snapshot.exists()) return null;
    return (snapshot.data().codes || []) as BottleneckCodeV2[];
  } catch (err) {
    console.error('loadBottleneckCodes failed:', err);
    throw err;
  }
}

export async function saveBottleneckCodes(codes: BottleneckCodeV2[]): Promise<void> {
  const docRef = doc(db, SETTINGS_COLLECTION, BN_CODES_DOC_ID);
  await setDoc(docRef, {
    codes,
    updated_at: Timestamp.now(),
  });
}

// ============================================
// \ubcc0\uacbd \uc774\ub825
// ============================================
export async function addHistoryEntry(
  entry: Omit<CodeHistoryEntry, 'id' | 'timestamp'>
): Promise<void> {
  const historyRef = collection(db, HISTORY_COLLECTION);
  await addDoc(historyRef, {
    ...entry,
    timestamp: Timestamp.now(),
  });
}

export async function getHistory(maxItems: number = 50): Promise<CodeHistoryEntry[]> {
  const historyRef = collection(db, HISTORY_COLLECTION);
  const q = query(historyRef, orderBy('timestamp', 'desc'), fbLimit(maxItems));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    timestamp: d.data().timestamp?.toDate(),
  })) as CodeHistoryEntry[];
}
