# Sales Inquiry Manager (영업 관리 시스템)

## Overview
영업 자료 관리 시스템 - OneDrive 연동하여 인콰이어리를 자동으로 스캔, 관리하는 웹 애플리케이션.
5명 미만의 팀이 사용하는 영업 관리 도구.

## Architecture
- **Frontend**: React + Vite + Tailwind CSS + Shadcn UI + Recharts
- **Backend**: Express.js + Drizzle ORM
- **Database**: PostgreSQL (Neon-backed, Replit built-in)
- **Integration**: OneDrive (Microsoft Graph API via Replit connector), Gmail (Google API via Replit connector), Google Calendar (via Replit connector), Google Tasks (via Google Calendar OAuth connector), Telegram Bot (알림 전송)

## OneDrive Folder Structure
```
1.영업/
  └── {year} (e.g., 2026, 2025, 2024...)
      └── {inquiryNumber}_{customerName}_{productInfo}/
          ├── *.xlsx (원본 파일)
          └── *.pdf (견적 파일)
2.공사/
  └── {year} (e.g., 2026, 2025...)
      └── {projectNumber}_{customerName}_{description}/
          └── 프로젝트 관련 파일
4.경영지원/
  └── database/
      ├── 거래처 정보/
      │   └── {업체명}/
      │       ├── company_info.json (업체 기본정보 + 담당자 목록)
      │       ├── 사업자등록증.pdf/.jpg (사업자등록증)
      │       └── 통장사본.pdf/.jpg (통장사본, 구매처만)
      └── {year}/ (은행 거래내역 엑셀 파일)
```
Example inquiries: `1.영업/2026/26-2_대동도어_UNI5.0_현대/`
Example projects: `2.공사/2026/26-1_엘로이텍_PLC통신_피더호퍼조명1set`

