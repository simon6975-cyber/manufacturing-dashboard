// src/lib/machine-service.ts
import { db } from './firebase';
import {
  doc, setDoc, onSnapshot, collection, Timestamp,
} from 'firebase/firestore';

export type MachineStatus = 'RUN' | 'IDLE' | 'STOP' | 'SETUP';

export interface MachineState {
  status: MachineStatus;
  stopReason: string;
  statusChangedAt: Date;
}

// 터미널에서 상태 변경 시 Firebase 저장
export async function updateMachineStatus(
  no: number,
  status: MachineStatus,
  stopReason: string = ''
): Promise<void> {
  await setDoc(doc(db, 'machines', String(no)), {
    status,
    stopReason,
    statusChangedAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  }, { merge: true });
}

// 전체 장비 실시간 구독 (공정흐름도용)
export function subscribeMachines(
  callback: (machines: Record<number, MachineState>) => void
): () => void {
  return onSnapshot(collection(db, 'machines'), (snapshot) => {
    const machines: Record<number, MachineState> = {};
    snapshot.forEach((d) => {
      const data = d.data();
      machines[parseInt(d.id)] = {
        status: data.status || 'IDLE',
        stopReason: data.stopReason || '',
        statusChangedAt: data.statusChangedAt?.toDate() || new Date(),
      };
    });
    callback(machines);
  });
}

// 단일 장비 실시간 구독 (터미널용)
export function subscribeMachine(
  no: number,
  callback: (state: MachineState | null) => void
): () => void {
  return onSnapshot(doc(db, 'machines', String(no)), (d) => {
    if (d.exists()) {
      const data = d.data();
      callback({
        status: data.status || 'IDLE',
        stopReason: data.stopReason || '',
        statusChangedAt: data.statusChangedAt?.toDate() || new Date(),
      });
    } else {
      callback(null);
    }
  });
}
