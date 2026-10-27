# scripts/ — 사내PC 전용 스크립트

## dspm-log-sync.js

Firebase `dspm_sync_requests` 큐를 감시하고, DSPM `getmachinelog` API로 이력을 가져와 `machine_status_daily`에 저장하는 스크립트.

### 사전 준비

1. **Node.js 18+** 설치
2. **firebase-admin** 패키지 설치:
   ```bash
   cd scripts
   npm init -y
   npm install firebase-admin
   ```
3. **serviceAccountKey.json** — Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성 → `scripts/` 폴더에 저장

### 실행

```bash
cd scripts
node dspm-log-sync.js
```

### 동작 방식

1. 스크립트 시작 → DSPM / Firebase 연결 확인
2. 5초마다 `dspm_sync_requests` 컬렉션에서 `status: 'pending'` 문서를 확인
3. 요청 발견 시:
   - status → `processing` 으로 변경
   - 요청의 각 장비에 대해 DSPM `getmachinelog` API 호출
   - 로그 엔트리를 KST 날짜별로 분할·집계
   - `machine_status_daily/{YYYY-MM-DD}/machines/{no}` 에 저장
   - 진행률을 `progress` 필드에 실시간 업데이트
   - 모든 장비 완료 시 status → `completed`
4. 대시보드가 `onSnapshot`으로 요청 문서를 감시 → 완료 시 자동 새로고침

### 환경변수 (옵션)

| 변수                | 기본값                             | 설명                    |
| ------------------- | ---------------------------------- | ----------------------- |
| `FIREBASE_SA_PATH`  | `./serviceAccountKey.json`         | 서비스 계정 키 경로      |
| `DSPM_BASE_URL`     | `http://dspm.dsjs.co.kr:10920`     | DSPM API URL            |
| `POLL_INTERVAL_MS`  | `5000`                             | 폴링 간격 (ms)          |

### 주의사항

- 이 스크립트는 **사내 네트워크에서만** 실행 가능합니다 (DSPM API가 내부망 전용)
- `serviceAccountKey.json`은 **절대 Git에 커밋하지 마세요** (.gitignore에 이미 포함)
