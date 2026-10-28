#!/usr/bin/env node
// scripts/dspm-log-sync.js
// ─────────────────────────────────────────────────────────────────
// 사내PC 전용 — DSPM getmachinelog API로 이력을 가져와 machine_status_daily 에 저장
//   1) 요청 처리: Firebase dspm_sync_requests 큐(정지/병목 분석 온디맨드 조회)를 감시
//   2) 자동 동기화: AUTO_SYNC_MIN 분마다 MCNO 매핑된 전 장비의 오늘 이력을 저장
//      (공정흐름도 상세패널 '상태 변경 이력'이 이 데이터를 읽는다 — Vercel은 사내망 DSPM에 못 닿음)
//
// 실행방법:
//   1) serviceAccountKey.json 을 이 스크립트와 같은 폴더에 위치
//   2) node dspm-log-sync.js
//
// 환경변수 (옵션):
//   FIREBASE_SA_PATH  — 서비스 계정 키 파일 경로 (기본: ./serviceAccountKey.json)
//   DSPM_BASE_URL     — DSPM API 기본 URL (기본: http://dspm.dsjs.co.kr:10920)
//   POLL_INTERVAL_MS  — 폴링 간격 ms (기본: 5000)
//   AUTO_SYNC_MIN     — 자동 동기화 주기 분 (기본: 10, 0이면 끔)
// ─────────────────────────────────────────────────────────────────

// 모듈형 API — firebase-admin v13·v14 모두 동작 (v14는 admin.credential 등 네임스페이스 API 제거)
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const path = require('path');
const http = require('http');

/* ── 설정 ── */
const SA_PATH = process.env.FIREBASE_SA_PATH || path.join(__dirname, 'serviceAccountKey.json');
const DSPM_BASE = (process.env.DSPM_BASE_URL || 'http://dspm.dsjs.co.kr:10920').replace(/\/$/, '');
const POLL_MS = parseInt(process.env.POLL_INTERVAL_MS || '5000', 10);
const AUTO_SYNC_MIN = parseInt(process.env.AUTO_SYNC_MIN || '10', 10);
const MAX_EVENTS = 200;

// machine_definitions 컬렉션이 비어 있을 때만 쓰는 기본 매핑 (src/lib/machine-defs.ts DEFAULT_MACHINES 와 동일)
const DEFAULT_MCNO_MACHINES = [
  { no: 1, name: '520HD+ 2호기', mcno: 52 }, { no: 2, name: '520HD+ 3호기', mcno: 60 },
  { no: 3, name: 'C2028', mcno: 49 }, { no: 4, name: 'C2328', mcno: 50 },
  { no: 5, name: 'PC1120', mcno: 48 }, { no: 6, name: 'PC2120', mcno: 70 },
  { no: 7, name: 'EUROLAM 540', mcno: 62 }, { no: 8, name: 'PROTOPIC 540', mcno: 61 },
  { no: 9, name: 'DDC 810 1호기', mcno: 73 }, { no: 10, name: 'DDC810 PRO 2호기', mcno: 74 },
  { no: 13, name: 'BQ470 1호기', mcno: 30 }, { no: 14, name: 'BQ470 2호기', mcno: 43 },
  { no: 15, name: 'BQ500 3호기', mcno: 54 }, { no: 16, name: 'SPF-200A', mcno: 29 },
];

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/* ── Firebase 초기화 ── */
let serviceAccount;
try {
  serviceAccount = require(SA_PATH);
} catch (e) {
  console.error(`❌ 서비스 계정 키 파일을 찾을 수 없습니다: ${SA_PATH}`);
  console.error('   serviceAccountKey.json 파일을 scripts/ 폴더에 넣어주세요.');
  process.exit(1);
}

initializeApp({
  credential: cert(serviceAccount),
});
const db = getFirestore();

