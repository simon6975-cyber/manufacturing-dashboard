# Production Hub v2.1

제작공정 대시보드 + 거래명세서 관리 시스템

## 변경사항 (v2.1)

- **거래명세서 관리** 페이지 추가 (`/transaction`)
  - 사업부 필터 (DM사업부 / N사업부)
  - 일자 범위 검색
  - 고객사 검색 (59개 고객사)
  - 제품 관리 (추가/수정/삭제)
  - 담당자 필터 (사업부별 자동 연동)
  - 업무명 키워드 검색
  - 컬럼 정렬 / 50건 페이지네이션
  - 운영통계 27,419건 전체 데이터 포함

## 페이지 구조

- `/` — 공정 흐름도 (LIVE)
- `/transaction` — 거래명세서 관리 ← NEW
- `/dashboard` — 일일 대시보드
- `/analytics` — 기간별 집계

## 시작하기

```bash
npm install
npm run dev
```

## 배포

```bash
git add .
git commit -m "v2.1 - 거래명세서 관리 추가"
git push origin main
# Vercel 자동 배포
```
