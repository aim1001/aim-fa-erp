import * as XLSX from "xlsx";
import { downloadFile, listFolderFiles, downloadFileByPath } from "./onedrive";

export interface CustomerListRow {
  businessNumber: string;
  companyName: string;
  representative: string;
  address: string;
  businessType: string;
  businessCategory: string;
  mgmtDepartment: string;
  mgmtContactName: string;
  mgmtPhone: string;
  mgmtMobile: string;
  mgmtFax: string;
  mgmtEmail: string;
  notes: string;
  primaryContact: string;
  registrationDate: string;
}

export async function parseCustomerListFromOneDrive(): Promise<CustomerListRow[]> {
  const filePath = "4.경영지원/database/고객사목록.xls";
  const buffer = await downloadFileByPath(filePath);
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("시트를 찾을 수 없습니다");

  const results: CustomerListRow[] = [];
  let row = 4; // 0-indexed row 4 = Excel row 5
  while (true) {
    const companyName = getCellValue(sheet, 3, row); // D열
    if (!companyName) break;

    const bizNum = getCellValue(sheet, 1, row); // B열

    results.push({
      businessNumber: bizNum,
      companyName,
      representative: getCellValue(sheet, 4, row), // E열
      address: getCellValue(sheet, 5, row), // F열
      businessType: getCellValue(sheet, 6, row), // G열
      businessCategory: getCellValue(sheet, 7, row), // H열
      mgmtDepartment: getCellValue(sheet, 8, row), // I열
      mgmtContactName: getCellValue(sheet, 9, row), // J열
      mgmtPhone: getCellValue(sheet, 10, row), // K열
      mgmtMobile: getCellValue(sheet, 11, row), // L열
      mgmtFax: getCellValue(sheet, 12, row), // M열
      mgmtEmail: getCellValue(sheet, 13, row), // N열
      notes: getCellValue(sheet, 14, row), // O열
      primaryContact: getCellValue(sheet, 15, row), // P열
      registrationDate: getCellValue(sheet, 16, row), // Q열
    });
    row++;
  }

  return results;
}

export interface ExcelCustomerInfo {
  sheetName: string;
  quoteNumber: string;
  companyName: string;
  address: string;
  contactName: string;
  email: string;
  phone: string;
  projectName: string;
  quoteDate: string;
}

function getCellValue(sheet: XLSX.WorkSheet, col: number, row: number): string {
  const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
  const cell = sheet[cellRef];
  if (!cell || cell.v === undefined || cell.v === null) return "";
  return String(cell.v).trim();
}

function extractCustomerInfo(sheet: XLSX.WorkSheet, sheetName: string): ExcelCustomerInfo | null {
  const labelCheck = getCellValue(sheet, 23, 2); // X3
  if (labelCheck !== "회사명") return null;

  const companyName = getCellValue(sheet, 25, 2); // Z3
  if (!companyName || companyName === "-" || companyName === "협력사") return null;

  const address = getCellValue(sheet, 25, 3); // Z4
  const addressExtra = getCellValue(sheet, 26, 3); // AA4
  const fullAddress = [address, addressExtra].filter(a => a && a !== "-").join(" ");

  return {
    sheetName,
    quoteNumber: getCellValue(sheet, 25, 1), // Z2
    companyName,
    address: fullAddress || "",
    contactName: getCellValue(sheet, 25, 4) || "", // Z5
    email: getCellValue(sheet, 25, 5) || "", // Z6
    phone: getCellValue(sheet, 25, 6) || "", // Z7
    projectName: getCellValue(sheet, 25, 8) || "", // Z9
    quoteDate: getCellValue(sheet, 25, 9) || "", // Z10
  };
}

const VALID_SHEET_PREFIXES = ["한화", "하이크"];

export async function parseExcelCustomerInfo(folderId: string): Promise<ExcelCustomerInfo[]> {
  const files = await listFolderFiles(folderId);
  const excelFiles = files.filter(f =>
    f.name.endsWith('.xlsx') || f.name.endsWith('.xls') || f.name.endsWith('.xlsm')
  );

  const results: ExcelCustomerInfo[] = [];

  for (const ef of excelFiles) {
    try {
      const buffer = await downloadFile(ef.id);
      const workbook = XLSX.read(buffer, { type: "buffer" });

      const targetSheets = workbook.SheetNames.filter(name =>
        VALID_SHEET_PREFIXES.some(prefix => name.startsWith(prefix))
      );
      for (const sheetName of targetSheets) {
        const sheet = workbook.Sheets[sheetName];
        const info = extractCustomerInfo(sheet, sheetName);
        if (info) {
          results.push(info);
        }
      }
    } catch (err: any) {
      console.warn(`Error parsing ${ef.name}:`, err.message);
    }
  }

  const seen = new Map<string, ExcelCustomerInfo>();
  for (const info of results) {
    const key = info.companyName;
    if (!seen.has(key)) {
      seen.set(key, info);
    } else {
      const existing = seen.get(key)!;
      if ((!existing.email && info.email) || (!existing.contactName && info.contactName)) {
        seen.set(key, { ...existing, ...info, contactName: info.contactName || existing.contactName, email: info.email || existing.email, phone: info.phone || existing.phone });
      }
    }
  }

  return Array.from(seen.values());
}