/* ── 유틸리티 ── */
function log(msg) {
  const now = new Date();
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const ts = kst.toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[${ts} KST] ${msg}`);
}

function dateStrKST(tsMs) {
  const kst = new Date(tsMs + KST_OFFSET_MS);
  return kst.toISOString().slice(0, 10);
}

function hhmmssKST(tsMs) {
  const kst = new Date(tsMs + KST_OFFSET_MS);
  return `${String(kst.getUTCHours()).padStart(2, '0')}:${String(kst.getUTCMinutes()).padStart(2, '0')}:${String(kst.getUTCSeconds()).padStart(2, '0')}`;
}

/** 날짜 범위 생성 (YYYY-MM-DD 배열) */
function dateRange(from, to) {
  const dates = [];
  const start = new Date(`${from}T00:00:00+09:00`);
  const end = new Date(`${to}T00:00:00+09:00`);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${dd}`);
  }
  return dates;
}

/* ── DSPM API 호출 ── */
function fetchDspmLog(mcno, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const url = `${DSPM_BASE}/api/getmachinelog?mcno=${mcno}`;
    const timer = setTimeout(() => { req.destroy(); reject(new Error('timeout')); }, timeoutMs);

    const req = http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        clearTimeout(timer);
        try {
          const json = JSON.parse(data);
          if (!Array.isArray(json.data)) {
            reject(new Error('응답 형식 오류'));
            return;
          }
          resolve(json.data);
        } catch (e) {
          reject(new Error(`JSON 파싱 실패: ${e.message}`));
        }
      });
    });

    req.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

/* ── 로그 엔트리 → 날짜별 집계 ── */
function aggregateByDate(entries, targetDate, machineNo, machineName, mcno) {
  const dayStartUTC = new Date(`${targetDate}T00:00:00+09:00`).getTime();
  const dayEndUTC = new Date(`${targetDate}T23:59:59.999+09:00`).getTime();

  const events = [];
  const states = {};

  const nowMs = Date.now();
  for (const entry of entries) {
    const entryStart = new Date(entry.STARTTM).getTime();
    // 진행 중인 상태는 ENDTM이 비어 있을 수 있다 → 현재 시각까지로 본다
    const parsedEnd = entry.ENDTM ? new Date(entry.ENDTM).getTime() : NaN;
    const entryEnd = Number.isFinite(parsedEnd) ? parsedEnd : nowMs;
    if (!Number.isFinite(entryStart)) continue;

    if (entryEnd <= dayStartUTC || entryStart >= dayEndUTC + 1) continue;

    const clampedStart = Math.max(entryStart, dayStartUTC);
    const clampedEnd = Math.min(entryEnd, dayEndUTC + 1);
    const durationSeconds = Math.round((clampedEnd - clampedStart) / 1000);
    if (durationSeconds <= 0) continue;

    const startKST = new Date(clampedStart + KST_OFFSET_MS);
    const endKST = new Date(clampedEnd + KST_OFFSET_MS);
    const startTimeStr = `${String(startKST.getUTCHours()).padStart(2, '0')}:${String(startKST.getUTCMinutes()).padStart(2, '0')}:${String(startKST.getUTCSeconds()).padStart(2, '0')}`;
    const endTimeStr = `${String(endKST.getUTCHours()).padStart(2, '0')}:${String(endKST.getUTCMinutes()).padStart(2, '0')}:${String(endKST.getUTCSeconds()).padStart(2, '0')}`;

    events.push({
      state: entry.STATE,
      startTime: startTimeStr,
      startTimestamp: clampedStart, // 상세패널 최신순 정렬 기준
      endTime: endTimeStr,
      endTimestamp: clampedEnd,
      durationSeconds,
    });

    if (!states[entry.STATE]) states[entry.STATE] = { totalSeconds: 0, count: 0 };
    states[entry.STATE].totalSeconds += durationSeconds;
    states[entry.STATE].count += 1;
  }

  // 인접 같은 상태 병합 (DSPM 응답 순서와 무관하게 시간순으로)
  events.sort((a, b) => a.startTimestamp - b.startTimestamp);
  const merged = [];
  for (const evt of events) {
    const last = merged[merged.length - 1];
    if (last && last.state === evt.state && last.endTime === evt.startTime) {
      last.endTime = evt.endTime;
      last.endTimestamp = evt.endTimestamp;
      last.durationSeconds += evt.durationSeconds;
    } else {
      merged.push({ ...evt });
    }
  }

  return {
    machineNo,
    machineName,
    date: targetDate,
    states,
    events: merged.slice(-MAX_EVENTS), // 최근 200개 (상세패널은 최신순으로 보여준다)
    updatedAt: FieldValue.serverTimestamp(),
  };
}