## Data Architecture
- **customers** 테이블: 사업자등록 기준 공식 고객사 (상호명, 사업자등록번호, 대표자, 주소, 업태, 종목) - 영업/경영지원 공유
- **companies** 테이블: 담당자/연락처 (contactName, email, phone) - customerId로 고객사에 연결 (1:N)
- **vendors** 테이블: 공급업체 (상호명, 사업자등록번호, 대표자, 담당자 정보, 즐겨찾기) - 매입계산서용
- **inquiries** 테이블: customerId(고객사)와 companyId(담당자) 모두 참조 + 스냅샷 필드로 연결 시점 정보 보존; 고객정보 카드에서 담당자 Select 드롭다운으로 해당 고객의 담당자 목록에서 선택/전환 가능, 새 담당자 인라인 추가 가능
- **sales_invoices** 테이블: 매출계산서 (customerId 참조, 계산서번호, 발행일, 품목, 수량, 단가, 공급가액, 세액, 합계)
- **purchase_invoices** 테이블: 매입계산서 (vendorId 참조, 계산서번호, 발행일, 품목, 수량, 단가, 공급가액, 세액, 합계)
- **payments** 테이블: 결제 계획 (유형, 계산서 참조, projectId 참조, 거래처명, 금액, 결제방법, 예정일/실제일, 분할 정보(splitIndex/splitTotal), category, recurringExpenseId(정기지출 원본 ID))
- **recurring_expenses** 테이블: 정기지출 (category, description, companyName, amount, frequency(weekly/monthly/yearly), paymentDay(결제일), weekday(주간용 0-6), paymentMonth(연간용 1-12), isActive, totalInstallments(총횟수), startInstallment(시작회차 default 1)) — "자금현황" 모달에서 관리, 주간/월간/연간 주기별 payments 일괄 생성, 인라인 수정 가능, 기간/횟수 방식 선택 가능
- **bank_accounts** 테이블: 은행 계좌 (bankName, accountNumber, accountAlias, isActive) — 거래내역 가져오기를 위한 계좌 등록
- **bank_transactions** 테이블: 은행 거래 원장 (accountId FK→bank_accounts, txDate, txTime, description 적요, counterparty 거래처명, debitAmount 출금, creditAmount 입금, balance 잔액, importHash SHA256 중복방지, matchStatus 연결상태) — KB국민은행 Excel/CSV에서 가져온 거래내역 원장
- **projects** 테이블: 프로젝트 (프로젝트번호, 고객사명, 내용, 연도, OneDrive 폴더 정보, 상태, inquiryId 원본인콰이어리, warrantyTerms 보증조건, contractClauses 계약특약)
- **project_items** 테이블: 프로젝트 품목 (projectId FK→projects, itemCode, itemName, spec, quantity, costPrice, unitPrice, amount, category1, category2, sortOrder) — 인콰이어리→프로젝트 전환 시 견적 품목 복사, 독립적 수정 가능
- **item_master** 테이블: 판매제품 마스터 (카테고리, 품목코드(unique), 품목명, 사양, 원가, 판매가, 활성여부, 제품유형, isFavorite 즐겨찾기)
- **item_inventory** 테이블: 재고 관리 (품목코드, 재고유형(AVAILABLE/TEST/DEMO), 수량, 업데이트일)
- **item_document** 테이블: 제품 문서 (품목코드, 문서유형, URL, 이름)
- **purchase_items** 테이블: 구매품 마스터 (대분류, 소분류, 품목코드, 품명, 브랜드, 원산지, 규격, 공급업체텍스트, vendorId FK→vendors, 단가, 통화, 리드타임, 재고품여부, 유형, 단위, 활성여부, 안전재고, MOQ, 비고, isFavorite 즐겨찾기)
- **item_components** 테이블: 판매제품 BOM 구성품 (itemMasterId FK→item_master, purchaseItemId FK→purchase_items nullable, itemName, spec, quantity, unitCost, isAdjustment, sortOrder, remark) — 판매제품에 구매품 연결, purchaseItemId null이면 임시 항목(직접 입력), isAdjustment=true는 금액 조정 항목, "원가 적용" 버튼으로만 item_master.cost에 반영 (자동 갱신 없음, 직접 입력한 원가 유지). 구매품 관리 리스트에서 BOM 연결 여부를 Layers 아이콘으로 표시 (연결됨=파란색/미연결=회색, 호버 시 연결된 판매제품명 툴팁)
- **purchase_order_items** 테이블: 발주 품목 (purchaseOrderId FK→purchase_orders, itemCode, itemName, spec, brand, quantity, unitPrice, amount, category1, sortOrder, isAdjustment) — 발주서 품목 단위 관리, isAdjustment=true는 가격 조정 항목(할인/추가비용)
- **inquiry_memos** 테이블: 인콰이어리 메모 (inquiryId FK→inquiries, content, createdAt ISO string) - 날짜별 메모 누적 관리
- **inquiry_tasks** 테이블: 인콰이어리 할일 (inquiryId FK→inquiries, content, completed boolean, dueDate YYYY-MM-DD nullable, dueTime HH:mm nullable, calendarEventId text nullable, staffId varchar nullable FK→staff, createdAt YYYY-MM-DD) - taskType="todo"이면 Google Tasks로 등록/완료/삭제, taskType="schedule"이면 Google Calendar로 등록/삭제, staffId로 담당자 지정
- **project_tasks** 테이블: 프로젝트 할일 (projectId FK→projects, content, completed boolean, dueDate YYYY-MM-DD nullable, dueTime HH:mm nullable, calendarEventId text nullable, staffId varchar nullable FK→staff, createdAt YYYY-MM-DD) - Google Tasks/Calendar 연동 (inquiry_tasks와 동일 패턴), staffId로 담당자 지정
- 대시보드 TaskListCard: 인콰이어리 할일 + 프로젝트 할일을 통합 표시, 프로젝트 할일은 번호 앞에 "P:" 접두사로 구분
- **quotations** 테이블: 견적서 (inquiryId FK→inquiries, quoteNumber, quoteDate, validUntil, notes, status draft/sent/accepted, adjustmentAmount, adjustmentNote, discountType(percent/amount 선택), discountValue(비율% 또는 금액), discountTruncUnit(none/1000/10000/100000/1000000 - 최종공급가액에 절사 적용), deliveryDays(납기일수 - purchase_items의 최대 leadTimeDays 자동계산, 수정가능), createdAt)
- **quotation_items** 테이블: 견적서 품목 (quotationId FK→quotations, itemCode, itemName, spec, quantity, costPrice, unitPrice, amount, category1, category2, sortOrder, isAdjustment) — isAdjustment=true인 항목은 추가/할인 항목으로 별도 관리
- **contract_templates** 테이블: 계약조건 템플릿 (name, content, isDefault, createdAt) - 재사용 가능한 계약 세부내용 관리
- **company_settings** 테이블: 회사 정보 설정 (companyName, businessNumber, representative, address, phone, fax, email, website, logoUrl, signatureUrl, logoData, signatureData, bankInfo, autoCc, emailTemplate, quotationNotesTemplate, poDefaultStaffId, poDefaultPaymentTerms, poDefaultWarrantyTerms) - 견적서 PDF 헤더에 반영, website는 홈페이지 URL(데모 테스트 리포트 PDF에 표시), signatureUrl은 대표이사 서명 이미지(Seller Sign란에 표시), logoData/signatureData는 base64 data URI로 DB에 저장(배포 환경에서도 유지), autoCc는 이메일 발송 시 자동 CC, emailTemplate은 이메일 본문 템플릿({고객명},{견적번호} 치환), quotationNotesTemplate은 견적서 제외사항/기술지원 기본 템플릿, poDefault*는 발주서 기본값 설정
  - 설정 페이지는 탭 구조: "회사 정보" + "견적서" + "발주서" + "담당자" (영역별 기본 담당자: salesDefaultStaffId, projectDefaultStaffId, poDefaultStaffId, financeDefaultStaffId) + "텔레그램"
