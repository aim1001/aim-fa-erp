// 해외(USD) 프로젝트의 수금 계획.
// 수출은 세금계산서를 발행하지 않으므로 매출계산서(sales_invoices)는 만들지 않는다.
// 매출은 선적 정보(프로젝트의 shipDate·shipRate)로 확정하고, 계산은 shared/export-revenue.ts가 맡는다.
// 단계·날짜 규칙은 국내(collection-plan.ts)와 같고, 금액만 USD 계약금액을 비율로 나눈다.
import { storage } from "./storage";
import { calcStageDates, projectStages } from "./collection-plan";
import { num, toNumericStr, usdToKrw } from "@shared/fx";
import type { Project } from "@shared/schema";

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

// 입금 안 된 단계만 다시 만든다. 입금 완료 단계는 그대로 둔다.
export async function regenerateExportPlan(project: Project, baseDateInput?: string): Promise<{ created: number; skipped: number; deleted: number }> {
  const totalFx = num(project.contractAmountFx);
  const quoteRate = num(project.quoteRate);
  if (!(totalFx > 0)) throw new Error("USD 계약금액이 없습니다");

  const payments = (await storage.getPayments()).filter(p => p.projectId === project.id && p.type === "income");
  const locked = new Set<number>();
  payments.forEach(p => { if (p.status === "completed" && p.splitIndex) locked.add(p.splitIndex); });

  let deleted = 0;
  for (const p of payments) {
    if (p.status === "completed") continue;
    await storage.deletePayment(p.id);
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
    const { collectDate } = calcStageDates(baseDate, deliveryDate, stage.timingType, stage.timingDays, stage.afterDelivery);
    await storage.createPayment({
      type: "income",
      projectId: project.id,
      salesInvoiceId: null,
      companyName: project.customerName || "",
      description: `${project.projectNumber} ${stage.name} (USD ${amountFx.toFixed(2)})`,
      amount: usdToKrw(amountFx, quoteRate), // 입금 전까지는 견적 환율 추정액
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