/* ── Firebase에 일별 데이터 저장 ── */
// merge 없이 통째로 교체 — DSPM 로그가 원본이라, 이전 저장분의 상태 키가 남아 합계가 틀어지지 않게 한다
async function saveDailySummary(summary) {
  const docPath = `machine_status_daily/${summary.date}/machines/${summary.machineNo}`;
  await db.doc(docPath).set(summary);
}

/* ── 동기화 요청 처리 ── */
async function processRequest(requestId, requestData) {
  const { dateFrom, dateTo, machines } = requestData;
  const dates = dateRange(dateFrom, dateTo);
  const totalWork = machines.length;
  let doneCount = 0;

  log(`📋 요청 처리 시작: ${requestId}`);
  log(`   기간: ${dateFrom} ~ ${dateTo} (${dates.length}일)`);
  log(`   장비: ${machines.length}대 — ${machines.map(m => `${m.name}(MCNO:${m.mcno})`).join(', ')}`);

  // 상태 → processing
  await db.collection('dspm_sync_requests').doc(requestId).update({
    status: 'processing',
    startedAt: new Date().toISOString(),
    progress: { total: totalWork, done: 0, currentMachine: machines[0]?.name || '' },
  });

  for (const machine of machines) {
    const { no, mcno, name } = machine;
    log(`  🔧 [${doneCount + 1}/${totalWork}] ${name} (MCNO:${mcno}) 데이터 가져오는 중...`);

    // 진행률 업데이트
    await db.collection('dspm_sync_requests').doc(requestId).update({
      progress: { total: totalWork, done: doneCount, currentMachine: name },
    });

    try {
      const entries = await fetchDspmLog(mcno);
      log(`    ↳ ${entries.length}개 로그 엔트리 수신`);

      let savedDays = 0;
      for (const dt of dates) {
        const summary = aggregateByDate(entries, dt, no, name, mcno);
        // 이벤트나 상태가 있는 날만 저장
        if (summary.events.length > 0 || Object.keys(summary.states).length > 0) {
          await saveDailySummary(summary);
          savedDays++;
        }
      }
      log(`    ✅ ${savedDays}일 데이터 저장 완료`);
    } catch (err) {
      log(`    ❌ 오류: ${err.message}`);
      // 개별 장비 오류는 계속 진행 (전체 실패가 아님)
    }

    doneCount++;
    // 진행률 업데이트
    await db.collection('dspm_sync_requests').doc(requestId).update({
      progress: { total: totalWork, done: doneCount, currentMachine: doneCount < totalWork ? machines[doneCount].name : '완료' },
    });
  }

  // 상태 → completed
  await db.collection('dspm_sync_requests').doc(requestId).update({
    status: 'completed',
    completedAt: new Date().toISOString(),
    progress: { total: totalWork, done: totalWork, currentMachine: '완료' },
  });

  log(`✅ 요청 완료: ${requestId} — ${totalWork}대 장비, ${dates.length}일`);
}

/* ── 자동 동기화 ── */
// MCNO 매핑된 장비 목록: 대시보드 장비관리(machine_definitions) 기준, 비어 있으면 기본 매핑
async function loadMcnoMachines() {
  const snap = await db.collection('machine_definitions').get();
  if (snap.empty) return DEFAULT_MCNO_MACHINES;
  const list = [];
  snap.forEach((d) => {
    const data = d.data();
    if (typeof data.mcno === 'number' && data.mcno > 0) {
      list.push({ no: parseInt(d.id, 10), name: data.name || `장비 ${d.id}`, mcno: data.mcno });
    }
  });
  return list.sort((a, b) => a.no - b.no);
}

let lastAutoSyncDate = null;