- 발주서 이메일: 제목 형식 `[회사명-발주서] 발주번호 - 발주 안내`, CC/본문 설정값 자동 적용, 본문 템플릿 치환변수({발주번호},{입고일자},{구매처명},{담당자명})
- 발주서 계약상세: 지급조건은 프리셋 Select(익월말/선처리/월말/2주이내) + 직접입력 + 계약금/중도금/잔금 분할 체크박스, 보증조건은 하자보증 1년 체크박스 + 직접입력, 입고장소는 회사주소 기본값 + 수동수정
- **StaffSearchPopover** 컴포넌트: `client/src/components/staff-search-popover.tsx`로 분리 — 발주서, 설정 페이지에서 공통 사용
- **vendor_contacts** 테이블: 구매처 담당자 인력풀 (vendorId FK→vendors, name, email, phone) — 구매처별 여러 담당자 관리, 발주서에서 선택/등록 가능
- **staff** 테이블: 자사 인력풀 (name, department(자유입력+자동완성), title(직함: 대표이사/매니저/팀원 등 자유입력), email, phone(휴대폰), createdAt) — 대표이사는 부서 "-"
- 프로젝트↔계산서↔결제 연동: salesInvoices, purchaseInvoices, payments에 projectId 필드로 프로젝트 연결
- 발주서↔계산서↔송금 연동: 발주서 생성 시 송금 예정(payment) 자동 생성 → 계산서 연결 시 해당 payment에 purchaseInvoiceId 설정하여 계산서로 이관 → 계산서에서 송금 관리(조정/분할/완료) → 발주서는 연결된 계산서의 결제 상태를 참조하여 표시 (계산서 미연결 시 직접 paymentId 기반 표시). 발주서 상세에서는 송금 상태 조회만 가능, 관리는 계산서에서.
- **calendar_events** 테이블: 직접 추가 일정 (title, date YYYY-MM-DD, endDate nullable, startTime HH:mm nullable, endTime nullable, description, color(purple/blue/green/orange/red), createdAt ISO)
- Snapshot + bridge architecture: 연결 시점의 정보를 스냅샷으로 보존하면서 현재 레코드 참조도 유지

## Authentication
- 단일 비밀번호 기반 인증 (APP_PASSWORD 환경변수)
- 세션 저장소: PostgreSQL (`connect-pg-simple`, `user_sessions` 테이블)
- 세션 유지: 7일 (서버 재시작/재배포에도 유지)
- `trust proxy` 설정으로 배포 환경에서 secure cookie 사용

