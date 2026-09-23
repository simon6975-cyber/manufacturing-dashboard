// dspm-local-sync/sync.js
//
// 사내망 PC에서 실행하는 1회성 동기화 스크립트.
// Vercel(podcenter-dashboard)에서 http://dspm.dsjs.co.kr:10920 로 직접 나가는 요청이
// 방화벽에 막혀 있어서(외부 클라우드 IP 차단으로 추정), 대신 이 스크립트를 사내망 PC에서
// Windows 작업 스케줄러로 1~2분마다 실행한다. 이 방향은 반대로 아무 문제가 없다:
//   1) 사내망 -> dspm.dsjs.co.kr:10920 (사내 서버라 당연히 접근 가능)
//   2) 이 PC -> Firestore(공개 HTTPS)로 쓰기 (인터넷 나가는 방향이라 막힐 이유가 없음)
// 웹 대시보드(ProcessFlowDiagram.tsx)는 Firestore를 실시간 구독만 하므로, 이 스크립트가
// Firestore에 쓰기만 하면 화면에는 별도 배포 없이 그대로 반영된다.
//
// 실행: node sync.js   (Task Scheduler에서는 run_sync.bat 를 통해 호출)

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const fs = require('fs');
const path = require('path');
const { initializeApp } = require('firebase/app');
const {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, Timestamp,
} = require('firebase/firestore');

// ── 로그 파일이 무한히 커지는 것 방지 (5MB 넘으면 새로 시작) ─────────────
const LOG_PATH = path.join(__dirname, 'sync.log');
try {
  if (fs.existsSync(LOG_PATH) && fs.statSync(LOG_PATH).size > 5 * 1024 * 1024) {
    fs.truncateSync(LOG_PATH, 0);
  }
} catch { /* 로그 정리 실패는 무시하고 계속 진행 */ }

function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(' ')}`;
  console.log(line);
}

// ── Firebase 초기화 ──────────────────────────────────────────────────
const requiredEnv = [
  'NEXT_PUBLIC_FIREBASE_API_KEY', 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'NEXT_PUBLIC_FIREBASE_APP_ID',
];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`[FATAL] 환경변수 ${key} 가 비어 있습니다. .env 파일을 확인하세요 (.env.example 참고).`);
    process.exit(1);
  }
}

const app = initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
});
const db = getFirestore(app);

const DSPM_API_URL = process.env.DSPM_API_URL || 'http://dspm.dsjs.co.kr:10920/api/getmachinestate';
const STALE_WARN_MS = 24 * 60 * 60 * 1000; // 24시간 넘게 오래된 TM은 로그로만 경고

// ── 실측 API 조회 ────────────────────────────────────────────────────
async function fetchDspmMachineStates() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(DSPM_API_URL, { signal: controller.signal });
    if (!res.ok) throw new Error(`DSPM API HTTP ${res.status}`);
    const json = await res.json();
    if (!Array.isArray(json.data)) throw new Error('DSPM API 응답 형식 오류(data 배열 아님)');
    return json.data;
  } finally {
    clearTimeout(timeout);
  }
}

// 실측 STATE 문자열 → 앱 상태값(status, stopReason)
function mapDspmState(state) {
  if (state === 'RUN') return { status: 'RUN', stopReason: '' };
  if (state === 'IDLE') return { status: 'IDLE', stopReason: '' };
  if (/^S\d+$/.test(state)) return { status: 'STOP', stopReason: state };
  log(`[경고] 알 수 없는 STATE 값: "${state}" → IDLE로 처리`);
  return { status: 'IDLE', stopReason: '' };
}

function hhmmss(d) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

async function loadMachineDefs() {
  const snap = await getDocs(collection(db, 'machine_definitions'));
  const list = [];
  snap.forEach((d) => {
    const data = d.data();
    list.push({
      no: parseInt(d.id, 10),
      name: data.name || `NO.${d.id}`,
      mcno: typeof data.mcno === 'number' ? data.mcno : undefined,
    });
  });
  return list;
}

// ── 메인 동기화 ──────────────────────────────────────────────────────
async function main() {
  log('동기화 시작:', DSPM_API_URL);

  const [realStates, defs] = await Promise.all([
    fetchDspmMachineStates(),
    loadMachineDefs(),
  ]);
  log(`실측 API 응답: ${realStates.length}개 설비`);

  // 설정화면(/settings/machines) 미리보기용 원본 스냅샷 저장 — 웹 대시보드는
  // 이 문서를 실시간 구독해서 "실측 설비 목록"을 보여준다(Vercel이 직접 못 불러오므로 대체 경로).
  await setDoc(doc(db, 'dspm_live', 'snapshot'), {
    data: realStates,
    fetchedAt: Timestamp.now(),
    fetchedAtIso: new Date().toISOString(),
  });

  const byMcno = new Map(realStates.map((s) => [s.MCNO, s]));
  const mappedDefs = defs.filter((d) => d.mcno != null);

  if (mappedDefs.length === 0) {
    log('[안내] machine_definitions 에 mcno가 매핑된 공정이 아직 없습니다. ' +
        '대시보드 /settings/machines 에서 실측 설비를 먼저 연결해주세요.');
  }

  let updated = 0, unchanged = 0, missing = 0, stale = 0;

  for (const def of mappedDefs) {
    const real = byMcno.get(def.mcno);
    if (!real) { missing++; continue; }

    const reportedAt = new Date(real.TM);
    const ageMs = Date.now() - reportedAt.getTime();
    if (ageMs > STALE_WARN_MS) {
      stale++;
      log(`[stale] NO.${def.no}(${def.name}) mcno=${def.mcno} 마지막 보고 ${Math.round(ageMs / 3600000)}시간 전`);
    }

    const { status, stopReason } = mapDspmState(real.STATE);
    const ref = doc(db, 'machines', String(def.no));
    const snap = await getDoc(ref);
    const prev = snap.exists() ? snap.data() : null;

    if (prev && prev.status === status && (prev.stopReason || '') === stopReason) {
      unchanged++;
      continue;
    }

    const entry = {
      status,
      stopCode: stopReason,
      time: hhmmss(reportedAt),
      timestamp: reportedAt.getTime(),
    };
    const prevHistory = prev?.history || [];
    const newHistory = [entry, ...prevHistory].slice(0, 50);

    await setDoc(ref, {
      status,
      stopReason,
      statusChangedAt: Timestamp.fromDate(reportedAt),
      updatedAt: Timestamp.now(),
      history: newHistory,
      source: 'dspm-local-sync',
      sourceMcno: def.mcno,
      sourceMcnm: real.MCNM,
    }, { merge: true });

    updated++;
    log(`[변경] NO.${def.no}(${def.name}) ← mcno=${def.mcno}(${real.MCNM}) ${status}${stopReason ? ' ' + stopReason : ''}`);
  }

  const unmappedCount = realStates.filter((s) => !mappedDefs.some((d) => d.mcno === s.MCNO)).length;
  log(`완료: 변경 ${updated} / 동일 ${unchanged} / 미보고 ${missing} / stale경고 ${stale} / 미매핑설비 ${unmappedCount}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`[FATAL] ${err instanceof Error ? err.stack || err.message : String(err)}`);
    process.exit(1);
  });
