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

export function parseSalesTaxInvoicesFromBuffer(buffer: Buffer): TaxInvoiceRow[] {
  return parseInvoiceSheet(buffer, parseSalesInvoiceRow);
}

export function parsePurchaseTaxInvoicesFromBuffer(buffer: Buffer): TaxInvoiceRow[] {
  return parseInvoiceSheet(buffer, parsePurchaseInvoiceRow);
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

export interface PurchaseListItem {
  category1: string;
  category2: string;
  itemName: string;
  brand: string;
  originCountry: string;
  itemCode: string;
  spec: string;
  defaultVendor: string;
  cost: number;
  currency: string;
  leadTimeDays: number | null;
  isStockItem: boolean;
  itemType: string;
  unit: string;
  active: boolean;
  safetyStock: number | null;
  moq: number | null;
  remark: string;
}

export async function parsePurchaseListFromOneDrive(): Promise<PurchaseListItem[]> {
  const buffer = await downloadFileByPath("2.공사/database/purchaselist.xlsx");
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const results: PurchaseListItem[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");

    for (let r = 1; r <= range.e.r; r++) {
      const itemName = getCellValue(sheet, 2, r);
      const itemCode = getCellValue(sheet, 5, r);
      if (!itemName && !itemCode) continue;

      const costStr = getCellValue(sheet, 8, r);
      const leadTimeStr = getCellValue(sheet, 10, r);
      const isStockStr = getCellValue(sheet, 11, r);
      const activeStr = getCellValue(sheet, 14, r);
      const safetyStockStr = getCellValue(sheet, 15, r);
      const moqStr = getCellValue(sheet, 16, r);

      results.push({
        category1: getCellValue(sheet, 0, r) || sheetName,
        category2: getCellValue(sheet, 1, r),
        itemName: itemName || itemCode,
        brand: getCellValue(sheet, 3, r),
        originCountry: getCellValue(sheet, 4, r),
        itemCode: itemCode || itemName,
        spec: getCellValue(sheet, 6, r),
        defaultVendor: getCellValue(sheet, 7, r),
        cost: costStr ? parseInt(costStr.replace(/[^0-9-]/g, ""), 10) || 0 : 0,
        currency: getCellValue(sheet, 9, r) || "won",
        leadTimeDays: leadTimeStr ? parseInt(leadTimeStr, 10) || null : null,
        isStockItem: isStockStr.toLowerCase() === "true" || isStockStr === "1",
        itemType: getCellValue(sheet, 12, r),
        unit: getCellValue(sheet, 13, r) || "ea",
        active: activeStr === "" || activeStr.toLowerCase() === "true" || activeStr === "1",
        safetyStock: safetyStockStr ? parseInt(safetyStockStr, 10) || null : null,
        moq: moqStr ? parseInt(moqStr, 10) || null : null,
        remark: getCellValue(sheet, 17, r),
      });
    }
  }

  return results;
}

const PURCHASE_HEADER_ROW = [
  "대분류", "소분류", "품명", "브랜드", "원산지",
  "품목코드", "사양", "기본거래처", "단가", "통화",
  "리드타임(일)", "재고품", "유형", "단위", "활성",
  "안전재고", "MOQ", "비고",
];

const PURCHASE_SHEET_ORDER = ["VALVE", "PUMP", "SENSOR", "ETC"];

export async function writePurchaseListToOneDrive(): Promise<void> {
  const items = await storage.getPurchaseItems();
  const wb = XLSX.utils.book_new();

  const sheetData = new Map<string, any[][]>();
  for (const name of PURCHASE_SHEET_ORDER) {
    sheetData.set(name, [PURCHASE_HEADER_ROW]);
  }

  for (const item of items) {
    const sheetName = item.category1 || "ETC";
    if (!sheetData.has(sheetName)) {
      sheetData.set(sheetName, [PURCHASE_HEADER_ROW]);
    }

    const row = [
      item.category1 || "",
      item.category2 || "",
      item.itemName,
      item.brand || "",
      item.originCountry || "",
      item.itemCode,
      item.spec || "",
      item.defaultVendor || "",
      item.cost || 0,
      item.currency || "won",
      item.leadTimeDays ?? "",
      item.isStockItem ? "true" : "false",
      item.itemType || "",
      item.unit || "ea",
      item.active ? "true" : "false",
      item.safetyStock ?? "",
      item.moq ?? "",
      item.remark || "",
    ];

    sheetData.get(sheetName)!.push(row);
  }

  for (const [name, rows] of sheetData) {
    if (rows.length <= 1) continue;
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }

  if (wb.SheetNames.length === 0) {
    const ws = XLSX.utils.aoa_to_sheet([PURCHASE_HEADER_ROW]);
    XLSX.utils.book_append_sheet(wb, ws, "ETC");
  }

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  await uploadFileByPath("2.공사/database/purchaselist.xlsx", buffer);
  console.log("[purchaselist] OneDrive에 purchaselist.xlsx 업로드 완료");
}

export interface BankStatementRow {
  date: string;
  type: "income" | "expense";
  amount: number;
  companyName: string | null;
  description: string | null;
}

export function parseBankStatement(buffer: Buffer, year: number, month: number): BankStatementRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];

  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
  const rows: BankStatementRow[] = [];

  const headerRow = range.s.r;
  const headers: string[] = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = sheet[XLSX.utils.encode_cell({ r: headerRow, c })];
    headers.push(cell ? String(cell.v || "").trim() : "");
  }

  let dateCol = -1, depositCol = -1, withdrawalCol = -1, descCol = -1, memoCol = -1, balanceCol = -1;

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].replace(/\s+/g, "");
    if (h.includes("거래일") || h.includes("일자") || h.includes("날짜") || h === "거래일시") dateCol = i;
    else if (h.includes("입금") || h.includes("들어온") || h === "입금액" || h === "입금(원)") depositCol = i;
    else if (h.includes("출금") || h.includes("나간") || h === "출금액" || h === "출금(원)") withdrawalCol = i;
    else if (h.includes("적요") || h.includes("내용") || h.includes("거래내용") || h.includes("메모")) {
      if (descCol === -1) descCol = i;
      else memoCol = i;
    }
    else if (h.includes("잔액") || h.includes("잔고")) balanceCol = i;
    else if (h.includes("상대") || h.includes("받는") || h.includes("보내는") || h.includes("거래처")) {
      if (memoCol === -1) memoCol = i;
    }
  }

  if (dateCol === -1) {
    for (let i = 0; i < headers.length; i++) {
      if (headers[i]) { dateCol = i; break; }
    }
  }
  if (depositCol === -1 && withdrawalCol === -1) {
    for (let i = 1; i < headers.length; i++) {
      if (depositCol === -1 && headers[i]) { depositCol = i; continue; }
      if (withdrawalCol === -1 && headers[i]) { withdrawalCol = i; break; }
    }
  }

  const monthStr = String(month).padStart(2, "0");

  for (let r = headerRow + 1; r <= range.e.r; r++) {
    const getVal = (c: number) => {
      if (c < 0) return null;
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      return cell ? cell.v : null;
    };

    const rawDate = getVal(dateCol);
    if (!rawDate) continue;

    let dateStr = "";
    if (typeof rawDate === "number") {
      const excelEpoch = new Date(1899, 11, 30);
      const jsDate = new Date(excelEpoch.getTime() + rawDate * 86400000);
      dateStr = `${jsDate.getFullYear()}-${String(jsDate.getMonth() + 1).padStart(2, "0")}-${String(jsDate.getDate()).padStart(2, "0")}`;
    } else {
      const s = String(rawDate).trim();
      const match = s.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
      if (match) {
        dateStr = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
      } else {
        const match2 = s.match(/(\d{1,2})[-./](\d{1,2})/);
        if (match2) {
          dateStr = `${year}-${match2[1].padStart(2, "0")}-${match2[2].padStart(2, "0")}`;
        }
      }
    }

    if (!dateStr) continue;

    const parseAmount = (val: any): number => {
      if (val === null || val === undefined || val === "") return 0;
      if (typeof val === "number") return Math.abs(Math.round(val));
      return Math.abs(Math.round(Number(String(val).replace(/[^0-9.-]/g, "")))) || 0;
    };

    const deposit = parseAmount(getVal(depositCol));
    const withdrawal = parseAmount(getVal(withdrawalCol));

    if (deposit === 0 && withdrawal === 0) continue;

    const desc = getVal(descCol);
    const memo = getVal(memoCol);

    const type: "income" | "expense" = deposit > 0 ? "income" : "expense";
    const amount = deposit > 0 ? deposit : withdrawal;

    rows.push({
      date: dateStr,
      type,
      amount,
      companyName: memo ? String(memo).trim() : null,
      description: desc ? String(desc).trim() : null,
    });
  }

  return rows;
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