## Key Features
- OneDrive 폴더 자동 스캔 및 인콰이어리 동기화
- 인콰이어리 CRUD (수동 추가 가능, 영업번호 자동생성, 홈페이지 웹 문의 자동 등록)
- 새 인콰이어리 추가 시 OneDrive 폴더 자동 생성
- 전체 대시보드 (`/`) - 영업/프로젝트/경영지원/구매판매 핵심 요약 + 해당 페이지 이동
- 영업 대시보드 (`/sales-dashboard`) - 확률별, 상태별, 연도별 차트, 예정 인콰이어리
- 검색 및 필터링 (고객명, 연도, 상태)
- 파일 목록 및 OneDrive에서 열기
- 고객사(Customers) 관리 - 사업자등록 기준 공식 고객 정보 (즐겨찾기, 거래/미거래/북마크 필터)
- 담당자(Contacts/Companies) 관리 - 고객사 상세 모달 내에서만 접근
- 공급업체(Vendors) 관리 - 매입계산서용 업체 관리 (즐겨찾기, 테이블/모달 편집)
- 매출계산서 - 고객사 참조, 세금계산서 필드 (발행일, 품목, 수량, 단가, 공급가액, 세액, 합계)
- 매입계산서 - 공급업체 참조, 세금계산서 필드
- 엑셀 견적서에서 고객 정보 자동 추출 (X3:Z7 셀 기반)
- 자금계획 - 월별 입출금 예정/실적 관리 (리스트+캘린더 뷰, 결제 완료 처리)
- 결제 계획 자동 생성 (계산서에서 익월말/월말/일자지정 + 분할 지원)
- 프로젝트 관리 - OneDrive `2.공사` 폴더 스캔, 연도별 프로젝트 목록 (폴더명 파싱: 번호_고객사_내용), 매출/매입/수익 요약, 계산서 연결/해제
- 광학 계산기 (`/optics-calculator`) - 카메라 FOV 및 광학 파라미터 계산, AIVE/Unifeeder 시스템 사양 비교, Canvas 기반 FOV 시각화 (줌/팬 지원), 제품 배치 시뮬레이션
- 사이드바: 영업(영업 대시보드, 인콰이어리, 광학 계산기) / 프로젝트(전체/진행중/완료) / 경영지원(매출계산서, 매입계산서, 자금계획) / 관리(고객사, 공급업체)
- 견적서 이메일 전송 - Gmail API로 PDF 첨부 이메일 전송 (OneDrive 자동 저장 후 발송, PDF 미리보기, CC 지원, 자동CC, 발송 시 상태 업데이트+캘린더 등록+판매가/원가/마진 저장)
- 발주서 PDF/이메일 - 발주 상세 모달에서 PDF 다운로드 + 구매처 이메일 발송 (Gmail API, 발주서 PDF 첨부, OneDrive 자동 저장, vendor contactEmail 자동 채움, CC/autoCc 지원)
- 발주서 입고일정 Google Calendar 연동 - 예정입고일 설정 시 캘린더에 `[입고] {발주번호} - {구매처명}` 이벤트 자동 등록/수정/삭제 (calendarId 설정 가능, 기본: sales@aim-fa.com)
- 대시보드 할일 4카테고리 탭: 전체/영업/프로젝트/구매발주/경영지원. 구매발주·경영지원 할일은 독립 테이블(`purchase_order_tasks`, `finance_tasks`)로 직접 추가/완료/삭제 가능. 캘린더 동기화 포함.
- 내부 캘린더 (`/calendar`) — 앱 자체 캘린더 페이지. 할일(4종 Tasks)/입고예정/납품마감/대금예정/직접추가 일정을 통합 표시. 월별/주별/목록 뷰 전환, 카테고리 필터 토글 + 영역 필터(전체/영업/프로젝트/구매/경영지원), 이벤트 클릭 시 상세 팝오버(원본 이동 링크, 담당자 표시). 직접 추가 일정(calendar_events 테이블)은 CRUD 가능.
- 할일/일정 담당자 지정 — 인콰이어리·프로젝트 할일 추가 시 staff 목록에서 담당자 선택 가능, 할일 목록에 이름 표시, 캘린더 팝오버에도 담당자 표시
- 영역별 기본 담당자 설정 — 설정 페이지 "담당자" 탭에서 영업/프로젝트/구매발주/경영지원 영역별 기본 담당자 설정 가능. 각 영역 할일 추가 시 자동 선택됨 (company_settings: salesDefaultStaffId, projectDefaultStaffId, financeDefaultStaffId, poDefaultStaffId)
- purchase_order_tasks, finance_tasks 테이블에 staffId 컬럼 추가

## Excel Customer Info Structure
견적서 엑셀 파일 시트에서 고객 정보 위치:
- X2/Z2: 견적번호
- X3/Z3: 회사명
- X4/Z4(+AA4): 주소
- X5/Z5: 고객이름(담당자)
- X6/Z6: 이메일
- X7/Z7: 전화번호
- X9/Z9: 프로젝트 이름
- X10/Z10: 견적일자

## Project Structure
- `shared/schema.ts` - Data models (customers, companies, vendors, inquiries, inquiryFiles, productImages, salesInvoices, purchaseInvoices)
- `server/onedrive.ts` - OneDrive API client
- `server/excel-parser.ts` - Excel file parsing utility for customer info extraction
- `server/storage.ts` - Database storage interface
- `server/routes.ts` - API routes
- `client/src/pages/main-dashboard.tsx` - Main overview dashboard (전체 요약)
- `client/src/pages/dashboard.tsx` - Sales dashboard page (영업 대시보드, /sales-dashboard)
- `client/src/pages/inquiry-list.tsx` - Inquiry list page
- `client/src/pages/inquiry-detail.tsx` - Inquiry detail modal (탭 기반 UI: 고객정보/제품정보/견적 및 내역/파일목록/계약조건, 전체화면 모달, includes CustomerInfoSection, ProductImagesSection, MemoSection, ContractConditionsTab)
- `client/src/pages/inquiry-form.tsx` - Add inquiry form (auto-generates inquiry number)
- `client/src/pages/customer-list.tsx` - Customer list page (테이블 형태, 클릭 시 모달 편집, optimistic update)
- `client/src/pages/customer-detail.tsx` - Customer detail page (레거시, 직접 접근 시 사용)
- `client/src/pages/company-list.tsx` - Contact/Company list page (담당자 목록)
- `client/src/pages/company-detail.tsx` - Contact detail page (담당자 정보, inline editing)
- `client/src/pages/vendor-list.tsx` - Vendor list page (공급업체 목록, 모달 편집, 즐겨찾기)
- `client/src/pages/sales-invoice-list.tsx` - Sales invoice list page (매출계산서)
- `client/src/pages/purchase-invoice-list.tsx` - Purchase invoice list page (매입계산서)
- `client/src/pages/payment-plan.tsx` - Payment plan page (자금계획, 리스트/캘린더/자금현황 3탭 뷰)
- `client/src/pages/fund-overview-tab.tsx` - Fund overview tab (자금현황 탭: 매출/매입 리스트, 경비 직접 입력, 월 정기 예정금액 관리, 비밀번호 6937 인증 후 접근)
- `client/src/pages/item-list.tsx` - Item/product list page (판매제품관리, OneDrive sync)
- `client/src/pages/purchase-item-list.tsx` - Purchase item list page (구매품관리, OneDrive sync)
- `client/src/components/app-sidebar.tsx` - Sidebar navigation (영업/경영지원/관리 섹션)
- `client/src/components/quotation-section.tsx` - Quotation section component (견적서 생성/편집/내보내기)
- `server/quotation-export.ts` - PDF + Excel generation for quotations (pdfkit, exceljs)
- `server/purchase-order-export.ts` - PDF generation for purchase orders (pdfkit, Pretendard font, A4 layout: 헤더+구매처정보+품목테이블+합계+서명란+비고)
- `server/demo-report-export.ts` - Demo test report PDF generation (A4 커버페이지: 로고, 타이틀 "Flexible Feeding System, Test report", 담당자/고객 정보 박스, 회사 푸터; 인콰이어리 상세 "테스트 리포트" 버튼 → DemoReportDialog에서 날짜/담당자/고객정보 편집 후 PDF 다운로드)
- `server/google-calendar.ts` - Google Calendar integration (견적 발송 시 이벤트 생성, 일정 캘린더 등록)
- `server/google-tasks.ts` - Google Tasks integration (할일 생성/완료/삭제 — google-calendar OAuth 토큰 공유)

