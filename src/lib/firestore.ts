// src/lib/firestore.ts
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  Process,
  StopCode,
  BottleneckCode,
  StopageRecord,
  DailyStatistics,
} from './types';

// ============ PROCESS FUNCTIONS ============

export const getProcesses = async (): Promise<Process[]> => {
  const processesRef = collection(db, 'processes');
  const q = query(processesRef, orderBy('no', 'asc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    timestamp: doc.data().timestamp?.toDate(),
  } as Process));
};

export const getProcessById = async (id: string): Promise<Process | null> => {
  const docRef = doc(db, 'processes', id);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) return null;
  return {
    id: snapshot.id,
    ...snapshot.data(),
    timestamp: snapshot.data().timestamp?.toDate(),
  } as Process;
};

export const addProcess = async (
  processData: Omit<Process, 'id' | 'timestamp'>
): Promise<string> => {
  const processesRef = collection(db, 'processes');
  const docRef = await addDoc(processesRef, {
    ...processData,
    timestamp: Timestamp.now(),
  });
  return docRef.id;
};

export const updateProcess = async (
  id: string,
  processData: Partial<Omit<Process, 'id' | 'timestamp'>>
): Promise<void> => {
  const docRef = doc(db, 'processes', id);
  await updateDoc(docRef, {
    ...processData,
    timestamp: Timestamp.now(),
  });
};

export const deleteProcess = async (id: string): Promise<void> => {
  const docRef = doc(db, 'processes', id);
  await deleteDoc(docRef);
};

// ============ STOP CODE FUNCTIONS ============

export const getStopCodes = async (): Promise<StopCode[]> => {
  const stopCodesRef = collection(db, 'stop_codes');
  const q = query(stopCodesRef, orderBy('code', 'asc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    timestamp: doc.data().timestamp?.toDate(),
  } as StopCode));
};

export const addStopCode = async (
  stopCodeData: Omit<StopCode, 'id' | 'timestamp'>
): Promise<string> => {
  const stopCodesRef = collection(db, 'stop_codes');
  const docRef = await addDoc(stopCodesRef, {
    ...stopCodeData,
    timestamp: Timestamp.now(),
  });
  return docRef.id;
};

export const updateStopCode = async (
  id: string,
  stopCodeData: Partial<Omit<StopCode, 'id' | 'timestamp'>>
): Promise<void> => {
  const docRef = doc(db, 'stop_codes', id);
  await updateDoc(docRef, {
    ...stopCodeData,
    timestamp: Timestamp.now(),
  });
};

export const deleteStopCode = async (id: string): Promise<void> => {
  const docRef = doc(db, 'stop_codes', id);
  await deleteDoc(docRef);
};

// ============ BOTTLENECK CODE FUNCTIONS ============

export const getBottleneckCodes = async (): Promise<BottleneckCode[]> => {
  const bnCodesRef = collection(db, 'bottleneck_codes');
  const q = query(bnCodesRef, orderBy('bn_code', 'asc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    timestamp: doc.data().timestamp?.toDate(),
  } as BottleneckCode));
};

export const getBottleneckCodesByProcess = async (
  processNo: number
): Promise<BottleneckCode[]> => {
  const bnCodesRef = collection(db, 'bottleneck_codes');
  const q = query(bnCodesRef, where('process_no', '==', processNo));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    timestamp: doc.data().timestamp?.toDate(),
  } as BottleneckCode));
};

export const addBottleneckCode = async (
  bnCodeData: Omit<BottleneckCode, 'id' | 'timestamp'>
): Promise<string> => {
  const bnCodesRef = collection(db, 'bottleneck_codes');
  const docRef = await addDoc(bnCodesRef, {
    ...bnCodeData,
    timestamp: Timestamp.now(),
  });
  return docRef.id;
};

export const updateBottleneckCode = async (
  id: string,
  bnCodeData: Partial<Omit<BottleneckCode, 'id' | 'timestamp'>>
): Promise<void> => {
  const docRef = doc(db, 'bottleneck_codes', id);
  await updateDoc(docRef, {
    ...bnCodeData,
    timestamp: Timestamp.now(),
  });
};

export const deleteBottleneckCode = async (id: string): Promise<void> => {
  const docRef = doc(db, 'bottleneck_codes', id);
  await deleteDoc(docRef);
};

// ============ STOPAGE RECORD FUNCTIONS ============

export const getStopageRecords = async (
  startDate?: Date,
  endDate?: Date
): Promise<StopageRecord[]> => {
  const stopageRef = collection(db, 'stopage_records');
  let q = query(stopageRef, orderBy('timestamp', 'desc'));

  if (startDate && endDate) {
    q = query(
      stopageRef,
      where('timestamp', '>=', startDate),
      where('timestamp', '<=', endDate),
      orderBy('timestamp', 'desc')
    );
  }

  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    timestamp: doc.data().timestamp?.toDate(),
  } as StopageRecord));
};

export const addStopageRecord = async (
  stopageData: Omit<StopageRecord, 'id' | 'timestamp'>
): Promise<string> => {
  const stopageRef = collection(db, 'stopage_records');
  const docRef = await addDoc(stopageRef, {
    ...stopageData,
    timestamp: Timestamp.now(),
  });
  return docRef.id;
};

// ============ STATISTICS FUNCTIONS ============

export const getDailyStatistics = async (date: string): Promise<DailyStatistics | null> => {
  const statsRef = collection(db, 'statistics');
  const q = query(statsRef, where('date', '==', date));
  const snapshot = await getDocs(q);

  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
  return {
    id: doc.id,
    ...doc.data(),
    timestamp: doc.data().timestamp?.toDate(),
  } as DailyStatistics;
};

export const updateDailyStatistics = async (
  date: string,
  statsData: Partial<Omit<DailyStatistics, 'id' | 'timestamp'>>
): Promise<void> => {
  const statsRef = collection(db, 'statistics');
  const q = query(statsRef, where('date', '==', date));
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    // 새로운 문서 생성
    await addDoc(statsRef, {
      date,
      ...statsData,
      timestamp: Timestamp.now(),
    });
  } else {
    // 기존 문서 업데이트
    const docRef = doc(db, 'statistics', snapshot.docs[0].id);
    await updateDoc(docRef, {
      ...statsData,
      timestamp: Timestamp.now(),
    });
  }
};

export const getStatisticsRange = async (
  startDate: string,
  endDate: string
): Promise<DailyStatistics[]> => {
  const statsRef = collection(db, 'statistics');
  const q = query(
    statsRef,
    where('date', '>=', startDate),
    where('date', '<=', endDate),
    orderBy('date', 'asc')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    timestamp: doc.data().timestamp?.toDate(),
  } as DailyStatistics));
};

// ============ UTILITY FUNCTIONS ============

export const calculateProcessEfficiency = async (
  processNo: number,
  startDate: Date,
  endDate: Date
): Promise<number> => {
  const stopageRef = collection(db, 'stopage_records');
  const q = query(
    stopageRef,
    where('process_no', '==', processNo),
    where('timestamp', '>=', startDate),
    where('timestamp', '<=', endDate)
  );

  const snapshot = await getDocs(q);
  const totalDowntime = snapshot.docs.reduce(
    (acc, doc) => acc + (doc.data().duration_minutes || 0),
    0
  );

  const totalMinutes = (endDate.getTime() - startDate.getTime()) / (1000 * 60);
  const efficiency = Math.max(0, 100 - (totalDowntime / totalMinutes) * 100);

  return Math.round(efficiency);
};
