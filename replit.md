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

## Key Features
- OneDrive 폴더 자동 스캔 및 인콰이어리 동기화
- 인콰이어리 CRUD (수동 추가 가능)
- 대시보드 (확률별, 상태별, 연도별 차트)
- 검색 및 필터링 (고객명, 연도, 상태)
- 파일 목록 및 OneDrive에서 열기

## Project Structure
- `shared/schema.ts` - Data models (inquiries, inquiryFiles)
- `server/onedrive.ts` - OneDrive API client
- `server/storage.ts` - Database storage interface
- `server/routes.ts` - API routes
- `client/src/pages/dashboard.tsx` - Dashboard page
- `client/src/pages/inquiry-list.tsx` - Inquiry list page
- `client/src/pages/inquiry-detail.tsx` - Inquiry detail page
- `client/src/pages/inquiry-form.tsx` - Add/Edit inquiry form
- `client/src/components/app-sidebar.tsx` - Sidebar navigation

## Recent Changes
- 2026-02-23: Initial MVP build with OneDrive integration, dashboard, CRUD

## User Preferences
- Korean language UI
- Business/professional theme (blue primary color)
