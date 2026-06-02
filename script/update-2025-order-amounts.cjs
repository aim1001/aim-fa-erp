const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const BASE = "C:/Users/houns/OneDrive/2.공사/2025/발주서";

function parseOrderXlsx(filePath) {
  try {
    const wb = XLSX.readFile(filePath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

    let orderDate = null, supplyAmount = null, totalAmount = null;
    let deliveryTerms = null, paymentTerms = null;

    for (const row of rows) {
      const c0 = String(row[0] || "");

      if (!orderDate && c0.includes("발주일자")) {
        const m = c0.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
        if (m) orderDate = `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`;
      }
      if (!supplyAmount && (c0.includes("VAT별도") || c0.includes("VAT 별도"))) {
        for (let c = row.length - 1; c >= 0; c--) {
          const v = Number(row[c]);
          if (!isNaN(v) && v > 0) { supplyAmount = v; break; }
        }
      }
      if (!totalAmount && (c0.includes("VAT포함") || c0.includes("VAT 포함"))) {
        for (let c = row.length - 1; c >= 0; c--) {
          const v = Number(row[c]);
          if (!isNaN(v) && v > 0) { totalAmount = v; break; }
        }
      }
      if (!deliveryTerms && (c0.includes("납기") && (c0.includes("Delivery") || c0.match(/[23]\.\s*납기/)))) {
        const m = c0.match(/납기[^:：]*[:：]\s*(.+)/);
        if (m) deliveryTerms = m[1].trim();
      }
      if (!paymentTerms && (c0.includes("지급") && (c0.includes("Payment") || c0.match(/[34]\.\s*지급/)))) {
        const m = c0.match(/지급[^:：]*[:：]\s*(.+)/);
        if (m) paymentTerms = m[1].trim().replace(/\s+/g, " ");
      }
    }

    const taxAmount = (supplyAmount && totalAmount) ? totalAmount - supplyAmount : null;
    return { orderDate, supplyAmount, taxAmount, totalAmount, deliveryTerms, paymentTerms };
  } catch (e) {
    return null;
  }
}

function findOrderXlsx(dir) {
  try {
    const files = fs.readdirSync(dir);
    const po = files.find(f => /^[pP]25-\d+.*\.xlsx$/i.test(f) && !f.includes("견적"));
    if (po) return path.join(dir, po);
    const any = files.find(f => f.endsWith(".xlsx") && !f.includes("견적") && !f.includes("거래명세"));
    return any ? path.join(dir, any) : null;
  } catch { return null; }
}

function collectFolders() {
  const result = [];
  const scan = (base, completed) => {
    if (!fs.existsSync(base)) return;
    for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const m = entry.name.match(/^[pP]25-(\d+)/i);
      if (!m) continue;
      result.push({ orderNum: `p25-${m[1].padStart(2,"0")}`, dir: path.join(base, entry.name), receivingCompleted: completed });
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
  const preview = [];
  const isRun = process.argv.includes("--run");

  for (const { orderNum, dir } of folders) {
    const xlFile = findOrderXlsx(dir);
    if (!xlFile) { noXlsx++; continue; }

    const parsed = parseOrderXlsx(xlFile);
    if (!parsed || (!parsed.orderDate && !parsed.totalAmount)) { noData++; continue; }

    // DB에서 해당 발주서 찾기
    const res = await pool.query(
      "SELECT id, order_date, supply_amount, tax_amount, total_amount, payment_terms FROM purchase_orders WHERE LOWER(order_number) = LOWER($1)",
      [orderNum]
    );
    if (res.rows.length === 0) { notFound++; continue; }

    preview.push({ orderNum, ...parsed, file: path.basename(xlFile) });

    if (isRun) {
      for (const row of res.rows) {
        const sets = [], vals = [];
        let idx = 1;
        if (parsed.orderDate && !row.order_date) { sets.push(`order_date=$${idx++}`); vals.push(parsed.orderDate); }
        if (parsed.supplyAmount && !row.supply_amount) { sets.push(`supply_amount=$${idx++}`); vals.push(parsed.supplyAmount); }
        if (parsed.taxAmount && !row.tax_amount) { sets.push(`tax_amount=$${idx++}`); vals.push(parsed.taxAmount); }
        if (parsed.totalAmount && !row.total_amount) { sets.push(`total_amount=$${idx++}`); vals.push(parsed.totalAmount); }
        if (parsed.paymentTerms && !row.payment_terms) { sets.push(`payment_terms=$${idx++}`); vals.push(parsed.paymentTerms); }
        if (sets.length > 0) {
          vals.push(row.id);
          await pool.query(`UPDATE purchase_orders SET ${sets.join(", ")} WHERE id=$${idx}`, vals);
          updated++;
        }
      }
    }
  }

  console.log(`업데이트 대상: ${preview.length}건 | xlsx 없음: ${noXlsx}건 | DB 없음: ${notFound}건 | 데이터 없음: ${noData}건`);
  console.log("\n샘플 (처음 15건):");
  preview.slice(0, 15).forEach(p => {
    console.log(`  ${p.orderNum} | 발주일: ${p.orderDate||"-"} | 공급가: ${p.supplyAmount?.toLocaleString()||"-"} | 세액: ${p.taxAmount?.toLocaleString()||"-"} | 합계: ${p.totalAmount?.toLocaleString()||"-"} | 지급: ${p.paymentTerms||"-"}`);
  });

  if (isRun) console.log(`\n✅ ${updated}건 업데이트 완료`);
  else console.log("\n실제 업데이트하려면 --run 옵션을 추가하세요.");

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
