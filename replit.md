# Sales Inquiry Manager (영업 관리 시스템)

## Overview
영업 자료 관리 시스템 - OneDrive 연동하여 인콰이어리를 자동으로 스캔, 관리하는 웹 애플리케이션.
5명 미만의 팀이 사용하는 영업 관리 도구.

## Architecture
- **Frontend**: React + Vite + Tailwind CSS + Shadcn UI + Recharts
- **Backend**: Express.js + Drizzle ORM
- **Database**: PostgreSQL (Neon-backed, Replit built-in)
- **Integration**: OneDrive (Microsoft Graph API via Replit connector)

## OneDrive Folder Structure
```
1.영업/
  └── {year} (e.g., 2026, 2025, 2024...)
      └── {inquiryNumber}_{customerName}_{productInfo}/
          ├── *.xlsx (원본 파일)
          └── *.pdf (견적 파일)
```
Example: `1.영업/2026/26-2_대동도어_UNI5.0_현대/`

## Data Architecture
- **customers** 테이블: 사업자등록 기준 공식 고객사 (상호명, 사업자등록번호, 대표자, 주소, 업태, 종목) - 영업/경영지원 공유
- **companies** 테이블: 담당자/연락처 (contactName, email, phone) - customerId로 고객사에 연결 (1:N)
- **vendors** 테이블: 공급업체 (상호명, 사업자등록번호, 대표자, 담당자 정보, 즐겨찾기) - 매입계산서용
- **inquiries** 테이블: customerId(고객사)와 companyId(담당자) 모두 참조 + 스냅샷 필드로 연결 시점 정보 보존
- **sales_invoices** 테이블: 매출계산서 (customerId 참조, 계산서번호, 발행일, 품목, 수량, 단가, 공급가액, 세액, 합계)
- **purchase_invoices** 테이블: 매입계산서 (vendorId 참조, 계산서번호, 발행일, 품목, 수량, 단가, 공급가액, 세액, 합계)
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
- 사이드바: 영업(인콰이어리, 진행중/수주/실주) / 경영지원(매출계산서, 매입계산서) / 관리(고객사, 공급업체)

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
- `client/src/pages/inquiry-detail.tsx` - Inquiry detail page (includes CustomerInfoSection, ProductImagesSection)
- `client/src/pages/inquiry-form.tsx` - Add inquiry form (auto-generates inquiry number)
- `client/src/pages/customer-list.tsx` - Customer list page (테이블 형태, 클릭 시 모달 편집, optimistic update)
- `client/src/pages/customer-detail.tsx` - Customer detail page (레거시, 직접 접근 시 사용)
- `client/src/pages/company-list.tsx` - Contact/Company list page (담당자 목록)
- `client/src/pages/company-detail.tsx` - Contact detail page (담당자 정보, inline editing)
- `client/src/pages/vendor-list.tsx` - Vendor list page (공급업체 목록, 모달 편집, 즐겨찾기)
- `client/src/pages/sales-invoice-list.tsx` - Sales invoice list page (매출계산서)
- `client/src/pages/purchase-invoice-list.tsx` - Purchase invoice list page (매입계산서)
- `client/src/components/app-sidebar.tsx` - Sidebar navigation (영업/경영지원/관리 섹션)

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

## User Preferences
- Korean language UI
- Business/professional theme (blue primary color)
- Probability uses 1-5 stage system, not percentage
- Status: active(진행중), won(수주), lost(실주) only
- Inline editing preferred (no separate edit page)
- Material options: steel, 플라스틱, 고무류
- Industry options: 자동차, 전기, 전자부품, 화장품, 기타
