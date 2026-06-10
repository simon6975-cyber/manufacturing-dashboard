# 거래명세서 관리 패치 (v2.2)

기존 Production Hub 프로젝트에 거래명세서 관리 기능을 추가하는 패치입니다.
기존 코드를 최소한으로 변경합니다.

## 적용 방법

### 1단계: 파일 복사 (3개)

아래 파일을 기존 프로젝트에 복사하세요:

```
src/components/Sidebar.tsx        ← 덮어쓰기 (메뉴 1줄 추가된 버전)
src/app/transaction/page.tsx      ← 새 폴더/파일 생성
src/data/operations.json          ← 새 폴더/파일 생성 (운영통계 27,419건)
```

### 2단계: CSS 추가

`transaction-styles.css` 내용을 기존 `src/app/globals.css` 맨 아래에 붙여넣기하세요.

### 3단계: 배포

```bash
git add .
git commit -m "거래명세서 관리 기능 추가"
git push origin main
```

## 변경 내역

- `Sidebar.tsx`: import에 `ClipboardList` 추가, 메뉴에 `거래명세서 관리` 1줄 추가
- 나머지는 모두 신규 파일이므로 기존 코드에 영향 없음

## 데이터

- 운영통계자료.xlsx → 27,419건 (src/data/operations.json, 빌드 시 번들링)
- 자재사용현황.xlsx → 고객사 59개 목록
- 사업부 구분: 마케팅담당자 컬럼 기준
  - DM사업부: 김성수, 노재민, 강서윤, 임병민, 김희원
  - N사업부: 김정기, 오창희, 조영환, 박현수, 안제하
