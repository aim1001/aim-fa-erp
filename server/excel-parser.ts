import * as XLSX from "xlsx";
import { downloadFile, listFolderFiles } from "./onedrive";

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

      for (const sheetName of workbook.SheetNames) {
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
