# aim-fa-erp

AIM FA 사내 ERP (영업·프로젝트·계산서·수금·자금계획). Express + Vite/React + Drizzle(Postgres, Railway).

## 실행 / 배포
- 개발 서버: `.claude/launch.json`의 "AIM ERP Dev Server" (port 5000). `.env`(DATABASE_URL, SESSION_SECRET, APP_PASSWORD)는 git에 없음 — PC마다 직접 복사.
- 로컬 개발 서버도 **운영 Railway DB에 직접 연결**됨. 로컬에서 바꾼 데이터 = 실데이터.
- 배포: main에 push → Railway 자동 빌드/배포 (`railway.json`, `npm run build` → `npm run start`).
- 여러 PC에서 작업: 시작 시 `git pull`, 끝날 때 commit + push.
- Windows PowerShell 5.1: `&&` 불가, 실행정책 때문에 `npm` 대신 `npm.cmd`가 필요할 수 있음.

## DB 스키마 변경 — `npm run db:push` 금지
운영 DB가 `shared/schema.ts`와 schema drift 상태. `drizzle-kit push`는 `user_sessions` DROP, `monthly_balances` unique / `recurring_expenses`·`bank_transactions` FK / `bank_transactions_account_hash_idx` 제거 등 파괴적 변경을 제안함.
- 스키마 변경은 `pg`로 멱등 SQL 한 줄씩 직접 실행 (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...`, `.env`에서 DATABASE_URL 로드).
- schema.ts에도 필드는 추가(타입용)하되 DB 반영은 수동.
- push가 "Do you still want to push changes?" 프롬프트를 띄우면 즉시 프로세스 종료.

## 타입체크
`npm run check`(tsc)는 원래 에러투성이(ES5 target의 TS2802, pdfkit 타입 없음, nullable 등). 빌드는 esbuild(`script/build.ts`)라 무관. 내 변경 범위에 **새로 생긴** 에러만 판단. import 확인은 `npx tsx -e "..."` 또는 `npx esbuild server/index.ts --bundle`.

## 도메인 규칙

### 프로젝트 생성
- 유일한 경로 = 인콰이어리 전환 `POST /api/inquiries/:id/convert-to-project`. 별도 생성 API/UI 없음.
- 하드 게이트: 견적금액·비율합 100%·(납품기준이면)납품예정일 없으면 400(planErrors). 통과 시 단계별 미발행 계산서(plannedIssueDate) + 예정 수금을 원자적으로 자동 생성.
- 계약조건 단계금액(projects.deposit_amount/mid_amount/final_amount): 금액 우선, 없으면 ratio 환산(`stageSupply()`). `PATCH /api/projects/:id`에 계약조건 키 포함 시 `regenerateCollectionPlan()`/`regenerateInvoicePlan()` 자동 호출 — 완료 입금·발행완료 계산서 단계는 `lockedStages`로 보존.

### "수금됨" 판정이 화면마다 다름
- 미수금 화면(`/api/receivables`): **은행거래 매칭**(bank_transactions.matched_sales_invoice_id) 기준. status='paid'면 전액 수금.
- 매출계산서/고객사 거래원장(`/api/sales-invoices-with-payments`, `/api/customers/:id/ledger`): **payments(status='completed')** 합산.
- 경영지원 대시보드 미수: payment(type=income, status≠completed)만 집계 → 입금돼도 payment가 planned면 미수로 뜸.
- 일일보고서(`server/daily-report.ts`): issueDate 있고 status≠paid이고 (총액−완료수금)>0인 **계산서** 기준.
- 데이터 정리 시 어느 모델 기준인지 항상 확인.
- 고객사 거래원장은 customer_id OR 상호 정규화 일치로 모음 → customer_id가 틀리면 엉뚱한 원장에 붙음.

### 세금계산서
- 엑셀 업로드 중복판정 = 국세청 **승인번호**(엑셀 col 1) → DB `invoiceNumber` 컬럼에 저장. 승인번호 없는 레거시는 `발급일+사업자번호+공급가액` 폴백 후 backfill.
- 거래처 매칭: 사업자번호 1순위, 상호는 `normalizeCompanyName()`(`shared/company-name.ts`, (주)/㈜/주식회사/(유)/공백 제거). 은행 입금자명 매칭용 `normalizeForBankMatch`(routes.ts)와 혼동 금지.
- placeholder 계산서(invoice_number=NULL, 전환/수금계획 시 자동생성)와 실제 발행 계산서 구분에 주의.

### 거래처 중복 정리
- 유효본 판정 = 사업자등록번호 체크섬: 가중치 `[1,3,7,1,3,7,1,3,5]`로 앞 9자리 곱합 + `floor(9번째*5/10)`, `chk=(10-(합%10))%10` == 10번째 자리.
- 통합(트랜잭션 + 변경 전 로그): 계산서 재연결·company_name 정규화 → 프로젝트 customer_id/name → 인콰이어리(접미사 보존) → payments company_name → 무효 거래처 삭제.
- 삭제할 계산서에 **완료수금이 있으면 중단**. 예정수금(planned)만 있으면 함께 삭제.

### 자금계획 정기항목 (recurring_expenses)
- 급여는 3인 + 대표 가지급금 항목으로 구성 (금액은 DB recurring_expenses 참조).
- 은행의 대표 개인명의 큰 출금은 대부분 매입성 — 급여로 보지 말 것.
- **국세 ≠ 세무서**: 국세=부가세는 `/api/vat/summary`로 자동계산(분기 납부일에 '예상 부가세' 합성 행). 세무서=체납 분납 정기항목. 둘을 합치지 말 것.
- "정기지출 반영"(`/api/recurring-expenses/generate`)은 멱등 → 템플릿 금액을 고쳐도 이미 생성된 예정 payment는 안 바뀜. stale 예정 삭제 후 재생성.
- 정기 자동매칭 `/api/recurring-payments/auto-match`: 같은 달 + 동일 금액만. 변동금액은 "날짜 지난 미확인 N건" 배너로 수동 확인.

## 진행 중 / 미결
- 자금계획 일별 자금흐름(`client/src/pages/cash-flow-tab.tsx`)을 수기 장부 포맷으로 재설계 — 목업 반복 중, 구현 전. 스펙: 출금/입금 각 금액·세액·합계 6칸, 잔액, 비고(payments.memo 신규 필요), 날짜 축소/확장(과거 펼침·오늘/미래 접힘), 지출만 결재묶음(정기 / 거래처별)으로 묶고 수금은 건별, 은행 매칭은 묶음 단위·항목 단위 둘 다 지원. 기존 탭 교체 vs 새 탭은 미정.
- 오토런 26-11: 계산서 승인번호(invoiceNumber) 공란 — 부가세 신고 시 홈택스 승인번호 채워야 함. 미수는 잔금 660만(005486ad)만 남음.
