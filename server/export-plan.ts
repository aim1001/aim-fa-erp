// 해외(USD) 프로젝트의 매출·수금 계획.
// 계약은 USD, 매출은 매출 인식일(선적일) 환율로 원화 확정, 수금은 실제 원화 입금액 → 차액이 환차손익.
// 국내 계획(collection-plan.ts)과 단계·날짜 규칙은 같고, 금액만 USD 기준으로 나눈다. 수출 영세율이라 세액은 0.
import { storage } from "./storage";
import { calcStageDates, projectStages } from "./collection-plan";
import { num, toNumericStr, usdToKrw } from "@shared/fx";
import type { Project } from "@shared/schema";

const STAGE_IDX: Record<string, number> = { "계약금": 1, "중도금": 2, "잔금": 3 };

// USD 총액을 비율대로 센트 단위로 나눈다. 단수 차이는 마지막 단계에 몰아 합계를 맞춘다.
export function splitUsdByRatio(totalFx: number, ratios: number[]): number[] {
  const totalCents = Math.round(totalFx * 100);
  const sum = ratios.reduce((s, r) => s + r, 0);
  if (sum <= 0) return ratios.map(() => 0);
  const cents = ratios.map(r => Math.floor((totalCents * r) / sum));
  const lastIdx = ratios.map((r, i) => (r > 0 ? i : -1)).filter(i => i >= 0).pop();
  if (lastIdx != null) cents[lastIdx] += totalCents - cents.reduce((s, c) => s + c, 0);
  return cents.map(c => c / 100);
}

// 미처리 단계(매출 미인식 + 미입금)만 다시 만든다. 매출 인식됐거나 입금된 단계는 그대로 둔다.
export async function regenerateExportPlan(project: Project, baseDateInput?: string): Promise<{ created: number; skipped: number; deleted: number }> {
  const totalFx = num(project.contractAmountFx);
  const quoteRate = num(project.quoteRate);
  if (!(totalFx > 0)) throw new Error("USD 계약금액이 없습니다");

  const customer = project.customerId ? await storage.getCustomer(project.customerId) : null;
  const invoices = (await storage.getSalesInvoices()).filter(i => i.projectId === project.id);
  const payments = (await storage.getPayments()).filter(p => p.projectId === project.id && p.type === "income");

  const locked = new Set<number>();
  invoices.forEach(i => { if (i.issueDate && i.invoiceStage && STAGE_IDX[i.invoiceStage]) locked.add(STAGE_IDX[i.invoiceStage]); });
  payments.forEach(p => { if (p.status === "completed" && p.splitIndex) locked.add(p.splitIndex); });

  let deleted = 0;
  for (const p of payments) {
    if (p.status === "completed" || (p.splitIndex && locked.has(p.splitIndex))) continue;
    await storage.deletePayment(p.id);
    deleted++;
  }
  for (const inv of invoices) {
    const idx = inv.invoiceStage ? STAGE_IDX[inv.invoiceStage] : 0;
    if (inv.issueDate || (idx && locked.has(idx))) continue;
    await storage.deleteSalesInvoice(inv.id);
    deleted++;
  }

  const stages = projectStages(project);
  const amounts = splitUsdByRatio(totalFx, stages.map(s => s.ratio || 0));
  const activeCount = amounts.filter(a => a > 0).length;
  const baseDate = baseDateInput || new Date().toISOString().split("T")[0];
  const deliveryDate = project.deliveryDate || baseDate;

  let created = 0;
  let skipped = 0;
  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    const amountFx = amounts[i];
    if (!(amountFx > 0)) continue;
    if (locked.has(i + 1)) { skipped++; continue; }
    const { issueDate, collectDate } = calcStageDates(baseDate, deliveryDate, stage.timingType, stage.timingDays, stage.afterDelivery);
    const estKrw = usdToKrw(amountFx, quoteRate); // 매출 인식 전까지는 견적 환율 추정액
    const inv = await storage.createSalesInvoice({
      projectId: project.id,
      customerId: project.customerId || null,
      companyName: customer?.companyName || project.customerName || "",
      businessNumber: customer?.businessNumber || null,
      representative: customer?.representative || null,
      address: customer?.address || null,
      issueDate: null,
      year: project.year || new Date().getFullYear(),
      item: `${project.projectNumber || ""} ${stage.name} (USD ${amountFx.toFixed(2)})`.trim(),
      supplyAmount: estKrw,
      taxAmount: 0,
      totalAmount: estKrw,
      invoiceStage: stage.name,
      plannedIssueDate: issueDate,
      status: "pending",
      currency: "USD",
      amountFx: toNumericStr(amountFx),
    });
    await storage.createPayment({
      type: "income",
      projectId: project.id,
      salesInvoiceId: inv.id,
      companyName: project.customerName || "",
      description: `${project.projectNumber} ${stage.name}`,
      amount: estKrw,
      plannedDate: collectDate,
      paymentMethod: stage.timingType || "end_of_next_month",
      status: "planned",
      splitIndex: i + 1,
      splitTotal: activeCount,
      currency: "USD",
      amountFx: toNumericStr(amountFx),
    });
    created++;
  }
  return { created, skipped, deleted };
}

// 해외 프로젝트 번호: 26-E1 (국내 26-1 순번과 별도)
export function nextExportProjectNumber(allProjects: Project[], year: number): string {
  const prefix = String(year).slice(-2);
  let maxSeq = 0;
  for (const p of allProjects) {
    if (p.year !== year) continue;
    const m = p.projectNumber?.match(/^\d+-E(\d+)/);
    if (m) maxSeq = Math.max(maxSeq, parseInt(m[1]));
  }
  return `${prefix}-E${maxSeq + 1}`;
}
