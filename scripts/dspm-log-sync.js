#!/usr/bin/env node
// scripts/dspm-log-sync.js
// ─────────────────────────────────────────────────────────────────
// 사내PC 전용 — DSPM getmachinelog API로 이력을 가져와 machine_status_daily 에 저장
//   1) 요청 처리: Firebase dspm_sync_requests 큐(정지/병목 분석 온디맨드 조회)를 감시
//   2) 자동 동기화: AUTO_SYNC_MIN 분마다 MCNO 매핑된 전 장비의 오늘 이력을 저장
//   3) 공정 진행량: PROCCNT_SEC 초마다 getproccnt(공정별 TOT/CNT/REMAIN)를 dspm_live/proccnt 에 저장
//      (공정흐름도 장비군 대기물량이 이 값을 읽는다)
//   4) 병목 판정: 같은 주기로 장비별 병목(BN1~BN5)을 계산해 dspm_live/bottlenecks 에 저장
//      (규칙은 settings/bottleneck_rules — 대시보드 설정 > 정지/병목코드에서 수정)
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
//   PROCCNT_SEC       — 공정 진행량 저장 주기 초 (기본: 60, 0이면 끔)
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
const PROCCNT_SEC = parseInt(process.env.PROCCNT_SEC || '60', 10);
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
  return fetchDspmData(`/api/getmachinelog?mcno=${mcno}`, timeoutMs);
}

