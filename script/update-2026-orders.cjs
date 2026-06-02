const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const BASE = "C:/Users/houns/OneDrive/2.공사/2026/발주서";

function parseOrderXlsx(filePath) {
  try {
    const wb = XLSX.readFile(filePath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    let orderDate=null, supplyAmount=null, totalAmount=null, deliveryTerms=null, paymentTerms=null;
    for (const row of rows) {
      const c0 = String(row[0]||"");
      if (!orderDate && c0.includes("발주일자")) {
        const m = c0.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
        if (m) orderDate = `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`;
      }
      if (!supplyAmount && (c0.includes("VAT별도")||c0.includes("VAT 별도"))) {
        for (let c=row.length-1;c>=0;c--) { const v=Number(row[c]); if(!isNaN(v)&&v>0){supplyAmount=v;break;} }
      }
      if (!totalAmount && (c0.includes("VAT포함")||c0.includes("VAT 포함"))) {
        for (let c=row.length-1;c>=0;c--) { const v=Number(row[c]); if(!isNaN(v)&&v>0){totalAmount=v;break;} }
      }
      if (!deliveryTerms && c0.includes("납기") && (c0.includes("Delivery")||/[23]\.\s*납기/.test(c0))) {
        const m=c0.match(/납기[^:：]*[:：]\s*(.+)/); if(m) deliveryTerms=m[1].trim();
      }
      if (!paymentTerms && c0.includes("지급") && (c0.includes("Payment")||/[34]\.\s*지급/.test(c0))) {
        const m=c0.match(/지급[^:：]*[:：]\s*(.+)/); if(m) paymentTerms=m[1].trim().replace(/\s+/g," ");
      }
    }
    const taxAmount=(supplyAmount&&totalAmount)?totalAmount-supplyAmount:null;
    return {orderDate,supplyAmount,taxAmount,totalAmount,deliveryTerms,paymentTerms};
  } catch(e) { return null; }
}

function findXlsx(dir) {
  try {
    const files = fs.readdirSync(dir);
    const po = files.find(f => /^[pi]26-.*\.xlsx$/i.test(f) && !f.includes("견적"));
    if (po) return path.join(dir, po);
    const any = files.find(f => f.endsWith(".xlsx") && !f.includes("견적") && !f.includes("거래명세"));
    return any ? path.join(dir, any) : null;
  } catch { return null; }
}

function collectFolders() {
  const result = [];
  const scan = (base, completed) => {
    if (!fs.existsSync(base)) return;
    for (const entry of fs.readdirSync(base, {withFileTypes:true})) {
      if (!entry.isDirectory()) continue;
      if (!/^[piPI]26-/i.test(entry.name)) continue;
      result.push({ folderName: entry.name, dir: path.join(base, entry.name), receivingCompleted: completed });
    }
  };
  scan(BASE, false);
  scan(path.join(BASE,"수입"), false);
  scan(path.join(BASE,"입고완료"), true);
  return result;
}

async function main() {
  const folders = collectFolders();
  console.log(`\n총 폴더: ${folders.length}건`);

  let created=0, updated=0, noXlsx=0, notFound=0, noData=0;
  const isRun = process.argv.includes("--run");
  const preview = [];

  for (const {folderName, dir, receivingCompleted} of folders) {
    const m = folderName.match(/^([piPI]26-[\d]+)/i);
    const orderNum = m ? m[1].toLowerCase() : null;
    if (!orderNum) { notFound++; continue; }

    const xlFile = findXlsx(dir);
    if (!xlFile) { noXlsx++; continue; }

    const parsed = parseOrderXlsx(xlFile);
    if (!parsed || (!parsed.orderDate && !parsed.totalAmount)) { noData++; continue; }

    // DB에서 찾기 (ILIKE로 대소문자 무시)
    const res = await pool.query(
      "SELECT id, order_date, supply_amount, tax_amount, total_amount, payment_terms FROM purchase_orders WHERE order_number ILIKE $1",
      [orderNum]
    );

    const parts = folderName.split("_");
    const vendor = parts[1] || "";
    const description = parts.slice(2).join(" ").trim();

    if (res.rows.length === 0) {
      preview.push({ orderNum, vendor, ...parsed, status: "NEW", file: path.basename(xlFile) });
      if (isRun) {
        await pool.query(
          "INSERT INTO purchase_orders (order_number, vendor, description, order_date, supply_amount, tax_amount, total_amount, payment_terms, status, receiving_completed, year) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
          [orderNum, vendor, description, parsed.orderDate, parsed.supplyAmount, parsed.taxAmount, parsed.totalAmount, parsed.paymentTerms, receivingCompleted?"입고완료":"일반", receivingCompleted, 2026]
        );
        created++;
      }
    } else {
      preview.push({ orderNum, vendor, ...parsed, status: "UPDATE", file: path.basename(xlFile) });
      if (isRun) {
        for (const row of res.rows) {
          const sets=[], vals=[];
          let idx=1;
          if (parsed.orderDate   && !row.order_date)    { sets.push(`order_date=$${idx++}`);    vals.push(parsed.orderDate); }
          if (parsed.supplyAmount && !row.supply_amount) { sets.push(`supply_amount=$${idx++}`); vals.push(parsed.supplyAmount); }
          if (parsed.taxAmount    && !row.tax_amount)    { sets.push(`tax_amount=$${idx++}`);    vals.push(parsed.taxAmount); }
          if (parsed.totalAmount  && !row.total_amount)  { sets.push(`total_amount=$${idx++}`);  vals.push(parsed.totalAmount); }
          if (parsed.paymentTerms && !row.payment_terms) { sets.push(`payment_terms=$${idx++}`); vals.push(parsed.paymentTerms); }
          if (sets.length > 0) {
            vals.push(row.id);
            await pool.query(`UPDATE purchase_orders SET ${sets.join(", ")} WHERE id=$${idx}`, vals);
            updated++;
          }
        }
      }
    }
  }

  const newCount = preview.filter(p=>p.status==="NEW").length;
  const updCount = preview.filter(p=>p.status==="UPDATE").length;
  console.log(`신규: ${newCount}건 | 업데이트: ${updCount}건 | xlsx없음: ${noXlsx}건 | 데이터없음: ${noData}건`);
  console.log("\n샘플 (처음 15건):");
  preview.slice(0,15).forEach(p =>
    console.log(`  [${p.status}] ${p.orderNum} | ${p.vendor} | 발주일: ${p.orderDate||"-"} | 합계: ${p.totalAmount?.toLocaleString()||"-"} | 지급: ${p.paymentTerms||"-"}`)
  );

  if (isRun) console.log(`\n✅ 신규 ${created}건 등록 / 업데이트 ${updated}건 완료`);
  else console.log("\n실제 처리하려면 --run 추가하세요.");

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
