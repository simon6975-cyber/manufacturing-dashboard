# scripts/ — 사내PC 전용 스크립트

## dspm-log-sync.js

DSPM `getmachinelog` API로 장비 상태 이력을 가져와 `machine_status_daily`에 저장하는 스크립트.

- **요청 처리** — 정지/병목 분석의 온디맨드 조회(`dspm_sync_requests` 큐)를 처리
- **자동 동기화** — 10분마다 MCNO 매핑된 전 장비의 오늘 이력을 저장. 공정흐름도 상세패널의
  '상태 변경 이력'이 이 데이터를 읽는다(Vercel은 사내망 DSPM에 직접 닿지 못함 — `SETUP_dspm_api.md`)

### 사전 준비

1. **Node.js 20+** 설치
2. **firebase-admin** 패키지 설치:
   ```bash
   cd scripts
   npm init -y
   npm install firebase-admin
   ```
   (v13·v14 모두 동작. v1.0 스크립트는 v14에서 `admin.credential` 오류가 나므로 v1.1 이상을 쓸 것)
3. **serviceAccountKey.json** — Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성 → `scripts/` 폴더에 저장

### 실행

```bash
cd scripts
node dspm-log-sync.js
```

### 동작 방식

1. 스크립트 시작 → DSPM / Firebase 연결 확인 → 자동 동기화 1회 (어제+오늘)
2. `dspm_sync_requests` 컬렉션의 `status: 'pending'` 문서를 **실시간 구독**으로 감시 (예전 5초 조회는 결과가 없어도 읽기 1건씩 — 하루 1.7만 건이라 v1.4 에서 구독으로 변경)
3. 요청 발견 시:
   - status → `processing` 으로 변경
   - 요청의 각 장비에 대해 DSPM `getmachinelog` API 호출
   - 로그 엔트리를 KST 날짜별로 분할·집계
   - `machine_status_daily/{YYYY-MM-DD}/machines/{no}` 에 저장
   - 진행률을 `progress` 필드에 실시간 업데이트
   - 모든 장비 완료 시 status → `completed`
4. 대시보드가 요청 문서를 감시 → 완료 시 자동 새로고침
5. `PROCCNT_SEC`초(기본 60)마다 `getproccnt`(공정별 TOT/CNT/REMAIN)를 `dspm_live/proccnt`에 저장
   — 공정흐름도 내지·표지 장비군 대기물량이 이 값을 읽는다
6. 같은 주기로 **병목 판정(BN1~BN5)** — 장비별 결과를 `dspm_live/bottlenecks`에 저장(바뀔 때만, 그대로면 10분마다)
   - 규칙: `settings/bottleneck_rules` (대시보드 설정 > 정지/병목코드 > 병목 판정 규칙), 5분마다 다시 읽음
   - 입력: 공정 진행량(대기물량), 장비군 최대치(`settings/queue_limits`), DSPM 실시간 상태(`getmachinestate`), 자동 동기화가 받은 DSPM 로그
   - 판정 상태(대기물량 초과 시작 시각 등)는 `dspm_live/bottleneck_state`에 5분마다 보관 — 스크립트를 다시 켜도 이어짐
   - 병목 이력: 발생·해제 때만 `bottleneck_events`에 한 건씩 기록 (정지/병목 분석 화면의 '병목 이력')
   - **일별 생산량(v1.6+)**: 같은 실시간 상태의 `DAYCOMCNT`로 `production_daily/{날짜}/machines/{no}` 기록
     (장비당 10분에 한 번, 값이 바뀐 경우만). DSPM 카운터는 자정이 아니라 다음 작업 시작 때 초기화되므로,
     날짜가 바뀐 뒤 카운터가 줄어드는 순간부터 새 날짜로 세고 그 전 값은 전날 기록으로 올린다.
     작업이 없던 날은 기록이 생기지 않는다 (예전처럼 전날 값이 복사되지 않음)
7. 대기 중인 요청이 없을 때 `AUTO_SYNC_MIN`분마다 자동 동기화
   - 장비 목록은 `machine_definitions`(장비관리 화면)의 MCNO 기준
   - 오늘 날짜를 통째로 다시 저장(날짜가 바뀐 직후엔 어제 분도 마감 저장)
   - 요청이 들어오면 요청이 먼저 처리된다

### 환경변수 (옵션)

| 변수                | 기본값                             | 설명                    |
| ------------------- | ---------------------------------- | ----------------------- |
| `FIREBASE_SA_PATH`  | `./serviceAccountKey.json`         | 서비스 계정 키 경로      |
| `DSPM_BASE_URL`     | `http://dspm.dsjs.co.kr:10920`     | DSPM API URL            |
| `POLL_INTERVAL_MS`  | `5000`                             | 폴링 간격 (ms)          |
| `AUTO_SYNC_MIN`     | `10`                               | 자동 동기화 주기 (분), `0`이면 끔 |
| `PROCCNT_SEC`       | `60`                               | 공정 진행량 저장 주기 (초), `0`이면 끔 |

### 주의사항

- 이 스크립트는 **사내 네트워크에서만** 실행 가능합니다 (DSPM API가 내부망 전용)
- 첫 실행 때 `The query requires an index` 오류가 반복되면 메시지의 링크로 Firestore 복합 색인
  (`dspm_sync_requests`: `status` ↑ + `requestedAt` ↑)을 만든다 — 색인이 없으면 요청 처리·자동 동기화 모두 멈춘다
- `serviceAccountKey.json`은 **절대 Git에 커밋하지 마세요** (.gitignore에 이미 포함)
