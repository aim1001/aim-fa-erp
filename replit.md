# Sales Inquiry Manager (영업 관리 시스템)

## Overview
영업 자료 관리 시스템 - OneDrive 연동하여 인콰이어리를 자동으로 스캔, 관리하는 웹 애플리케이션.
5명 미만의 팀이 사용하는 영업 관리 도구.

## Architecture
- **Frontend**: React + Vite + Tailwind CSS + Shadcn UI + Recharts
- **Backend**: Express.js + Drizzle ORM
- **Database**: PostgreSQL (Neon-backed, Replit built-in)
- **Integration**: OneDrive (Microsoft Graph API via Replit connector), Gmail (Google API via Replit connector)

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
```
Example inquiries: `1.영업/2026/26-2_대동도어_UNI5.0_현대/`
Example projects: `2.공사/2026/26-1_엘로이텍_PLC통신_피더호퍼조명1set`

## Data Architecture
- **customers** 테이블: 사업자등록 기준 공식 고객사 (상호명, 사업자등록번호, 대표자, 주소, 업태, 종목) - 영업/경영지원 공유
- **companies** 테이블: 담당자/연락처 (contactName, email, phone) - customerId로 고객사에 연결 (1:N)
- **vendors** 테이블: 공급업체 (상호명, 사업자등록번호, 대표자, 담당자 정보, 즐겨찾기) - 매입계산서용
- **inquiries** 테이블: customerId(고객사)와 companyId(담당자) 모두 참조 + 스냅샷 필드로 연결 시점 정보 보존
- **sales_invoices** 테이블: 매출계산서 (customerId 참조, 계산서번호, 발행일, 품목, 수량, 단가, 공급가액, 세액, 합계)
- **purchase_invoices** 테이블: 매입계산서 (vendorId 참조, 계산서번호, 발행일, 품목, 수량, 단가, 공급가액, 세액, 합계)
- **payments** 테이블: 결제 계획 (유형, 계산서 참조, projectId 참조, 거래처명, 금액, 결제방법, 예정일/실제일, 분할 정보)
- **projects** 테이블: 프로젝트 (프로젝트번호, 고객사명, 내용, 연도, OneDrive 폴더 정보, 상태)
- **item_master** 테이블: 판매제품 마스터 (카테고리, 품목코드(unique), 품목명, 사양, 원가, 판매가, 활성여부, 제품유형, isFavorite 즐겨찾기)
- **item_inventory** 테이블: 재고 관리 (품목코드, 재고유형(AVAILABLE/TEST/DEMO), 수량, 업데이트일)
- **item_document** 테이블: 제품 문서 (품목코드, 문서유형, URL, 이름)
- **purchase_items** 테이블: 구매품 마스터 (대분류, 소분류, 품목코드, 품명, 브랜드, 원산지, 규격, 공급업체텍스트, vendorId FK→vendors, 단가, 통화, 리드타임, 재고품여부, 유형, 단위, 활성여부, 안전재고, MOQ, 비고)
- **inquiry_memos** 테이블: 인콰이어리 메모 (inquiryId FK→inquiries, content, createdAt ISO string) - 날짜별 메모 누적 관리
- **quotations** 테이블: 견적서 (inquiryId FK→inquiries, quoteNumber, quoteDate, validUntil, notes, status draft/sent/accepted, adjustmentAmount, adjustmentNote, discountType(percent/amount 선택), discountValue(비율% 또는 금액), discountTruncUnit(none/1000/10000/100000/1000000 - 최종공급가액에 절사 적용), deliveryDays(납기일수 - purchase_items의 최대 leadTimeDays 자동계산, 수정가능), createdAt)
- **quotation_items** 테이블: 견적서 품목 (quotationId FK→quotations, itemCode, itemName, spec, quantity, costPrice, unitPrice, amount, category1, category2, sortOrder, isAdjustment) — isAdjustment=true인 항목은 추가/할인 항목으로 별도 관리
- **contract_templates** 테이블: 계약조건 템플릿 (name, content, isDefault, createdAt) - 재사용 가능한 계약 세부내용 관리
- **company_settings** 테이블: 회사 정보 설정 (companyName, businessNumber, representative, address, phone, fax, email, logoUrl, signatureUrl, bankInfo) - 견적서 PDF 헤더에 반영, signatureUrl은 대표이사 서명 이미지(Seller Sign란에 표시)
- **staff** 테이블: 인력풀 (name, department(자유입력+자동완성), title(직함: 대표이사/매니저/팀원 등 자유입력), email, phone(휴대폰), createdAt) — 대표이사는 부서 "-"
- 프로젝트↔계산서↔결제 연동: salesInvoices, purchaseInvoices, payments에 projectId 필드로 프로젝트 연결
- Snapshot + bridge architecture: 연결 시점의 정보를 스냅샷으로 보존하면서 현재 레코드 참조도 유지

## Key Features
- OneDrive 폴더 자동 스캔 및 인콰이어리 동기화
- 인콰이어리 CRUD (수동 추가 가능, 영업번호 자동생성)
- 새 인콰이어리 추가 시 OneDrive 폴더 자동 생성
- 대시보드 (확률별, 상태별, 연도별 차트)
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
- 사이드바: 영업(인콰이어리, 진행중/수주/실주, 프로젝트) / 경영지원(매출계산서, 매입계산서, 자금계획) / 관리(고객사, 공급업체)
- 견적서 이메일 전송 - Gmail API로 PDF 첨부 이메일 전송 (OneDrive 자동 저장 후 발송)

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
- `client/src/pages/dashboard.tsx` - Dashboard page
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
- `client/src/pages/payment-plan.tsx` - Payment plan page (자금계획, 리스트+캘린더 뷰)
- `client/src/pages/item-list.tsx` - Item/product list page (판매제품관리, OneDrive sync)
- `client/src/pages/purchase-item-list.tsx` - Purchase item list page (구매품관리, OneDrive sync)
- `client/src/components/app-sidebar.tsx` - Sidebar navigation (영업/경영지원/관리 섹션)
- `client/src/components/quotation-section.tsx` - Quotation section component (견적서 생성/편집/내보내기)
- `server/quotation-export.ts` - PDF + Excel generation for quotations (pdfkit, exceljs)
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

## User Preferences
- Korean language UI
- Business/professional theme (blue primary color)
- Probability uses 1-5 stage system, not percentage
- Status: active(진행중), won(수주), lost(실주) only
- Inline editing preferred (no separate edit page)
- Material options: steel, 플라스틱, 고무류
- Industry options: 자동차, 전기, 전자부품, 화장품, 기타
