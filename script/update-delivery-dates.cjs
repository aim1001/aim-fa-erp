const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const BASE_2025 = "C:/Users/houns/OneDrive/2.공사/2025/발주서";
const BASE_2026 = "C:/Users/houns/OneDrive/2.공사/2026/발주서";
const fs = require("fs");
const path = require("path");

function collectFolders(base, yearPrefix) {
  const result = [];
  const scan = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (!new RegExp(`^[pi]${yearPrefix}-`, "i").test(entry.name)) continue;
      result.push({ folderName: entry.name, dir: path.join(dir, entry.name) });
    }
  };
  scan(base);
  scan(path.join(base, "수입품"));
  scan(path.join(base, "수입"));
  scan(path.join(base, "입고완료"));
  return result;
}

// 폴더명에서 납기 월 파싱: "1월입고", "2월 입고예정" 등
function parseDeliveryMonth(folderName) {
  const m = folderName.match(/(\d{1,2})월\s*입고/);
  return m ? parseInt(m[1]) : null;
}

// 발주일 기준으로 납기 연도 추론
// - 납기월이 발주월보다 작거나 같으면 → 발주연도+1
// - 납기월이 발주월보다 크면 → 발주연도와 동일
function inferDeliveryYear(orderDate, deliveryMonth) {
  if (!orderDate || !deliveryMonth) return null;
  const orderYear = parseInt(orderDate.substring(0, 4));
  const orderMonth = parseInt(orderDate.substring(5, 7));
  // 납기월이 발주월보다 작을 때만 내년 (같은 달이나 이후면 같은 해)
  if (deliveryMonth < orderMonth) return orderYear + 1;
  return orderYear;
}

async function main() {
  const isRun = process.argv.includes("--run");
  const preview = [];

  for (const [base, yearPrefix] of [[BASE_2025, "25"], [BASE_2026, "26"]]) {
    const folders = collectFolders(base, yearPrefix);

    for (const { folderName } of folders) {
      const numMatch = folderName.match(new RegExp(`^[pi]${yearPrefix}-(\\d+)`, "i"));
      if (!numMatch) continue;
      const orderNum = `p${yearPrefix}-${numMatch[1].padStart(2, "0")}`;

      const deliveryMonth = parseDeliveryMonth(folderName);
      if (!deliveryMonth) continue;

      // DB에서 expected_delivery_date가 null인 것만 대상
      const res = await pool.query(
        "SELECT id, order_date, expected_delivery_date FROM purchase_orders WHERE order_number ILIKE $1 AND expected_delivery_date IS NULL",
        [orderNum]
      );
      if (res.rows.length === 0) continue;

      for (const row of res.rows) {
        const deliveryYear = inferDeliveryYear(row.order_date, deliveryMonth);
        if (!deliveryYear) continue;
        const deliveryDate = `${deliveryYear}-${String(deliveryMonth).padStart(2, "0")}-01`;
        preview.push({ orderNum, folderName: folderName.substring(0, 50), orderDate: row.order_date, deliveryDate, id: row.id });

        if (isRun) {
          await pool.query(
            "UPDATE purchase_orders SET expected_delivery_date = $1 WHERE id = $2",
            [deliveryDate, row.id]
          );
        }
      }
    }
  }

  console.log(`\n납기일 업데이트 대상: ${preview.length}건`);
  console.log("\n전체 목록:");
  preview.forEach(p =>
    console.log(`  ${p.orderNum} | 발주일: ${p.orderDate || "-"} | 납기일(추론): ${p.deliveryDate} | ${p.folderName}`)
  );

  if (isRun) console.log(`\n✅ ${preview.length}건 납기일 업데이트 완료`);
  else console.log("\n실제 처리하려면 --run 추가하세요.");

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
