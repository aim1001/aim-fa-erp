import * as XLSX from "xlsx";
import { downloadFile, listFolderFiles, downloadFileByPath, findFileInFolder, listFilesByPath, listFoldersByPath, uploadFileByPath } from "./onedrive";
import { storage } from "./storage";

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
  const buffer = await findFileInFolder(["4.경영지원", "database"], "고객사목록.xls");
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

export interface TaxInvoiceRow {
  writeDate: string;
  issueDate: string;
  businessNumber: string;
  companyName: string;
  representative: string;
  address: string;
  supplyAmount: number | null;
  taxAmount: number | null;
  totalAmount: number | null;
  email1: string;
  email2: string;
}

function parseAmount(val: string): number | null {
  if (!val) return null;
  const num = parseInt(val.replace(/[^0-9-]/g, ""), 10);
  return isNaN(num) ? null : num;
}

function parseSalesInvoiceRow(sheet: XLSX.WorkSheet, row: number): TaxInvoiceRow | null {
  const writeDate = getCellValue(sheet, 0, row);
  const issueDate = getCellValue(sheet, 2, row);
  if (!writeDate && !issueDate) return null;

  return {
    writeDate,
    issueDate,
    businessNumber: getCellValue(sheet, 9, row),
    companyName: getCellValue(sheet, 11, row),
    representative: getCellValue(sheet, 12, row),
    address: getCellValue(sheet, 13, row),
    totalAmount: parseAmount(getCellValue(sheet, 14, row)),
    supplyAmount: parseAmount(getCellValue(sheet, 15, row)),
    taxAmount: parseAmount(getCellValue(sheet, 16, row)),
    email1: getCellValue(sheet, 23, row),
    email2: getCellValue(sheet, 24, row),
  };
}

function parsePurchaseInvoiceRow(sheet: XLSX.WorkSheet, row: number): TaxInvoiceRow | null {
  const writeDate = getCellValue(sheet, 0, row);
  const issueDate = getCellValue(sheet, 2, row);
  if (!writeDate && !issueDate) return null;

  return {
    writeDate,
    issueDate,
    businessNumber: getCellValue(sheet, 4, row),
    companyName: getCellValue(sheet, 6, row),
    representative: getCellValue(sheet, 7, row),
    address: getCellValue(sheet, 8, row),
    totalAmount: parseAmount(getCellValue(sheet, 14, row)),
    supplyAmount: parseAmount(getCellValue(sheet, 15, row)),
    taxAmount: parseAmount(getCellValue(sheet, 16, row)),
    email1: getCellValue(sheet, 22, row),
    email2: "",
  };
}

function parseInvoiceSheet(
  buffer: Buffer,
  rowParser: (sheet: XLSX.WorkSheet, row: number) => TaxInvoiceRow | null
): TaxInvoiceRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];

  const results: TaxInvoiceRow[] = [];
  let row = 6;
  let emptyCount = 0;
  while (emptyCount < 3) {
    const parsed = rowParser(sheet, row);
    if (!parsed) {
      emptyCount++;
      row++;
      continue;
    }
    emptyCount = 0;
    results.push(parsed);
    row++;
  }
  return results;
}

export async function parseSalesTaxInvoices(year: number): Promise<TaxInvoiceRow[]> {
  const basePath = `4.경영지원/database/${year}`;
  const files = await listFilesByPath(basePath);
  const targetFiles = files.filter(f => f.name.startsWith("매출전자세금계산서목록") && (f.name.endsWith(".xls") || f.name.endsWith(".xlsx")));

  if (targetFiles.length === 0) {
    throw new Error(`${year}년 매출전자세금계산서 파일을 찾을 수 없습니다`);
  }

  const allRows: TaxInvoiceRow[] = [];
  for (const file of targetFiles) {
    try {
      const buffer = await downloadFile(file.id);
      const rows = parseInvoiceSheet(buffer, parseSalesInvoiceRow);
      allRows.push(...rows);
      console.log(`[매출] ${file.name}: ${rows.length}건 파싱`);
    } catch (err: any) {
      console.warn(`[매출] ${file.name} 파싱 실패:`, err.message);
    }
  }
  return allRows;
}

export async function parsePurchaseTaxInvoices(year: number): Promise<TaxInvoiceRow[]> {
  const basePath = `4.경영지원/database/${year}`;
  const files = await listFilesByPath(basePath);
  const targetFiles = files.filter(f => f.name.startsWith("매입전자세금계산서목록") && (f.name.endsWith(".xls") || f.name.endsWith(".xlsx")));

  if (targetFiles.length === 0) {
    throw new Error(`${year}년 매입전자세금계산서 파일을 찾을 수 없습니다`);
  }

  const allRows: TaxInvoiceRow[] = [];
  for (const file of targetFiles) {
    try {
      const buffer = await downloadFile(file.id);
      const rows = parseInvoiceSheet(buffer, parsePurchaseInvoiceRow);
      allRows.push(...rows);
      console.log(`[매입] ${file.name}: ${rows.length}건 파싱`);
    } catch (err: any) {
      console.warn(`[매입] ${file.name} 파싱 실패:`, err.message);
    }
  }
  return allRows;
}

export interface ListPriceItem {
  category1: string;
  category2: string;
  itemCode: string;
  itemName: string;
  spec: string;
  cost: number;
  salesPrice: number;
  active: boolean;
  itemType: string;
  availableQty: number;
  testQty: number;
  inventoryUpdateDate: string;
  documents: { docType: string; url: string }[];
}

