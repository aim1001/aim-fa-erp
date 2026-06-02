import { db } from "../server/db";
import { purchaseOrders } from "../shared/schema";
import { eq, ilike } from "drizzle-orm";
import * as path from "path";
import * as fs from "fs";
import * as XLSX from "xlsx";

const BASE = "C:/Users/houns/OneDrive/2.공사/2025/발주서";

// 발주서 엑셀 파싱
function parseOrderXlsx(filePath: string) {
  try {
    const wb = XLSX.readFile(filePath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

    // 전체 행에서 키워드 검색
    let orderDate: string | null = null;
    let supplyAmount: number | null = null;
    let totalAmount: number | null = null;
    let deliveryTerms: string | null = null;
    let paymentTerms: string | null = null;

    for (const row of rows) {
      const cell0 = String(row[0] || "");

      // 발주일자
      if (!orderDate && cell0.includes("발주일자")) {
        const m = cell0.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
        if (m) orderDate = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
      }

      // VAT별도 (공급가액)
      if (!supplyAmount && (cell0.includes("VAT별도") || cell0.includes("VAT 별도"))) {
        for (let c = row.length - 1; c >= 0; c--) {
          const v = Number(row[c]);
          if (!isNaN(v) && v > 0) { supplyAmount = v; break; }
        }
      }

      // VAT포함 (합계)
      if (!totalAmount && (cell0.includes("VAT포함") || cell0.includes("VAT 포함"))) {
        for (let c = row.length - 1; c >= 0; c--) {
          const v = Number(row[c]);
          if (!isNaN(v) && v > 0) { totalAmount = v; break; }
        }
      }

      // 납기
      if (!deliveryTerms && cell0.match(/납기.*Delivery|[23]\.\s*납기/i)) {
        const m = cell0.match(/납기[^:：]*[:：]\s*(.+)/);
        if (m) deliveryTerms = m[1].trim();
      }

      // 지급조건
      if (!paymentTerms && cell0.match(/지급조건.*Payment|[34]\.\s*지급/i)) {
        const m = cell0.match(/지급[^:：]*[:：]\s*(.+)/);
        if (m) paymentTerms = m[1].trim().replace(/\s+/g, " ");
      }
    }

    const taxAmount = (supplyAmount && totalAmount) ? totalAmount - supplyAmount : null;

    return { orderDate, supplyAmount, taxAmount, totalAmount, deliveryTerms, paymentTerms };
  } catch {
    return null;
  }
}

// 발주서 폴더에서 p25-XXX 엑셀 찾기 (견적서 제외)
function findOrderXlsx(dir: string): string | null {
  try {
    const files = fs.readdirSync(dir);
    // p25- 로 시작하는 엑셀 우선
    const po = files.find(f => /^[pP]25-\d+.*\.xlsx$/i.test(f) && !f.includes("견적"));
    if (po) return path.join(dir, po);
    // 없으면 아무 xlsx
    const any = files.find(f => f.endsWith(".xlsx") && !f.includes("견적"));
    if (any) return path.join(dir, any);
    return null;
  } catch {
    return null;
  }
}

// 모든 발주서 폴더 수집
function collectFolders(): { orderNum: string; dir: string; receivingCompleted: boolean }[] {
  const result: { orderNum: string; dir: string; receivingCompleted: boolean }[] = [];
  const scan = (base: string, completed: boolean) => {
    if (!fs.existsSync(base)) return;
    for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const m = entry.name.match(/^[pP]25-(\d+)/i);
      if (!m) continue;
      result.push({
        orderNum: `p25-${m[1].padStart(2, "0")}`,
        dir: path.join(base, entry.name),
        receivingCompleted: completed,
      });
    }
  };
  scan(BASE, false);
  scan(path.join(BASE, "수입품"), false);
  scan(path.join(BASE, "입고완료"), true);
  return result;
}

async function main() {
  const folders = collectFolders();
  console.log(`\n총 폴더: ${folders.length}건`);

  let updated = 0, noXlsx = 0, notFound = 0, noData = 0;
  const preview: any[] = [];

  for (const { orderNum, dir, receivingCompleted } of folders) {
    const xlFile = findOrderXlsx(dir);
    if (!xlFile) { noXlsx++; continue; }

    const parsed = parseOrderXlsx(xlFile);
    if (!parsed || (!parsed.orderDate && !parsed.totalAmount)) { noData++; continue; }

    // DB에서 해당 발주서 찾기
    const existing = await db.select().from(purchaseOrders)
      .where(ilike(purchaseOrders.orderNumber, orderNum));

    if (existing.length === 0) { notFound++; continue; }

    preview.push({ orderNum, ...parsed, receivingCompleted, file: path.basename(xlFile) });

    if (process.argv.includes("--run")) {
      for (const row of existing) {
        const patch: Record<string, any> = {};
        if (parsed.orderDate && !row.orderDate) patch.orderDate = parsed.orderDate;
        if (parsed.supplyAmount && !row.supplyAmount) patch.supplyAmount = parsed.supplyAmount;
        if (parsed.taxAmount && !row.taxAmount) patch.taxAmount = parsed.taxAmount;
        if (parsed.totalAmount && !row.totalAmount) patch.totalAmount = parsed.totalAmount;
        if (parsed.paymentTerms && !row.paymentTerms) patch.paymentTerms = parsed.paymentTerms;
        if (Object.keys(patch).length > 0) {
          await db.update(purchaseOrders).set(patch).where(eq(purchaseOrders.id, row.id));
          updated++;
        }
      }
    }
  }

  console.log(`\n업데이트 대상: ${preview.length}건 | xlsx 없음: ${noXlsx}건 | DB 없음: ${notFound}건 | 데이터 없음: ${noData}건`);
  console.log("\n샘플 (처음 10건):");
  preview.slice(0, 10).forEach(p => {
    console.log(`  ${p.orderNum} | 발주일: ${p.orderDate || "-"} | 공급가: ${p.supplyAmount?.toLocaleString() || "-"} | 세액: ${p.taxAmount?.toLocaleString() || "-"} | 합계: ${p.totalAmount?.toLocaleString() || "-"} | 지급: ${p.paymentTerms || "-"}`);
  });

  if (process.argv.includes("--run")) {
    console.log(`\n✅ ${updated}건 업데이트 완료`);
  } else {
    console.log("\n실제 업데이트하려면 --run 옵션을 추가하세요.");
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
