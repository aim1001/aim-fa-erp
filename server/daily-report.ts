import cron from "node-cron";
import { storage } from "./storage";
import { sendTelegramMessage, isConfigured, hasChatId } from "./telegram";
import { log } from "./index";

// 대한민국 공휴일 (YYYY-MM-DD). 음력·대체공휴일 포함.
// ⚠️ 음력/대체공휴일은 매년 바뀌므로 연말에 다음 해 목록을 확인·갱신할 것.
const KR_HOLIDAYS = new Set<string>([
  // 2026
  "2026-01-01", // 신정
  "2026-02-16", "2026-02-17", "2026-02-18", // 설날 연휴
  "2026-03-01", "2026-03-02", // 삼일절 + 대체공휴일(일)
  "2026-05-05", // 어린이날
  "2026-05-24", "2026-05-25", // 부처님오신날(일) + 대체공휴일
  "2026-06-06", // 현충일
  "2026-08-15", "2026-08-17", // 광복절(토) + 대체공휴일
  "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-28", // 추석 연휴 + 대체공휴일
  "2026-10-03", "2026-10-05", // 개천절(토) + 대체공휴일
  "2026-10-09", // 한글날
  "2026-12-25", // 성탄절
  // 2027 (연말에 재확인 필요)
  "2027-01-01",
  "2027-02-06", "2027-02-07", "2027-02-08", "2027-02-09", // 설날(2/7) 연휴 + 대체
  "2027-03-01",
  "2027-05-05", // 어린이날
  "2027-05-13", // 부처님오신날
  "2027-06-06", "2027-06-07", // 현충일(일) + 대체
  "2027-08-15", "2027-08-16", // 광복절(일) + 대체
  "2027-09-14", "2027-09-15", "2027-09-16", // 추석(9/15) 연휴
  "2027-10-03", "2027-10-04", // 개천절(일) + 대체
  "2027-10-09", "2027-10-11", // 한글날(토) + 대체
  "2027-12-25",
]);

// KST(UTC+9) 기준 오늘 날짜 YYYY-MM-DD
function kstDateStr(d: Date = new Date()): string {
  return new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// 주말 또는 공휴일이면 true
function isNonWorkingDay(dateStr: string): boolean {
  const dow = new Date(dateStr + "T00:00:00Z").getUTCDay(); // 0=일, 6=토
  if (dow === 0 || dow === 6) return true;
  return KR_HOLIDAYS.has(dateStr);
}

function won(n: number): string {
  return n.toLocaleString("ko-KR");
}

// 미발행 계산서 + 미수금 요약 메시지(HTML) 생성
export async function buildDailyReport(): Promise<string> {
  const today = kstDateStr();
  const invoices = await storage.getSalesInvoices();
  const payments = await storage.getPayments();

  // 계산서별 실수금액(완료 결제 합계)
  const collectedByInvoice = new Map<string, number>();
  for (const p of payments) {
    if (p.salesInvoiceId && p.status === "completed") {
      collectedByInvoice.set(
        p.salesInvoiceId,
        (collectedByInvoice.get(p.salesInvoiceId) || 0) + (p.actualAmount || p.amount || 0),
      );
    }
  }

  // 미발행: 발급일자(issueDate) 없음
  const unissued = invoices.filter(i => !i.issueDate);
  const unissuedTotal = unissued.reduce((s, i) => s + (i.totalAmount || 0), 0);
  const overdue = unissued
    .filter(i => i.plannedIssueDate && i.plannedIssueDate < today)
    .sort((a, b) => (a.plannedIssueDate || "").localeCompare(b.plannedIssueDate || ""));

  // 미수금: 발행됨 + status≠paid + (총액 − 실수금) > 0  (미수금 화면과 동일 기준)
  const receivables = invoices
    .filter(i => i.issueDate && i.status !== "paid")
    .map(i => ({ inv: i, outstanding: (i.totalAmount || 0) - (collectedByInvoice.get(i.id) || 0) }))
    .filter(r => r.outstanding > 0)
    .sort((a, b) => b.outstanding - a.outstanding);
  const receivableTotal = receivables.reduce((s, r) => s + r.outstanding, 0);

  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines: string[] = [];
  lines.push(`📊 <b>일일 보고 (${today})</b>`);
  lines.push("");

  // ── 미발행 계산서 (발행지연 먼저, 그 외 미발행도 함께 목록) ──
  lines.push(`🧾 <b>미발행 계산서</b> ${unissued.length}건 / ${won(unissuedTotal)}원`);
  if (unissued.length === 0) {
    lines.push("  └ 없음 ✅");
  } else {
    if (overdue.length > 0) lines.push(`  └ ⚠️ 발행지연 ${overdue.length}건`);
    const overdueIds = new Set(overdue.map(i => i.id));
    const rest = unissued
      .filter(i => !overdueIds.has(i.id))
      .sort((a, b) =>
        (a.plannedIssueDate || "9999-99-99").localeCompare(b.plannedIssueDate || "9999-99-99")
        || (b.totalAmount || 0) - (a.totalAmount || 0));
    const listed = [...overdue, ...rest].slice(0, 10);
    for (const i of listed) {
      const mark = overdueIds.has(i.id) ? "⚠️ " : "· ";
      const due = i.plannedIssueDate ? ` (예정 ${i.plannedIssueDate})` : "";
      lines.push(`     ${mark}${esc(i.companyName || "-")} ${won(i.totalAmount || 0)}원${due}`);
    }
    if (unissued.length > 10) lines.push(`     · 외 ${unissued.length - 10}건`);
  }
  lines.push("");

  // ── 미수금 ──
  lines.push(`💰 <b>미수금</b> ${receivables.length}건 / ${won(receivableTotal)}원`);
  if (receivables.length > 0) {
    receivables.slice(0, 5).forEach(r => {
      lines.push(`  · ${esc(r.inv.companyName || "-")} ${won(r.outstanding)}원`);
    });
    if (receivables.length > 5) lines.push(`  · 외 ${receivables.length - 5}건`);
  } else {
    lines.push("  └ 없음 ✅");
  }

  return lines.join("\n");
}

// 보고서 전송. force=true면 휴일에도 전송(테스트용).
export async function sendDailyReport(force = false): Promise<boolean> {
  const today = kstDateStr();
  if (!force && isNonWorkingDay(today)) {
    log(`[daily-report] ${today} 휴일/주말 → 전송 생략`, "report");
    return false;
  }
  if (!isConfigured() || !hasChatId()) {
    log("[daily-report] 텔레그램 미설정(TELEGRAM_BOT_TOKEN/CHAT_ID) → 전송 생략", "report");
    return false;
  }
  try {
    const msg = await buildDailyReport();
    const ok = await sendTelegramMessage(msg);
    log(`[daily-report] ${today} 전송 ${ok ? "성공" : "실패"}`, "report");
    return ok;
  } catch (err: any) {
    log(`[daily-report] 오류: ${err.message}`, "report");
    return false;
  }
}

// 매일 09:10 KST, 주말·공휴일 제외하고 텔레그램 일일 보고
export function startDailyReportCron(): void {
  cron.schedule("10 9 * * *", () => { void sendDailyReport(); }, { timezone: "Asia/Seoul" });
  log("[daily-report] 일일 보고 스케줄 등록 (매일 09:10 KST, 주말·공휴일 제외)", "report");
}
