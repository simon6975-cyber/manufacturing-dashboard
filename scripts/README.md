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
2. 5초마다 `dspm_sync_requests` 컬렉션에서 `status: 'pending'` 문서를 확인
3. 요청 발견 시:
   - status → `processing` 으로 변경
   - 요청의 각 장비에 대해 DSPM `getmachinelog` API 호출
   - 로그 엔트리를 KST 날짜별로 분할·집계
   - `machine_status_daily/{YYYY-MM-DD}/machines/{no}` 에 저장
   - 진행률을 `progress` 필드에 실시간 업데이트
   - 모든 장비 완료 시 status → `completed`
4. 대시보드가 요청 문서를 감시 → 완료 시 자동 새로고침
5. 대기 중인 요청이 없을 때 `AUTO_SYNC_MIN`분마다 자동 동기화
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

### 주의사항

- 이 스크립트는 **사내 네트워크에서만** 실행 가능합니다 (DSPM API가 내부망 전용)
- 첫 실행 때 `The query requires an index` 오류가 반복되면 메시지의 링크로 Firestore 복합 색인
  (`dspm_sync_requests`: `status` ↑ + `requestedAt` ↑)을 만든다 — 색인이 없으면 요청 처리·자동 동기화 모두 멈춘다
- `serviceAccountKey.json`은 **절대 Git에 커밋하지 마세요** (.gitignore에 이미 포함)
