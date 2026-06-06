import cron from "node-cron";
import { pool } from "./db";
import { uploadFileToFolderByPath } from "./onedrive";
import { log } from "./index";

// 백업할 테이블 목록 (순서대로 — 참조 무결성 고려)
const BACKUP_TABLES = [
  "customers",
  "companies",
  "staff",
  "vendors",
  "vendor_contacts",
  "projects",
  "project_items",
  "project_tasks",
  "inquiries",
  "inquiry_files",
  "inquiry_memos",
  "inquiry_tasks",
  "item_master",
  "item_inventory",
  "item_document",
  "purchase_items",
  "item_components",
  "purchase_orders",
  "purchase_order_items",
  "purchase_order_invoice_links",
  "purchase_order_tasks",
  "sales_invoices",
  "purchase_invoices",
  "payments",
  "recurring_expenses",
  "bank_accounts",
  "bank_transactions",
  "quotations",
  "quotation_items",
  "finance_tasks",
  "monthly_balances",
  "calendar_events",
  "company_settings",
  "telegram_memos",
];

const ONEDRIVE_BACKUP_PATH = "AIM-ERP/백업";

export async function runBackup(): Promise<{ label: string; rows: number }[]> {
  const snapshot: Record<string, any[]> = {};
  const summary: { label: string; rows: number }[] = [];

  for (const table of BACKUP_TABLES) {
    try {
      const result = await pool.query(`SELECT * FROM ${table}`);
      snapshot[table] = result.rows;
      summary.push({ label: table, rows: result.rows.length });
    } catch (err: any) {
      // 테이블이 아직 없는 경우 (마이그레이션 전) 조용히 skip
      log(`[backup] skip ${table}: ${err.message}`, "backup");
      snapshot[table] = [];
      summary.push({ label: table, rows: 0 });
    }
  }

  const now = new Date();
  const label = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const fileName = `backup_${label}.json`;

  const payload = {
    createdAt: now.toISOString(),
    label,
    tables: snapshot,
  };

  const content = Buffer.from(JSON.stringify(payload, null, 2), "utf-8");
  await uploadFileToFolderByPath(ONEDRIVE_BACKUP_PATH, fileName, content);

  log(`[backup] 완료 → OneDrive ${ONEDRIVE_BACKUP_PATH}/${fileName} (${(content.length / 1024).toFixed(0)} KB)`, "backup");
  return summary;
}

// 매월 1일 오전 3시 실행
export function startBackupCron(): void {
  cron.schedule("0 3 1 * *", async () => {
    log("[backup] 월별 자동 백업 시작", "backup");
    try {
      await runBackup();
    } catch (err: any) {
      log(`[backup] 오류: ${err.message}`, "backup");
    }
  }, { timezone: "Asia/Seoul" });

  log("[backup] 월별 자동 백업 스케줄 등록 (매월 1일 03:00 KST)", "backup");
}