export interface KBBankTransactionRow {
  txDate: string;
  txTime: string | null;
  description: string | null;
  counterparty: string | null;
  debitAmount: number;
  creditAmount: number;
  balance: number | null;
  importHash: string;
}

function normalizeBankDate(raw: any): string | null {
  if (!raw && raw !== 0) return null;
  if (typeof raw === "number") {
    if (raw > 100000000) {
      const s = String(Math.floor(raw));
      if (s.length === 8) {
        return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
      }
    }
    const excelEpoch = new Date(1899, 11, 30);
    const jsDate = new Date(excelEpoch.getTime() + raw * 86400000);
    const y = jsDate.getFullYear();
    if (y < 2000 || y > 2100) return null;
    return `${y}-${String(jsDate.getMonth() + 1).padStart(2, "0")}-${String(jsDate.getDate()).padStart(2, "0")}`;
  }
  const s = String(raw).trim().replace(/\./g, "/");
  const m1 = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (m1) return `${m1[1]}-${m1[2].padStart(2, "0")}-${m1[3].padStart(2, "0")}`;
  const m2 = s.match(/^(\d{8})$/);
  if (m2) return `${m2[1].slice(0, 4)}-${m2[1].slice(4, 6)}-${m2[1].slice(6, 8)}`;
  return null;
}