## Telegram 알림
- `server/telegram.ts` - 텔레그램 봇 API 연동 (sendTelegramMessage, notifyInquiry, notifyWebInquiry, notifyProject, notifyPayment, notifyTask)
- 환경변수: TELEGRAM_BOT_TOKEN (봇 토큰), TELEGRAM_CHAT_ID (그룹 채팅 ID)
- 알림 대상 이벤트: 인콰이어리 등록/상태변경, 홈페이지 웹 문의 접수, 프로젝트 전환/상태변경, 결제 완료, 할일·일정 추가/완료 (영업·프로젝트·구매발주·경영지원 4카테고리)
- fire-and-forget 패턴: 알림 실패해도 본 요청에 영향 없음
- 설정 페이지 텔레그램 탭: 연결 상태 확인, Chat ID 자동 감지, 테스트 메시지 전송
- API: GET /api/telegram/status, POST /api/telegram/detect-chat, POST /api/telegram/test
- **텔레그램 메모 기능**: 봇 1:1 private 채팅 메시지를 30초 간격 polling으로 수집 → `telegram_memos` 테이블 저장 → 헤더 아이콘(뱃지) + Popover로 확인/읽음처리/삭제
  - `telegram_memos` 테이블: id(uuid PK), messageId(int), text, fromName, chatId, isRead(boolean), createdAt
  - API: GET /api/telegram/memos, GET /api/telegram/memos/unread-count, PATCH /api/telegram/memos/:id/read, DELETE /api/telegram/memos/:id
  - polling: `fetchNewMessages()` → offset 기반 getUpdates, 저장 성공 후에만 offset 진행 (at-least-once safety), `setTimeout` 기반 직렬 실행 (overlap 방지)
  - 중복 방지: chatId + messageId 복합키로 dedup
- **홈페이지 웹 문의 자동 등록**: `POST /api/web-inquiry` (인증 불필요, CORS 허용, rate limit 분당 5회)
  - 입력: companyName(필수), contactName, email, phone, productInfo, message
  - 처리: 인콰이어리 자동 생성 (source="website", isWebInquiry=true) + 고객 자동 생성/연결 + 텔레그램 알림
  - 인콰이어리 목록에서 isWebInquiry=true인 항목은 주황색 Globe 아이콘 + 최상단 정렬 (즐겨찾기보다 상위)
  - `PATCH /api/inquiries/:id/acknowledge` — isWebInquiry를 false로 변경 (확인 처리)

## Google Calendar 수동 동기화
- POST /api/tasks/sync-calendar: 모든 미등록 할일(inquiry_tasks + project_tasks 중 dueDate 있고 calendarEventId 없는 항목) 일괄 캘린더 등록
- POST /api/tasks/:id/sync-calendar: 개별 inquiry_task 캘린더 등록/갱신 (기존 이벤트 있으면 삭제 후 재생성)
- POST /api/project-tasks/:id/sync-calendar: 개별 project_task 캘린더 등록/갱신
- UI: 대시보드 할일 카드, 인콰이어리 상세 TaskSection, 프로젝트 상세 ProjectTaskSection에 일괄/개별 동기화 버튼
- 캘린더 상태 아이콘: CalendarDays 아이콘 (초록=등록됨, 회색=미등록), 클릭 시 개별 동기화
- `client/src/pages/settings.tsx` - Company settings page (회사 정보 + 로고 관리)
- `client/src/pages/staff-list.tsx` - Staff pool page (인력풀 관리, 부서별 필터, 테이블+모달)
- `server/uploads/` - Uploaded files (company logo, etc.)
- `server/fonts/` - Korean fonts (Pretendard) for PDF generation