async function autoSyncOnce() {
  const today = dateStrKST(Date.now());
  // 날짜가 바뀐 뒤 첫 실행(또는 스크립트 시작 직후)이면 어제 분도 마감 저장
  const dates = lastAutoSyncDate === today ? [today] : [dateStrKST(Date.now() - 86400000), today];

  const machines = await loadMcnoMachines();
  let ok = 0;
  const failed = [];
  for (const m of machines) {
    try {
      const entries = await fetchDspmLog(m.mcno);
      for (const dt of dates) {
        const summary = aggregateByDate(entries, dt, m.no, m.name, m.mcno);
        if (summary.events.length > 0) await saveDailySummary(summary);
      }
      ok++;
    } catch (err) {
      failed.push(`${m.name}(${err.message})`);
    }
  }
  lastAutoSyncDate = today;
  log(`🔄 자동 동기화 ${dates.join(',')} — ${ok}/${machines.length}대 저장${failed.length ? ` · 실패: ${failed.join(', ')}` : ''}`);
}

/* ── 폴링 루프 ── */
// 요청 처리와 자동 동기화가 겹치지 않게 하나의 플래그로 직렬화
let isProcessing = false;
let autoSyncDue = AUTO_SYNC_MIN > 0;

async function pollOnce() {
  if (isProcessing) return;
  isProcessing = true; // 조회 await 중에 다음 tick 이 끼어들지 않게 먼저 잠근다

  try {
    // 대시보드 요청이 우선 — 사용자가 화면에서 기다리고 있다
    const snap = await db.collection('dspm_sync_requests')
      .where('status', '==', 'pending')
      .orderBy('requestedAt', 'asc')
      .limit(1)
      .get();

    if (!snap.empty) {
      const doc = snap.docs[0];
      try {
        await processRequest(doc.id, doc.data());
      } catch (err) {
        log(`❌ 요청 처리 실패: ${doc.id} — ${err.message}`);
        await db.collection('dspm_sync_requests').doc(doc.id).update({
          status: 'error',
          error: err.message,
          completedAt: new Date().toISOString(),
        }).catch(() => {});
      }
    } else if (autoSyncDue) {
      autoSyncDue = false;
      await autoSyncOnce();
    }
  } catch (err) {
    log(`⚠️  폴링 오류: ${err.message}`);
  } finally {
    isProcessing = false;
  }
}

/* ── 메인 ── */
async function main() {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║     DSPM Log Sync — 사내PC 동기화 스크립트 v1.1     ║');
  console.log('╠═══════════════════════════════════════════════════════╣');
  console.log(`║ DSPM API: ${DSPM_BASE.padEnd(42)}║`);
  console.log(`║ 폴링간격: ${String(POLL_MS).padEnd(42)}ms ║`);
  console.log(`║ 자동동기화: ${(AUTO_SYNC_MIN > 0 ? `${AUTO_SYNC_MIN}분마다 (오늘 이력)` : '끔').padEnd(38)}║`);
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log('');

  // DSPM 연결 테스트
  log('🔌 DSPM API 연결 테스트...');
  try {
    const testEntries = await fetchDspmLog(52, 5000); // MCNO 52 (520HD+ 2호기)
    log(`   ✅ DSPM 연결 OK — ${testEntries.length}개 엔트리`);
  } catch (err) {
    log(`   ⚠️  DSPM 연결 실패: ${err.message}`);
    log('   스크립트는 계속 실행됩니다. DSPM이 접근 가능해지면 요청을 처리합니다.');
  }

  // Firebase 연결 테스트
  log('🔌 Firebase 연결 테스트...');
  try {
    const testSnap = await db.collection('dspm_sync_requests').limit(1).get();
    log(`   ✅ Firebase 연결 OK`);
  } catch (err) {
    log(`   ❌ Firebase 연결 실패: ${err.message}`);
    process.exit(1);
  }

  log('👀 동기화 요청 대기 중... (Ctrl+C로 종료)');
  console.log('');

  // 폴링 시작 (자동 동기화는 시작 직후 1회 + AUTO_SYNC_MIN 분마다)
  if (AUTO_SYNC_MIN > 0) setInterval(() => { autoSyncDue = true; }, AUTO_SYNC_MIN * 60000);
  setInterval(pollOnce, POLL_MS);
  pollOnce(); // 즉시 1회 체크
}

// Graceful shutdown
process.on('SIGINT', () => {
  log('🛑 종료 중...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('🛑 종료 중...');
  process.exit(0);
});

main().catch(err => {
  console.error('치명적 오류:', err);
  process.exit(1);
});