const DOC_COLUMNS: { col: number; docType: string }[] = [
  { col: 9, docType: "THUMB" },
  { col: 10, docType: "IMAGE" },
  { col: 11, docType: "VIDEO" },
  { col: 12, docType: "CERTIFICATE" },
  { col: 13, docType: "DRAWING" },
  { col: 14, docType: "MANUAL_USER" },
  { col: 15, docType: "MANUAL_INSTALL" },
  { col: 16, docType: "MANUAL_PROGRAM" },
  { col: 17, docType: "DATASHEET" },
];

export async function parseListPriceFromOneDrive(): Promise<ListPriceItem[]> {
  const buffer = await downloadFileByPath("1.영업/database/listprice.xlsx");
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const results: ListPriceItem[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");

    for (let r = 1; r <= range.e.r; r++) {
      const itemCode = getCellValue(sheet, 2, r);
      const itemName = getCellValue(sheet, 3, r);
      if (!itemCode && !itemName) continue;

      const costStr = getCellValue(sheet, 5, r);
      const priceStr = getCellValue(sheet, 6, r);
      const activeStr = getCellValue(sheet, 7, r);

      const documents: { docType: string; url: string }[] = [];
      for (const dc of DOC_COLUMNS) {
        const val = getCellValue(sheet, dc.col, r);
        if (val) documents.push({ docType: dc.docType, url: val });
      }

      const availableQtyStr = getCellValue(sheet, 18, r);
      const testQtyStr = getCellValue(sheet, 19, r);
      const updateDateStr = getCellValue(sheet, 20, r);

      results.push({
        category1: getCellValue(sheet, 0, r) || sheetName,
        category2: getCellValue(sheet, 1, r),
        itemCode: itemCode || itemName,
        itemName: itemName || itemCode,
        spec: getCellValue(sheet, 4, r),
        cost: costStr ? parseInt(costStr.replace(/[^0-9-]/g, ""), 10) || 0 : 0,
        salesPrice: priceStr ? parseInt(priceStr.replace(/[^0-9-]/g, ""), 10) || 0 : 0,
        active: activeStr.toLowerCase() === "true" || activeStr === "1",
        itemType: getCellValue(sheet, 8, r),
        availableQty: availableQtyStr ? parseInt(availableQtyStr, 10) || 0 : 0,
        testQty: testQtyStr ? parseInt(testQtyStr, 10) || 0 : 0,
        inventoryUpdateDate: updateDateStr,
        documents,
      });
    }
  }

  return results;
}

const SHEET_ORDER = ["FEEDER", "Vision", "ACC", "CS"];

const HEADER_ROW = [
  "Category1", "Category2", "ItemCode", "ItemName", "Spec",
  "Cost", "SalesPrice", "Active", "Item Type",
  "TUMB", "IMAGE", "VIDEO", "CERTIFICATE", "DRAWING",
  "MANUAL_USER", "MANUAL_INSTALL", "MANUAL_PROGRAM", "DATASHEET",
  "재고수량", "테스트수량", "재고업데이트 일자",
];

function getSheetName(category1: string): string {
  const upper = category1.toUpperCase();
  if (upper === "FEEDER") return "FEEDER";
  if (upper === "VISION") return "Vision";
  if (upper === "SERVICE") return "CS";
  return "ACC";
}

export async function writeListPriceToOneDrive(): Promise<void> {
  const items = await storage.getItemsWithDetails();
  const wb = XLSX.utils.book_new();

  const sheetData = new Map<string, any[][]>();
  for (const name of SHEET_ORDER) {
    sheetData.set(name, [HEADER_ROW]);
  }

  for (const item of items) {
    const sheetName = getSheetName(item.category1);
    if (!sheetData.has(sheetName)) {
      sheetData.set(sheetName, [HEADER_ROW]);
    }

    const docMap = new Map<string, string>();
    for (const doc of item.documents) {
      docMap.set(doc.docType, doc.url || "");
    }

    const availableQty = item.inventory.find(i => i.stockType === "AVAILABLE")?.qty ?? 0;
    const testQty = item.inventory.find(i => i.stockType === "TEST")?.qty ?? 0;
    const updatedAt = item.inventory.find(i => i.stockType === "AVAILABLE")?.updatedAt;
    const updateDateStr = updatedAt ? new Date(updatedAt).toISOString().split("T")[0] : "";

    const row = [
      item.category1,
      item.category2 || "",
      item.itemCode,
      item.itemName,
      item.spec || "",
      item.cost || 0,
      item.salesPrice || 0,
      item.active ? "true" : "false",
      item.itemType || "",
      docMap.get("THUMB") || "",
      docMap.get("IMAGE") || "",
      docMap.get("VIDEO") || "",
      docMap.get("CERTIFICATE") || "",
      docMap.get("DRAWING") || "",
      docMap.get("MANUAL_USER") || "",
      docMap.get("MANUAL_INSTALL") || "",
      docMap.get("MANUAL_PROGRAM") || "",
      docMap.get("DATASHEET") || "",
      availableQty || "",
      testQty || "",
      updateDateStr,
    ];

    sheetData.get(sheetName)!.push(row);
  }

  for (const [name, rows] of sheetData) {
    if (rows.length <= 1) continue;
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }

  if (wb.SheetNames.length === 0) {
    const ws = XLSX.utils.aoa_to_sheet([HEADER_ROW]);
    XLSX.utils.book_append_sheet(wb, ws, "FEEDER");
  }

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  await uploadFileByPath("1.영업/database/listprice.xlsx", buffer);
  console.log("[listprice] OneDrive에 listprice.xlsx 업로드 완료");
}

export async function getAvailableInvoiceYears(): Promise<number[]> {
  try {
    const folders = await listFoldersByPath("4.경영지원/database");
    return folders
      .map(f => parseInt(f.name))
      .filter(y => !isNaN(y))
      .sort((a, b) => b - a);
  } catch {
    return [];
  }
}