## Recent Changes
- 2026-02-23: Initial MVP build with OneDrive integration, dashboard, CRUD
- 2026-02-23: Multi-format folder name parsing (2024-2026, 2021-2022, 2020 formats)
- 2026-02-23: Year-specific OneDrive sync, natural sorting, URL-based filtering
- 2026-02-23: Changed probability from 0-100% to 1-5 stages (1=문의, 2=미팅, 3=사양협의, 4=비딩, 5=발주전)
- 2026-02-23: Implemented _info.json bi-directional sync (read on sync, write on edit)
- 2026-02-23: Removed "pending" status, kept only active(진행중), won(수주), lost(실주)
- 2026-02-23: Added 8 product detail fields (productWidth, productDepth, productHeight, weight, material, productType, industry, supplySpeed)
- 2026-02-23: Replaced edit page with inline editing on detail page (click-to-edit all fields)
- 2026-02-23: _info.json sync includes product detail fields
- 2026-02-23: Redesigned contract conditions to per-stage structure: 계약금/중도금/잔금 each with ratio(%), timing type(일수지정/익월말/월말), timing days, and 납품후 flag (mid/final only)
- 2026-02-23: Added auto-generated inquiry numbers and OneDrive folder creation on new inquiry
- 2026-02-23: Added companies table with companyId reference in inquiries
- 2026-02-23: Excel parser extracts customer info from quotation sheets (X3:Z7 cells)
- 2026-02-23: Customer info scan button on inquiry detail, saves to company table + _info.json
- 2026-02-23: Company list and detail pages with inline editing
- 2026-02-23: Snapshot + bridge architecture for company data
- 2026-02-23: Added product_images table with Ctrl+V paste support (max 5 images, base64)
- 2026-02-23: Separated customers (사업자등록 기준) from companies (담당자) - 1:N relationship
- 2026-02-23: Customer pages for official business info, contacts managed under customers
- 2026-02-23: Dashboard multi-year checkbox filter (2020-2024 unchecked by default)
- 2026-02-23: Quick view sidebar links (진행중/수주/실주) + clickable dashboard cards
- 2026-02-23: Customer list converted to table view with modal editing (optimistic updates)
- 2026-02-23: Session-based password authentication (APP_PASSWORD env var, default aim1001)
- 2026-02-23: Dashboard 단계별 분포에서 "미설정" 제외
- 2026-02-23: Customer favorite/bookmark feature (isFavorite field) with 3-tab filter (거래/미거래/북마크)
- 2026-02-23: Vendor management module (CRUD, favorite toggle, table + modal editing)
- 2026-02-23: Sales/Purchase invoice modules (basic tax invoice fields, customer/vendor reference)
- 2026-02-23: Sidebar reorganized into sections: 영업/경영지원/관리
- 2026-02-23: Removed 담당자 from sidebar (accessible only via customer detail modal)
- 2026-02-23: Replaced 연도별 sidebar section with 최근 6개월/최근 1년 quick filters under 영업
- 2026-02-23: OneDrive tax invoice import (매출/매입전자세금계산서 엑셀 파일 → DB, 연도별 선택)
- 2026-02-23: Auto vendor creation on purchase invoice import (사업자번호 기반 공급업체 자동 생성)
- 2026-02-23: Vendor sync from invoices (매입계산서 기준 공급업체 갱신 버튼)
- 2026-02-23: Added lastTransactionDate to customer-list and vendor-list (계산서 기준 최근 거래일)
- 2026-02-23: Customer list traded/untraded filter changed to lastTransactionDate-based
- 2026-02-23: Added period filters (year/quarter/month) and totals summary to invoice lists
- 2026-02-23: Vendor bank info fields (bankName, bankAccount) added to schema and UI
- 2026-02-23: Payment plan system (payments table, auto-generate from invoices, split payments)
- 2026-02-23: Payment plan page with list + calendar views, monthly navigation, totals summary
- 2026-02-23: Invoice detail modals now include payment plan section with generate/complete actions
- 2026-02-23: Project↔Invoice↔Payment linking (projectId fields added, project detail modal with invoice linking/unlinking, financial summaries per project)
- 2026-02-24: 판매제품관리 (item_master, item_inventory, item_document 3테이블 설계, OneDrive listprice.xlsx 동기화, /items 페이지)
- 2026-02-25: 구매품관리 기능 추가 (purchase_items 테이블, OneDrive 2.공사/database/purchaselist.xlsx 동기화, /purchase-items 페이지, CRUD + 인라인 편집 + 품목 추가 다이얼로그)
- 2026-02-25: 구매품↔공급업체 연결 (vendorId FK 추가, 자동매칭 API, 연결/미연결 필터, 수동 공급업체 선택 드롭다운, 연결상태 아이콘 표시)
- 2026-02-25: 인콰이어리 담당자 관리 (목록에 미등록 아이콘 표시, 상세에서 담당자 CRUD, GET /api/companies/by-customer/:customerId 엔드포인트)
- 2026-02-25: 고객사 연결 흐름 개선 — ① 담당자 등록 시 중복 고객사 검사 추가 (forceCreate:true 제거, ContactMatchSelectionDialog 추가), ② CustomerLinkSection 연결 시 스냅샷 동기화 (고객사 주소+첫 담당자 연락처 → 스냅샷 필드), ③ 엑셀 스캔 실패/빈 결과 시 수동 입력 안내 배너 표시 (scanFailMessage state)
- 2026-02-25: 인콰이어리 수동 생성 시 Customer 자동 생성/연결 (고객명으로 기존 고객 검색 → 없으면 새 Customer 레코드 자동 생성, OneDrive sync의 auto-link와 동일 로직)
- 2026-02-25: 고객사 미리보기 모달에 편집 기능 추가 (상호명, 주소, 전화, 사업자번호, 대표자 인라인 편집 → PATCH /api/customers/:id)
- 2026-02-25: 견적서 관리 기능 (quotations/quotation_items 테이블, CRUD API, 탭 기반 모달 UI: 품목탭(카테고리 그룹+원가/마진 표시), 가격·합계탭(가격조정+최종합계), 생성탭(PDF/Excel 다운로드+OneDrive 업로드))
- 2026-02-24: OneDrive token management overhaul - graphCallWithRetry with fresh-client retry on 401/token errors, error classification (7 types), diagnostic token logging (length/type only, no secrets), Client.init callback pattern to avoid JWT parsing of opaque tokens, extractAccessToken with 5-field-path fallback, frontend error-type-specific guidance

