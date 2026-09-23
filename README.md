# DSPM 로컬 동기화 (사내망 PC용)

Vercel(podcenter-dashboard)에서 `dspm.dsjs.co.kr:10920`으로 직접 나가는 요청이 방화벽에 막혀서
(외부 클라우드 IP 차단으로 추정), 대신 **사내망 안의 PC에서** 이 스크립트를 주기 실행해
실측 설비상태를 Firestore에 밀어넣는 방식입니다. 웹 대시보드는 Firestore를 실시간 구독만 하므로
이 스크립트만 잘 돌면 별도 배포 없이 화면에 그대로 반영됩니다.

**어느 PC에서 돌려야 하나요?** — `http://dspm.dsjs.co.kr:10920`에 접속되는 PC라면 아무 PC나
됩니다(사무실 네트워크에 붙어 있는 PC). DSPM 서버 자체이거나, 상시 켜져 있는 사무실 PC를 추천합니다.

## 설치 (최초 1회)

1. 이 폴더를 그 PC의 아무 위치에나 복사 (예: `C:\dspm-local-sync`)
2. Node.js 설치가 안 되어 있다면 설치 (nodejs.org, LTS 버전)
3. `install.bat` 더블클릭 → 패키지 설치
4. `.env.example`을 복사해 `.env`로 이름 바꾸고, Vercel 프로젝트(podcenter-dashboard)의
   **Settings → Environment Variables**에 있는 `NEXT_PUBLIC_FIREBASE_*` 값들을 그대로 옮겨 적기
   (Firebase 콘솔의 프로젝트 설정에서도 동일한 값을 볼 수 있습니다)

## 테스트 실행

`run_sync.bat`을 더블클릭 → 같은 폴더에 생기는 `sync.log`를 열어 확인합니다.

- `machine_definitions 에 mcno가 매핑된 공정이 아직 없습니다` 라고만 나오면: 아직 정상입니다.
  대시보드 `/settings/machines`에서 실측 설비(MCNO)를 먼저 연결해야 그 다음부터 실제로 반영됩니다.
- `[변경] NO.xx(...) ← mcno=...` 줄이 보이면: 정상적으로 Firestore에 반영된 것입니다. 대시보드
  화면을 새로고침해서 확인하세요.
- `[FATAL] ...`로 시작하면: 대부분 `.env` 값이 비어있거나 틀린 경우입니다.

## 계속 자동 실행되게 등록하기

**방법 A — 자동 스크립트 (추천)**
PowerShell을 **관리자 권한으로 실행**한 뒤:
```powershell
cd C:\dspm-local-sync
powershell -ExecutionPolicy Bypass -File register_task.ps1
```
1분마다 무기한 반복 실행되도록 작업 스케줄러에 등록됩니다.

**방법 B — 작업 스케줄러 앱에서 수동 등록**
1. `작업 스케줄러` 실행 → 오른쪽 "작업 만들기"
2. 이름: `DSPM Local Sync`
3. 트리거: 새로 만들기 → 매일 → 시작 후 "반복 간격"을 1분으로, 기간은 "무기한"
4. 동작: 새로 만들기 → 프로그램: 이 폴더의 `run_sync.bat` 경로 지정
5. 조건 탭: "AC 전원에 연결된 경우에만" 체크 해제(항상 실행되게)

## 운영 중 확인할 것

- `sync.log`가 계속 쌓입니다(5MB 넘으면 스크립트가 자동으로 비웁니다). 문제 생기면 이 파일부터 확인.
- 작업 스케줄러 앱의 "기록" 탭에서 실행 성공/실패 이력을 볼 수 있습니다(실패 시 종료 코드 1).
- 이 스크립트를 실행하는 PC가 꺼져 있거나 네트워크가 끊기면 그 동안은 동기화가 멈춥니다 —
  상시 켜져 있는 PC에서 돌리는 걸 권장합니다.
- 대시보드 `/settings/machines`의 "실측 DSPM 설비 목록" 미리보기는 이제 이 스크립트가 매번
  Firestore(`dspm_live/snapshot`)에 남기는 최신 스냅샷을 구독해서 보여줍니다(Vercel이 직접 못 불러오는
  문제를 우회) — 이 스크립트가 안 돌면 그 미리보기도 갱신되지 않습니다.