// { code, data: [...] } 응답의 data 배열을 돌려준다
function fetchDspmData(apiPath, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const url = `${DSPM_BASE}${apiPath}`;
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

/* ── 장비 정의 (읽기 절약: 30분 캐시) ── */
// machine_definitions 는 장비 관리에서 가끔 바뀌는 데이터인데, 자동 동기화(10분)·병목 판정(5분)이
// 매번 ~20문서를 읽으면 하루 9천 건이 넘는다. 30분마다 한 번만 읽어 둘이 같이 쓴다.
const DEFS_TTL_MS = 30 * 60000;
let defsCache = { at: 0, docs: [] };

async function getMachineDefDocs() {
  if (Date.now() - defsCache.at < DEFS_TTL_MS) return defsCache.docs;
  const snap = await db.collection('machine_definitions').get();
  defsCache = { at: Date.now(), docs: snap.docs.map((d) => ({ id: d.id, data: d.data() })) };
  return defsCache.docs;
}

/* ── 자동 동기화 ── */
// MCNO 매핑된 장비 목록: 대시보드 장비관리(machine_definitions) 기준, 비어 있으면 기본 매핑
async function loadMcnoMachines() {
  const docs = await getMachineDefDocs();
  if (docs.length === 0) return DEFAULT_MCNO_MACHINES;
  const list = [];
  docs.forEach((d) => {
    const data = d.data;
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
      latestLogs.set(m.mcno, entries); // 병목 판정(BN3~BN5)이 다음 동기화까지 재사용
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

/* ── 공정 진행량 (getproccnt) ── */
// 숫자 필드만 골라 저장 — 응답 원형이 바뀌어도 대시보드가 읽는 키는 고정
let proccntBusy = false;
let proccntFailLogged = false;

async function syncProccnt() {
  if (proccntBusy) return;
  proccntBusy = true;
  try {
    const rows = await fetchDspmData('/api/getproccnt', 15000);
    const data = rows.map((r) => ({
      PROCCD: String(r.PROCCD ?? ''),
      PROCNM: String(r.PROCNM ?? ''),
      UNIT: String(r.UNIT ?? ''),
      TOT: Number(r.TOT) || 0,
      CNT: Number(r.CNT) || 0,
      REMAIN: Number(r.REMAIN) || 0,
    }));
    await db.doc('dspm_live/proccnt').set({ data, fetchedAt: FieldValue.serverTimestamp() });
    lastProccnt = data;
    if (proccntFailLogged) log('✅ 공정 진행량 저장 재개');
    proccntFailLogged = false;
  } catch (err) {
    // 1분마다 같은 오류로 로그가 차지 않게 연속 실패는 첫 번만 기록
    if (!proccntFailLogged) log(`⚠️  공정 진행량(getproccnt) 실패: ${err.message}`);
    proccntFailLogged = true;
  } finally {
    proccntBusy = false;
  }
  // 공정 진행량을 못 받아도 BN3~BN5 는 판정할 수 있으므로 항상 돌린다
  await runBottleneckTick().catch((err) => log(`⚠️  병목 판정 실패: ${err.message}`));
}

/* ── 병목 판정 (BN1~BN5) ── */
// 규칙 기본값 — 대시보드 src/lib/bottleneck-rules.ts DEFAULT_BOTTLENECK_RULES 와 같게 유지
const DEFAULT_BN_RULES = {
  BN1: { enabled: true, name: '대기물량병목', overloadMinutes: 30, countThreshold: 10, windowHours: 24 },
  BN2: { enabled: true, name: '전공정병목', emptyMinutes: 60, excludePrevIdle: true },
  BN3: { enabled: true, name: '동시성병목', stopCodes: ['S1', 'S2', 'S3'], countThreshold: 20, windowHours: 2 },
  BN4: { enabled: true, name: '대량물량병목', runMinutes: 180 },
  BN5: { enabled: true, name: '긴급물량병목', stopCodes: ['S6'], countThreshold: 5, windowHours: 6 },
};
// 장비군 → getproccnt 공정 (대시보드 ProcessFlowDiagram PROC_QUEUE_RULES 와 같게 유지)
const GROUP_PROC = {
  '연속지출력기': { code: '02' }, '롤재단': { code: '06', prev: '02' },
  '낱장출력': { code: '01' }, '코팅': { code: '14', prev: '01' }, '에폭시': { code: '15', prev: '14' },
  '제본': { code: '10' }, '중철기': { code: '08' }, '날개접지기': { code: '18' },
  '시험지접지기': { code: '05' }, '포장': { code: '12' },
};
// BN2 의 '전공정' — 이 장비군으로 물량을 넘겨주는 장비군 (없으면 BN2 판정 안 함 — 각 파트 첫 공정)
const PREV_GROUPS = {
  '롤재단': ['연속지출력기'], '코팅': ['낱장출력'], '에폭시': ['코팅'], '낱장재단': ['에폭시'],
  '제본': ['롤재단', '낱장재단'], '중철기': ['롤재단', '낱장재단'], '시험지접지기': ['롤재단'],
  '날개접지기': ['제본'], '2면재단': ['날개접지기'], '포장': ['제본', '중철기', '시험지접지기', '2면재단'],
};

const groupKeyOf = (name) => String(name || '').replace(/\s+/g, '');

/** 장비군 대기물량 — 대시보드 computeGroupQueues 와 같은 계산 (getproccnt 없거나 매핑 없으면 null) */
function groupQueueOf(group, procByCode) {
  const rule = GROUP_PROC[group];
  const cur = rule && procByCode.get(rule.code);
  if (!cur) return null;
  if (!rule.prev) return cur.REMAIN;
  const prev = procByCode.get(rule.prev);
  if (!prev) return null;
  const factor = prev.UNIT === '페이지' && cur.UNIT === '장' ? 0.5 : 1;
  return Math.min(Math.max(0, Math.round(prev.CNT * factor) - cur.CNT), cur.REMAIN);
}

/** DSPM 로그 → 시간순 구간 (같은 상태가 1초 이내로 이어지면 한 구간). ENDTM 없으면 진행 중(now) */
function logSpans(entries, now) {
  const spans = (entries || [])
    .map((e) => {
      const start = new Date(e.STARTTM).getTime();
      const endRaw = e.ENDTM ? new Date(e.ENDTM).getTime() : NaN;
      return { state: String(e.STATE || ''), start, end: Number.isFinite(endRaw) ? endRaw : now };
    })
    .filter((sp) => Number.isFinite(sp.start))
    .sort((a, b) => a.start - b.start);
  const merged = [];
  for (const sp of spans) {
    const last = merged[merged.length - 1];
    if (last && last.state === sp.state && sp.start - last.end <= 1000) last.end = Math.max(last.end, sp.end);
    else merged.push({ ...sp });
  }
  return merged;
}

/** 최근 windowHours 안에 시작한 codes 상태 구간 수 */
function countStopsInWindow(spans, codes, windowHours, now) {
  const from = now - windowHours * 3600000;
  return spans.filter((sp) => codes.includes(sp.state) && sp.start >= from).length;
}

/**
 * 한 번의 판정 (순수 함수 — 상태 st 는 호출 사이에 이어지며 이 함수가 갱신한다)
 * input: { now, rules, limits, machines:[{no,name,mcno,group}], live: Map(mcno→{STATE,match}), logs: Map(mcno→entries), proccnt }
 * 반환: { [machineNo]: [{ code, name, since, detail }] }
 */
function evaluateBottlenecks(input, st) {
  const { now, limits, machines, live, logs, proccnt } = input;
  const rules = { ...DEFAULT_BN_RULES };
  for (const k of Object.keys(rules)) rules[k] = { ...rules[k], ...((input.rules || {})[k] || {}) };
  st.groups = st.groups || {};
  st.runSince = st.runSince || {};
  st.match = st.match || {};

  const procByCode = new Map((proccnt || []).map((pc) => [pc.PROCCD, pc]));
  const byGroup = new Map();
  for (const m of machines) {
    const g = groupKeyOf(m.group);
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(m);
  }
  const liveState = (m) => (m.mcno != null && live.get(m.mcno)) ? String(live.get(m.mcno).STATE || '') : '';

  // 장비군 단위: BN1(대기물량 초과 지속·빈발), BN2(대기물량 0 지속)
  const groupBn = {};
  for (const [g, list] of byGroup) {
    const gs = st.groups[g] || (st.groups[g] = { overSince: null, overStarts: [], emptySince: null });
    const q = proccnt ? groupQueueOf(g, procByCode) : null;
    const out = [];

    const r1 = rules.BN1;
    const limit = limits[g];
    if (q != null && limit > 0 && q >= limit) {
      if (gs.overSince == null) { gs.overSince = now; gs.overStarts.push(now); }
    } else if (q != null) {
      gs.overSince = null;
    }
    gs.overStarts = gs.overStarts.filter((t) => t >= now - r1.windowHours * 3600000);
    if (r1.enabled) {
      const longOver = gs.overSince != null && now - gs.overSince >= r1.overloadMinutes * 60000;
      const frequent = gs.overStarts.length >= r1.countThreshold;
      if (longOver || frequent) {
        out.push({
          code: 'BN1', name: r1.name, since: longOver ? gs.overSince : gs.overStarts[0],
          detail: longOver
            ? `대기물량 ${q != null ? q.toLocaleString() : '-'} ≥ 최대 ${limit != null ? limit.toLocaleString() : '-'} · ${Math.floor((now - gs.overSince) / 60000)}분 지속`
            : `최근 ${r1.windowHours}시간 대기물량 초과 ${gs.overStarts.length}회`,
        });
      }
    }

    const r2 = rules.BN2;
    const prevGroups = PREV_GROUPS[g];
    if (q === 0 && prevGroups) {
      const prevMachines = prevGroups.flatMap((pg) => byGroup.get(pg) || []).filter((m) => m.mcno != null);
      const prevAllIdle = prevMachines.length > 0 && prevMachines.every((m) => liveState(m) === 'IDLE');
      if (r2.excludePrevIdle && prevAllIdle) gs.emptySince = null;
      else if (gs.emptySince == null) gs.emptySince = now;
    } else if (q != null) {
      gs.emptySince = null;
    }
    if (r2.enabled && gs.emptySince != null && now - gs.emptySince >= r2.emptyMinutes * 60000) {
      out.push({ code: 'BN2', name: r2.name, since: gs.emptySince, detail: `대기물량 0 · ${Math.floor((now - gs.emptySince) / 60000)}분 지속 (전공정 가동 중)` });
    }
    groupBn[g] = out;
  }

  // 장비 단위: BN3·BN5(정지코드 빈도), BN4(한 작업 RUN 지속)
  const result = {};
  for (const m of machines) {
    const list = [...(groupBn[groupKeyOf(m.group)] || [])];
    if (m.mcno != null) {
      const spans = logSpans(logs.get(m.mcno), now);
      for (const key of ['BN3', 'BN5']) {
        const r = rules[key];
        if (!r.enabled) continue;
        const n = countStopsInWindow(spans, r.stopCodes, r.windowHours, now);
        if (n >= r.countThreshold) {
          list.push({ code: key, name: r.name, since: now - r.windowHours * 3600000, detail: `최근 ${r.windowHours}시간 ${r.stopCodes.join('·')} ${n}회` });
        }
      }

      // BN4 — 실시간 상태에 매칭코드가 있으면 '같은 매칭코드로 RUN' 지속, 없으면 '끊김 없는 RUN' 지속
      const lv = live.get(m.mcno);
      const running = lv && String(lv.STATE) === 'RUN';
      const match = lv && lv.match ? String(lv.match) : null;
      if (!running) {
        delete st.runSince[m.mcno];
        delete st.match[m.mcno];
      } else if (match) {
        if (!st.match[m.mcno] || st.match[m.mcno].code !== match) st.match[m.mcno] = { code: match, since: now };
      } else {
        // 연속 RUN 시작 시각은 DSPM 로그를 기준으로 한다 (1분 간격 실시간 상태만 보면 그 사이의
        // 짧은 IDLE·정지를 놓쳐, 5분짜리 RUN 이 이어붙어 '3시간 연속 RUN' 으로 잘못 잡혔다).
        //  - 로그의 마지막 구간이 RUN 이고 지금까지 이어지면(끝이 15분 이내 — 로그는 10분마다 갱신) 그 시작
        //  - 로그의 마지막 구간이 RUN 이 아니면, 그 구간이 끝난 뒤 다시 RUN 이 된 것 → 그 끝 이후
        //  - 로그가 없으면(스크립트 시작 직후) 처음 RUN 을 본 시각
        const last = spans[spans.length - 1];
        let since = st.runSince[m.mcno] ?? now;
        if (last && last.state === 'RUN' && now - last.end <= 15 * 60000) since = last.start;
        else if (last && last.state !== 'RUN') since = Math.max(since, last.end);
        st.runSince[m.mcno] = since;
      }
      const r4 = rules.BN4;
      const since = match ? st.match[m.mcno]?.since : st.runSince[m.mcno];
      if (r4.enabled && running && since != null && now - since >= r4.runMinutes * 60000) {
        const mins = Math.floor((now - since) / 60000);
        list.push({
          code: 'BN4', name: r4.name, since,
          detail: match ? `매칭코드 ${match} · ${Math.floor(mins / 60)}시간 ${mins % 60}분 RUN` : `연속 RUN ${Math.floor(mins / 60)}시간 ${mins % 60}분`,
        });
      }
    }
    if (list.length > 0) result[m.no] = list;
  }
  return result;
}

// 실행부 — 1분마다 (공정 진행량 저장 직후)
const latestLogs = new Map();       // mcno → 최근 DSPM 로그 (자동 동기화가 10분마다 갱신)
let lastProccnt = null;
let bnState = null;                 // 판정 상태 (장비군 초과 시작 시각 등) — dspm_live/bottleneck_state 에 보관
let bnInputs = { at: 0, rules: {}, limits: {}, machines: [] };
let lastBnJson = '';
let lastBnWrite = 0;
let lastStateWrite = 0;
const BN_INPUT_TTL_MS = 5 * 60000;  // 규칙·최대치는 5분마다 다시 읽음 (문서 2개), 장비 정의는 30분 캐시

async function loadBnInputs(now) {
  if (now - bnInputs.at < BN_INPUT_TTL_MS) return bnInputs;
  const [rulesSnap, limitsSnap, defDocs] = await Promise.all([
    db.doc('settings/bottleneck_rules').get(),
    db.doc('settings/queue_limits').get(),
    getMachineDefDocs(),
  ]);
  const machines = [];
  defDocs.forEach((d) => {
    const x = d.data;
    machines.push({
      no: parseInt(d.id, 10),
      name: x.name || `장비 ${d.id}`,
      mcno: typeof x.mcno === 'number' ? x.mcno : null,
      group: x.equipmentGroup || String(x.name || '').replace(/\s*\d+호기$/, '').replace(/\s+/g, ''),
    });
  });
  const limits = {};
  for (const [k, v] of Object.entries((limitsSnap.exists && limitsSnap.data().limits) || {})) {
    if (typeof v === 'number' && v > 0) limits[groupKeyOf(k)] = v;
  }
  bnInputs = { at: now, rules: (rulesSnap.exists && rulesSnap.data().rules) || {}, limits, machines };
  return bnInputs;
}

async function runBottleneckTick() {
  const now = Date.now();
  const inputs = await loadBnInputs(now);
  if (bnState == null) {
    const snap = await db.doc('dspm_live/bottleneck_state').get();
    bnState = (snap.exists && snap.data().state) || {};
  }

  // 실시간 상태 (DSPM getmachinestate) — 매칭코드 필드가 있으면 BN4 에 쓴다
  const live = new Map();
  try {
    const rows = await fetchDspmData('/api/getmachinestate', 15000);
    for (const r of rows) {
      const mcno = Number(r.MCNO);
      if (!mcno) continue;
      const matchKey = Object.keys(r).find((k) => /MATCH|매칭/i.test(k));
      live.set(mcno, { STATE: r.STATE, match: matchKey ? r[matchKey] : null });
    }
  } catch (err) {
    // 실시간 상태가 없으면 BN2(전공정 IDLE 판단)·BN4 는 이번 회차 건너뜀 — 로그 기반 판정은 계속
  }

  const result = evaluateBottlenecks({ now, ...inputs, live, logs: latestLogs, proccnt: lastProccnt }, bnState);

  // 결과가 바뀌었을 때만 쓰고, 그대로면 10분마다 생존 신호만 (쓰기 절약)
  const json = JSON.stringify(Object.entries(result).map(([no, l]) => [no, l.map((b) => b.code + b.detail.replace(/\d+분/g, ''))]));
  if (json !== lastBnJson || now - lastBnWrite >= 10 * 60000) {
    await db.doc('dspm_live/bottlenecks').set({ machines: result, updatedAt: FieldValue.serverTimestamp() });
    if (json !== lastBnJson) {
      const n = Object.keys(result).length;
      log(n > 0 ? `🚧 병목 ${n}대: ${Object.entries(result).map(([no, l]) => `${no}번(${l.map((b) => b.code).join(',')})`).join(' ')}` : '✅ 병목 없음');
    }
    lastBnJson = json;
    lastBnWrite = now;
  }
  const openChanged = await recordBottleneckEvents(result, inputs.machines, now);
  if (openChanged || now - lastStateWrite >= 5 * 60000) {
    await db.doc('dspm_live/bottleneck_state').set({ state: bnState, updatedAt: FieldValue.serverTimestamp() });
    lastStateWrite = now;
  }
}

/**
 * 병목 이력 — 발생·해제 시점에만 bottleneck_events 에 한 건씩 기록 (정지/병목 분석 화면이 읽음)
 * 문서: { machineNo, machineName, code, name, detectedAt, since, endedAt(null=진행 중), detail, lastDetail, date }
 * 진행 중인 이력은 bnState.open 에 두어 스크립트를 다시 켜도 같은 건으로 이어서 닫는다.
 * 반환: open 목록이 바뀌었는지 (바뀌면 판정 상태를 바로 저장)
 */
async function recordBottleneckEvents(result, machines, now) {
  bnState.open = bnState.open || {};
  let changed = false;
  const active = new Set();
  for (const [no, list] of Object.entries(result)) {
    for (const b of list) {
      const key = `${no}|${b.code}`;
      active.add(key);
      const open = bnState.open[key];
      if (open) { open.lastDetail = b.detail; continue; }
      const m = machines.find((x) => String(x.no) === no);
      try {
        const ref = await db.collection('bottleneck_events').add({
          machineNo: Number(no), machineName: m ? m.name : '', code: b.code, name: b.name,
          detectedAt: now, since: b.since, endedAt: null, detail: b.detail, lastDetail: b.detail,
          date: dateStrKST(now),
        });
        bnState.open[key] = { id: ref.id, detectedAt: now, lastDetail: b.detail };
        changed = true;
      } catch (err) {
        log(`⚠️  병목 이력 기록 실패(${key}): ${err.message}`);
      }
    }
  }
  for (const [key, open] of Object.entries(bnState.open)) {
    if (active.has(key)) continue;
    try {
      await db.collection('bottleneck_events').doc(open.id).update({ endedAt: now, lastDetail: open.lastDetail || '' });
    } catch (err) {
      log(`⚠️  병목 이력 해제 기록 실패(${key}): ${err.message}`);
    }
    delete bnState.open[key];
    changed = true;
  }
  return changed;
}

/* ── 요청 감시 + 작업 루프 ── */
// 대시보드 동기화 요청(dspm_sync_requests, status=pending)은 실시간 구독으로 받는다.
// 예전엔 5초마다 조회했는데, 결과가 없어도 조회 1번 = 읽기 1건이라 하루 1.7만 건(무료 한도의 1/3)을 썼다.
// 구독은 요청이 생기거나 바뀔 때만 읽기가 든다.
let isProcessing = false;
let autoSyncDue = AUTO_SYNC_MIN > 0;
let pendingRequests = [];   // 구독이 채우는 대기 요청 (requestedAt 오름차순)

function watchRequests() {
  db.collection('dspm_sync_requests')
    .where('status', '==', 'pending')
    .orderBy('requestedAt', 'asc')
    .onSnapshot((snap) => {
      pendingRequests = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
    }, (err) => {
      // 한도 초과·네트워크 오류 등 — 1분 뒤 다시 구독
      log(`⚠️  요청 구독 오류: ${err.message} — 1분 뒤 재시도`);
      pendingRequests = [];
      setTimeout(watchRequests, 60000);
    });
}

async function pollOnce() {
  if (isProcessing) return;
  isProcessing = true;

  try {
    // 대시보드 요청이 우선 — 사용자가 화면에서 기다리고 있다
    const req = pendingRequests.shift();
    if (req) {
      try {
        await processRequest(req.id, req.data);
      } catch (err) {
        log(`❌ 요청 처리 실패: ${req.id} — ${err.message}`);
        await db.collection('dspm_sync_requests').doc(req.id).update({
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
    log(`⚠️  작업 오류: ${err.message}`);
  } finally {
    isProcessing = false;
  }
}

/* ── 메인 ── */
async function main() {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║     DSPM Log Sync — 사내PC 동기화 스크립트 v1.5     ║');
  console.log('╠═══════════════════════════════════════════════════════╣');
  console.log(`║ DSPM API: ${DSPM_BASE.padEnd(42)}║`);
  console.log(`║ 폴링간격: ${String(POLL_MS).padEnd(42)}ms ║`);
  console.log(`║ 자동동기화: ${(AUTO_SYNC_MIN > 0 ? `${AUTO_SYNC_MIN}분마다 (오늘 이력)` : '끔').padEnd(38)}║`);
  console.log(`║ 공정진행량: ${(PROCCNT_SEC > 0 ? `${PROCCNT_SEC}초마다 (getproccnt)` : '끔').padEnd(38)}║`);
  console.log(`║ 병목판정  : ${(PROCCNT_SEC > 0 ? `${PROCCNT_SEC}초마다 (BN1~BN5)` : '끔').padEnd(38)}║`);
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
  // 공정 진행량은 요청 처리·자동 동기화와 별개로 돈다 (문서 1개 덮어쓰기라 가볍다)
  if (PROCCNT_SEC > 0) {
    syncProccnt();
    setInterval(syncProccnt, PROCCNT_SEC * 1000);
  }
  watchRequests();
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

// 테스트에서 판정 함수만 불러 쓸 수 있게
module.exports = { evaluateBottlenecks, logSpans, groupQueueOf, DEFAULT_BN_RULES };
if (require.main !== module) return;

main().catch(err => {
  console.error('치명적 오류:', err);
  process.exit(1);
});