- 2026-02-27: 판매제품 수동 추가 모달 (카테고리 Combobox - 기존 목록 선택 + 직접입력), 대분류/소분류 인라인 편집 (InlineCombobox)
- 2026-02-27: 판매제품/구매품 "OneDrive에 저장" 버튼 추가 (POST /api/items/write-onedrive, POST /api/purchase-items/write-onedrive)
- 2026-02-27: writePurchaseListToOneDrive() 함수 추가 (excel-parser.ts) — DB→purchaselist.xlsx 원드라이브 업로드
- 2026-02-27: PATCH /api/items/:id에서 자동 역동기화(writeListPriceToOneDrive) 제거 — 수동 버튼으로 대체
- 2026-02-27: 견적서 PDF 자동 레이아웃 전환 — 품목 수가 적으면 1페이지(세부내역 직접 표시, 요약 없음), 많으면 2페이지+(1페이지 카테고리 요약 + 2페이지 세부내역). singlePageMode 판정: detailTableH <= availableH (pageBottom - tableTop - paymentAreaH - bottomAnchorH)
- 2026-02-27: 고객사 연결 400 에러 수정 (getCompaniesByCustomer→getCompaniesByCustomerId 오타), 고객사 상태 3단계 표시 (미연결/정보보완필요/연결됨), 인콰이어리 목록 배지 기존/신규→등록/미등록으로 변경, 엑셀 스캔 시 기존 연결 고객사 정보 업데이트 지원
- 2026-02-27: 사이드바 대메뉴 Collapsible 구조로 재구성 — 5개 대메뉴(영업/프로젝트/경영지원/구매판매/업체관리) 접기/펼치기, 현재 페이지 속한 섹션 자동 펼침, OneDrive도 접기 가능, 연결상태 아이콘 라벨 옆 표시
- 2026-02-27: 프로젝트 계약조건 버그 수정 — `||` → `??` 변경으로 0% 비율 정상 처리, 기본값 계약금50%/중도금0%/잔금50%로 변경
- 2026-02-27: 프로젝트-거래처 연결 기능 추가 — projects.customerId 필드, 일괄 자동매칭(POST /api/projects/auto-match-customers), 개별 수동연결(모달 내 검색/선택), 모달에서 거래처 기본 정보 표시, 목록에서 연결 상태 아이콘(✓/⚠) 표시
- 2026-02-27: OneDrive 동기화 초기값 수정 — 상태 기본값 `none`(-), 발생일자 기본값 해당 연도 1월 1일

- `client/src/pages/purchase-order-list.tsx` - Purchase order list page (발주관리, OneDrive 동기화, 상세 모달)

