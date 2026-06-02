import { db } from "../server/db";
import { purchaseOrders, vendors } from "../shared/schema";
import { eq } from "drizzle-orm";
import * as path from "path";
import * as fs from "fs";

const BASE = "C:/Users/houns/OneDrive/2.공사/2025/발주서";

function getFolders(dir: string, status: string): { folderName: string; fullPath: string; status: string }[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory() && /^[pP]25-\d+/i.test(d.name))
    .map(d => ({ folderName: d.name, fullPath: path.join(dir, d.name), status }));
}

function parse(folderName: string) {
  const lower = folderName.toLowerCase();
  // orderNumber: p25-XXX
  const numMatch = folderName.match(/^[pP]25-(\d+)/);
  const orderNumber = numMatch ? `p25-${numMatch[1].padStart(2, "0")}` : folderName;

  // 언더스코어로 분리
  const parts = folderName.split("_");
  // parts[0] = p25-XXX, parts[1] = 업체명, parts[2..] = 품목/기타
  const vendor = parts[1] || "";

  // 입고 월 추출 (예: 8월입고, 9월입고)
  const monthMatch = folderName.match(/(\d+)월\s*입고/);
  const deliveryMonth = monthMatch ? parseInt(monthMatch[1]) : null;

  // 품목 설명: parts[2] ~ (입고월 언급 전까지)
  const descParts = parts.slice(2).filter(p => !/^\d+월.*(입고|납품|예정)/.test(p) && !/^(재고|영윤|대곤|제이원|엘파스|AUE|비엔테크|엘로이텍|넥사|대동|유일|주원|이랜텍)/.test(p));
  const description = descParts.join(" ").trim() || parts.slice(2).join(" ").trim();

  // 입고예정일 (연도-월-01 형태로 추정)
  const expectedDeliveryDate = deliveryMonth ? `2025-${String(deliveryMonth).padStart(2, "0")}-01` : null;

  return { orderNumber, vendor, description, expectedDeliveryDate, deliveryMonth };
}

async function main() {
  const allFolders = [
    ...getFolders(BASE, "일반"),
    ...getFolders(path.join(BASE, "수입품"), "수입"),
    ...getFolders(path.join(BASE, "입고완료"), "입고완료"),
    // p25-157은 루트에 있음
  ];

  // 기존 발주서 orderNumber 목록
  const existing = await db.select({ orderNumber: purchaseOrders.orderNumber }).from(purchaseOrders).where(eq(purchaseOrders.year, 2025));
  const existingNums = new Set(existing.map(e => e.orderNumber?.toLowerCase()));

  // 공급업체 목록
  const vendorList = await db.select({ id: vendors.id, companyName: vendors.companyName }).from(vendors);

  let created = 0;
  let skipped = 0;
  const preview: any[] = [];

  for (const { folderName, status } of allFolders) {
    const { orderNumber, vendor, description, expectedDeliveryDate } = parse(folderName);

    if (existingNums.has(orderNumber.toLowerCase())) {
      skipped++;
      continue;
    }

    // 업체명 매칭 (공백/주식회사 등 정규화)
    const normalize = (s: string) => (s || "").replace(/\s|\(주\)|주식회사|유한회사/g, "").toLowerCase();
    const matchedVendor = vendorList.find(v => normalize(v.companyName) === normalize(vendor));

    preview.push({
      orderNumber,
      vendor,
      vendorId: matchedVendor?.id || null,
      description,
      expectedDeliveryDate,
      status,
      receivingCompleted: status === "입고완료",
      folderName,
    });
  }

  console.log(`\n📋 등록 예정: ${preview.length}건 / 이미 존재: ${skipped}건\n`);
  console.log("샘플 (처음 10건):");
  preview.slice(0, 10).forEach(p => {
    console.log(`  ${p.orderNumber} | ${p.vendor} | ${p.description} | ${p.expectedDeliveryDate || "-"} | ${p.status} | vendorId: ${p.vendorId ? "✓" : "없음"}`);
  });

  // 실제 등록
  if (process.argv.includes("--run")) {
    for (const p of preview) {
      await db.insert(purchaseOrders).values({
        orderNumber: p.orderNumber,
        vendor: p.vendor,
        vendorId: p.vendorId,
        description: p.description,
        expectedDeliveryDate: p.expectedDeliveryDate,
        status: p.status,
        receivingCompleted: p.receivingCompleted,
        folderName: p.folderName,
        year: 2025,
      });
      created++;
    }
    console.log(`\n✅ ${created}건 등록 완료`);
  } else {
    console.log("\n실제 등록하려면 --run 옵션을 추가하세요.");
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