function normalizeBankAmount(raw: any): number {
  if (raw === null || raw === undefined || raw === "") return 0;
  if (typeof raw === "number") return Math.abs(Math.round(raw));
  const s = String(raw).replace(/,/g, "").trim();
  if (!s || s === "-" || s === "0" || s === "") return 0;
  const n = parseFloat(s);
  return isNaN(n) ? 0 : Math.abs(Math.round(n));
}

function makeImportHash(txDate: string, debit: number, credit: number, description: string | null): string {
  const crypto = require("crypto");
  const amount = debit > 0 ? debit : credit;
  const raw = `${txDate}|${amount}|${description ?? ""}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

export function parseKBBankStatementFromBuffer(buffer: Buffer): KBBankTransactionRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false, raw: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];

  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
  const results: KBBankTransactionRow[] = [];

  const getCell = (r: number, c: number): any => {
    const cell = sheet[XLSX.utils.encode_cell({ r, c })];
    if (!cell) return null;
    return cell.v !== undefined ? cell.v : null;
  };

  const getCellStr = (r: number, c: number): string => {
    const v = getCell(r, c);
    return v !== null && v !== undefined ? String(v).trim() : "";
  };

  let headerRow = -1;
  let dateCol = -1, timeCol = -1, descCol = -1, counterpartyCol = -1;
  let debitCol = -1, creditCol = -1, balanceCol = -1;

  for (let r = range.s.r; r <= Math.min(range.s.r + 10, range.e.r); r++) {
    const rowVals: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      rowVals.push(getCellStr(r, c).replace(/\s+/g, ""));
    }
    const joined = rowVals.join("|");
    if (joined.includes("거래일자") || joined.includes("거래일시") || joined.includes("날짜")) {
      headerRow = r;
      for (let c = range.s.c; c <= range.e.c; c++) {
        const h = rowVals[c - range.s.c];
        if (h.includes("거래일") || h === "날짜") dateCol = c;
        else if (h.includes("시각") || h.includes("시간") || h === "거래시각") timeCol = c;
        else if (h.includes("찾으신") || h.includes("출금") || h === "출금액" || h === "지급금액") debitCol = c;
        else if (h.includes("맡기신") || h.includes("입금") || h === "입금액" || h === "수취금액") creditCol = c;
        else if (h.includes("잔액") || h.includes("잔고")) balanceCol = c;
        else if (h.includes("기재내용") || h.includes("내용") || h.includes("메모") || h.includes("이름")) {
          if (counterpartyCol === -1) counterpartyCol = c;
        }
        else if (h.includes("적요") || h.includes("거래내용") || h.includes("구분")) {
          if (descCol === -1) descCol = c;
        }
      }
      break;
    }
  }

  if (headerRow === -1 || dateCol === -1) {
    console.warn("[KB parser] 헤더를 찾을 수 없습니다");
    return [];
  }

  if (descCol === -1 && counterpartyCol === -1) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      if (c !== dateCol && c !== timeCol && c !== debitCol && c !== creditCol && c !== balanceCol) {
        if (descCol === -1) { descCol = c; continue; }
        if (counterpartyCol === -1) { counterpartyCol = c; break; }
      }
    }
  }

  for (let r = headerRow + 1; r <= range.e.r; r++) {
    const rawDate = getCell(r, dateCol);
    if (rawDate === null || rawDate === undefined || rawDate === "") continue;

    const txDate = normalizeBankDate(rawDate);
    if (!txDate) continue;

    const txTime = timeCol >= 0 ? (getCellStr(r, timeCol) || null) : null;
    const description = descCol >= 0 ? (getCellStr(r, descCol) || null) : null;
    const counterparty = counterpartyCol >= 0 ? (getCellStr(r, counterpartyCol) || null) : null;
    const debitAmount = debitCol >= 0 ? normalizeBankAmount(getCell(r, debitCol)) : 0;
    const creditAmount = creditCol >= 0 ? normalizeBankAmount(getCell(r, creditCol)) : 0;
    const balance = balanceCol >= 0 ? normalizeBankAmount(getCell(r, balanceCol)) : null;

    if (debitAmount === 0 && creditAmount === 0) continue;

    const importHash = makeImportHash(txDate, debitAmount, creditAmount, description);

    results.push({
      txDate,
      txTime,
      description,
      counterparty,
      debitAmount,
      creditAmount,
      balance: balance !== null ? balance : null,
      importHash,
    });
  }

  console.log(`[KB parser] ${results.length}건 파싱 완료`);
  return results;
}