## Recent Changes (continued)
- 2026-03-03: 발주관리 기능 추가 — purchase_orders 테이블 (orderNumber, vendor, vendorId FK→vendors, description, supplyAmount/taxAmount/totalAmount(공급가액·세액·합계 3분할), expectedDeliveryDate, actualDeliveryDate, status(일반/수입/입고완료), receivingCompleted, purchaseInvoiceId→purchase_invoices, paymentId→payments, OneDrive 폴더 정보, year), OneDrive `2.공사/{year}/발주서/` 폴더 동기화 (하위 수입/, 입고완료/ 폴더별 상태 자동 분류), 폴더명 파싱 (번호_구매처_내용), 상세 모달 (공급가액 입력→세액10%·합계 자동계산, 납품일/입고완료/계산서연결/송금연결/메모), 엑셀 금액 파서 (파일 1개→자동선택, 여러 개→파일선택, 적용 버튼 1개로 3개 금액 동시 적용), /purchase-orders 페이지, 사이드바 발주관리 활성화
- 2026-03-04: 발주 리스트 정렬 기능 추가 (발주번호/구매처/납품예정일 컬럼 클릭 정렬, 기본 발주번호 내림차순), vendorId FK 추가하여 구매처와 정확한 연결 (VendorSearchPopover에서 vendor 선택 시 vendorId도 저장, PDF/이메일에서 vendorId 기반 vendor 조회, 텍스트 직접입력 시 vendorId=null로 하위호환)
- 2026-03-04: 발주 4대 개선 — ① 구매품 즐겨찾기(isFavorite) 추가 (purchase_items.is_favorite, PurchaseItemSearchPopover 즐겨찾기 우선정렬+Star토글, purchase-item-list.tsx Star토글), ② 구매처 vendors 검색/연결 (VendorSearchPopover 컴포넌트, CreateOrderDialog에서 구매처 검색/직접입력), ③ 발주번호 자동생성 (getNextOrderNumber YY-N 포맷, POST 시 자동할당, 미리보기), ④ 가격조정→최종금액 방식 변경 (isAdjustment 항목 UI 제거, 최종금액(공급가액) 직접입력, 품목소계 대비 조정금액 표시, 세액/합계 자동계산)
- 2026-03-04: 발주 계산서/송금 연결 개선 — 매입계산서 자동생성 제거 (발주 생성 시 계산서 미생성, 상세에서 수동 연결만), 목록 계산서 열 "미연결"/"연결됨" 배지 표시, 송금 열 예정일/완료 상태 표시 (완료 시 녹색 배지, 미완료 시 "MM/DD 예정" 텍스트)
- 2026-03-04: 발주서 계약상세 필드 추가 — purchase_orders에 staffId(인력풀FK), contactPerson(담당자명), paymentTerms(지급조건, 기본: 입고후 익월말), deliveryLocation(입고장소, 기본: 회사주소), warrantyTerms(보증조건, 기본: 하자보증 1년) 추가. 생성/상세 모달에서 편집 가능. PDF에 합계 후 계약상세 섹션 표시, 사인 섹션 좌우 반전 (좌=발주처+서명, 우=구매처)
- 2026-03-05: 자금현황 모달 추가 — payments.category 필드 추가 (카드사용/정기결제/세금납부/관리비/임대료/대출상환/기타), recurring_expenses 테이블 (정기지출 관리), 자금계획 페이지에 "자금현황" 버튼 추가 → 전체화면 모달 (매출 입금 리스트, 매입 출금 리스트, 경비 직접 입력(카테고리별), 월 정기 예정금액 CRUD+일괄생성)
- 2026-03-05: 자금현황 탭 개선 — ① 자금현황 모드에서 기존 리스트/캘린더 탭 버튼 숨기기 (자금현황 버튼만 표시, 클릭 시 자금계획으로 복귀), ② 자금현황 내부 리스트/캘린더 토글 추가 (월별 입출금 캘린더 뷰), ③ OneDrive 은행거래 가져오기 (4.경영지원/database/{year}/ 폴더에서 은행 엑셀 파일 선택→파싱→payments 테이블 일괄 등록, parseBankStatement 함수 — 거래일/입금/출금/적요/거래처 컬럼 자동 감지)

## Hooks
- `useDialogContainer` (`client/src/hooks/use-dialog-container.ts`): Dialog 내부에서 Popover/Select 등 Portal 기반 컴포넌트가 정상 작동하도록 Dialog DOM 요소를 container로 제공하는 hook. Radix Dialog의 inert 속성으로 Portal'd 콘텐츠가 클릭 불가능해지는 문제 해결.

## User Preferences
- Korean language UI
- Business/professional theme (blue primary color)
- Probability uses 1-5 stage system, not percentage
- Status: active(진행중), quoted(견적발송), won(수주), lost(실주)
- Inline editing preferred (no separate edit page)
- Material options: steel, 플라스틱, 고무류
- Industry options: 자동차, 전기, 전자부품, 화장품, 기타
