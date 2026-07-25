import { storage } from "./storage";

// 계약조건(단계별 시기) → 예정일 계산
export function calcPaymentDate(baseDate: string, timingType: string | null, timingDays: number | null): string {
  // UTC 고정으로 계산 (로컬 TZ에서 월말이 하루 밀리는 off-by-one 방지).
  const base = new Date(baseDate + "T00:00:00Z");
  if (!timingType) return baseDate;
  const iso = (d: Date) => d.toISOString().split("T")[0];
  const addDays = (n: number) => { const d = new Date(base); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
  switch (timingType) {
    case "end_of_next_month": // 익월말
      return iso(new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 2, 0)));
    case "end_of_month": // 월말
      return iso(new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)));
    case "two_weeks": // 2주이내
      return addDays(14);
    case "specific_days": // 일자지정 (기본 30일)
      return addDays(timingDays || 30);
    case "within_days": // N일이내
      return addDays(timingDays || 0);
    default:
      return baseDate;
  }
}

// 단계별 두 날짜를 함께 계산 (계산서 발행일 ≠ 수금일).
// - 계산서 발행예정일 = 공급시기(refDate): 납품후면 납품일, 아니면 계약/전환일(baseDate)
// - 수금 예정일       = 공급시기 + 결제조건(timing)
export function calcStageDates(
  baseDate: string,
  deliveryDate: string,
  timingType: string | null,
  timingDays: number | null,
  afterDelivery: string | null,
): { issueDate: string; collectDate: string } {
  const refDate = afterDelivery === "true" ? deliveryDate : baseDate;
  return { issueDate: refDate, collectDate: calcPaymentDate(refDate, timingType, timingDays) };
}

// 단계별 공급가액(VAT별도): 금액이 지정되면 금액 우선, 없으면 비율로 환산
export function stageSupply(totalAmount: number, ratio: number | null, amount: number | null): number {
  if (amount != null && amount > 0) return amount;
  if (ratio != null && ratio > 0) return Math.round((totalAmount * ratio) / 100);
  return 0;
}

export type StageDef = { name: string; ratio: number | null; amount: number | null; timingType: string | null; timingDays: number | null; afterDelivery: string | null };
export function projectStages(project: any): StageDef[] {
  return [
    { name: "계약금", ratio: project.depositRatio, amount: project.depositAmount, timingType: project.depositTimingType, timingDays: project.depositTimingDays, afterDelivery: null },
    { name: "중도금", ratio: project.midRatio, amount: project.midAmount, timingType: project.midTimingType, timingDays: project.midTimingDays, afterDelivery: project.midAfterDelivery },
    { name: "잔금", ratio: project.finalRatio, amount: project.finalAmount, timingType: project.finalTimingType, timingDays: project.finalTimingDays, afterDelivery: project.finalAfterDelivery },
  ];
}

// 수금계획 재생성: 미완료(planned) 수금만 새 조건으로 다시 생성. 입금완료 단계는 그대로 유지.
export async function regenerateCollectionPlan(project: any, baseDateInput?: string): Promise<{ created: number; skipped: number; deleted: number }> {
  const planCustomer = project.customerId ? await storage.getCustomer(project.customerId) : null;
  const existingPayments = await storage.getPayments();
  const projectPayments = existingPayments.filter(p => p.projectId === project.id && p.type === "income");

  const allSalesInvoices = await storage.getSalesInvoices();
  const projectInvoices = allSalesInvoices.filter(inv => inv.projectId === project.id);
  const invoiceByStage = new Map<string, any>();
  projectInvoices.forEach(inv => { if (inv.invoiceStage) invoiceByStage.set(inv.invoiceStage, inv); });

  // 보존 대상 = 입금완료 단계 + 계산서 발행완료 단계 (처리된 건은 새 조건으로 덮어쓰지 않음)
  const STAGE_IDX: Record<string, number> = { "계약금": 1, "중도금": 2, "잔금": 3 };
  const issuedInvoiceIds = new Set(projectInvoices.filter(inv => inv.issueDate).map(inv => inv.id));
  const lockedStages = new Set<number>();
  projectPayments.forEach(p => { if (p.status === "completed" && p.splitIndex) lockedStages.add(p.splitIndex); });
  projectInvoices.forEach(inv => { const idx = inv.issueDate && inv.invoiceStage ? STAGE_IDX[inv.invoiceStage] : 0; if (idx) lockedStages.add(idx); });

  // 미완료 수금만 삭제하되, 발행된 계산서에 연결된 예정 수금은 보존
  let deleted = 0;
  for (const p of projectPayments) {
    if (p.status === "completed") continue;
    if (p.salesInvoiceId && issuedInvoiceIds.has(p.salesInvoiceId)) continue;
    await storage.deletePayment(p.id);
    deleted++;
  }

  const baseDate = baseDateInput || new Date().toISOString().split("T")[0];
  const deliveryDate = project.deliveryDate || baseDate;
  const stages = projectStages(project);
  const activeCount = stages.filter(s => stageSupply(project.totalAmount, s.ratio, s.amount) > 0).length;

  let created = 0;
  let skipped = 0;
  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    const supplyAmt = stageSupply(project.totalAmount, stage.ratio, stage.amount);
    if (supplyAmt <= 0) continue;
    if (lockedStages.has(i + 1)) { skipped++; continue; }
    const tax = Math.round(supplyAmt * 0.1);
    const amount = supplyAmt + tax;
    const { issueDate, collectDate } = calcStageDates(baseDate, deliveryDate, stage.timingType, stage.timingDays, stage.afterDelivery);

    const matchedInvoice = invoiceByStage.get(stage.name);
    let salesInvoiceId: string | null = matchedInvoice?.id || null;

    if (salesInvoiceId) {
      // 미발행 예정계산서면 새 금액으로 갱신(수금계획과 금액 불일치/중복 방지). 발행완료면 손대지 않음.
      if (matchedInvoice && !matchedInvoice.issueDate) {
        await storage.updateSalesInvoice(salesInvoiceId, {
          supplyAmount: supplyAmt, taxAmount: tax, totalAmount: amount, plannedIssueDate: issueDate,
        });
      }
      const existingInvoicePayments = existingPayments.filter(p => p.salesInvoiceId === salesInvoiceId && !p.projectId);
      for (const dup of existingInvoicePayments) {
        if (dup.status !== "completed") await storage.deletePayment(dup.id);
      }
    } else {
      const newInvoice = await storage.createSalesInvoice({
        projectId: project.id,
        customerId: project.customerId || null,
        companyName: planCustomer?.companyName || project.customerName || "",
        businessNumber: planCustomer?.businessNumber || null,
        representative: planCustomer?.representative || null,
        address: planCustomer?.address || null,
        issueDate: null,
        year: project.year || new Date().getFullYear(),
        item: `${project.projectNumber || ""} ${stage.name}`.trim() || null,
        supplyAmount: supplyAmt,
        taxAmount: tax,
        totalAmount: amount,
        invoiceStage: stage.name,
        plannedIssueDate: issueDate,
        status: "pending",
      });
      salesInvoiceId = newInvoice.id;
    }

    await storage.createPayment({
      type: "income",
      projectId: project.id,
      salesInvoiceId,
      companyName: project.customerName || "",
      description: `${project.projectNumber} ${stage.name}`,
      amount,
      plannedDate: collectDate,
      paymentMethod: stage.timingType || "end_of_next_month",
      status: "planned",
      splitIndex: i + 1,
      splitTotal: activeCount,
    });
    created++;
  }
  return { created, skipped, deleted };
}

// 계산서 재생성: 미발행(placeholder) 계산서만 invoicePlan(분할/일괄)에 맞춰 다시 생성. 발행완료건은 유지.
export async function regenerateInvoicePlan(project: any, baseDateInput?: string): Promise<{ created: number; skipped: number; deleted: number }> {
  const planCustomer = project.customerId ? await storage.getCustomer(project.customerId) : null;
  const existingSales = (await storage.getSalesInvoices()).filter(i => i.projectId === project.id);
  const issuedInvoices = existingSales.filter(i => !!i.issueDate);
  const placeholderInvoices = existingSales.filter(i => !i.issueDate);
  const issuedStages = new Set(issuedInvoices.map(i => i.invoiceStage).filter(Boolean));

  const allPayments = await storage.getPayments();
  const projectPayments = allPayments.filter(p => p.projectId === project.id && p.type === "income");

  let deleted = 0;
  for (const inv of placeholderInvoices) {
    const linkedPayments = projectPayments.filter(p => p.salesInvoiceId === inv.id);
    for (const lp of linkedPayments) {
      await storage.updatePayment(lp.id, { salesInvoiceId: null });
      (lp as any).salesInvoiceId = null;
    }
    await storage.deleteSalesInvoice(inv.id);
    deleted++;
  }

  const invoicePlan = project.invoicePlan || "split";
  const today = new Date().toISOString().split("T")[0];
  const yearNum = project.year || new Date().getFullYear();
  const baseDate = baseDateInput || today;
  const deliveryDate = project.deliveryDate || baseDate;
  let created = 0;
  let skipped = 0;

  if (invoicePlan === "bulk") {
    if (!issuedStages.has("일괄")) {
      const supply = project.totalAmount;
      const tax = Math.round(supply * 0.1);
      // 일괄 계산서 발행일 = 공급시기(납품일). 수금 예정일은 수금계획(regenerateCollectionPlan)에서 별도 계산.
      const newInv = await storage.createSalesInvoice({
        projectId: project.id,
        customerId: project.customerId || null,
        companyName: planCustomer?.companyName || project.customerName || "",
        businessNumber: planCustomer?.businessNumber || null,
        representative: planCustomer?.representative || null,
        address: planCustomer?.address || null,
        issueDate: null,
        year: yearNum,
        item: `${project.projectNumber || ""} ${project.description || ""}`.trim() || null,
        supplyAmount: supply,
        taxAmount: tax,
        totalAmount: supply + tax,
        invoiceStage: "일괄",
        plannedIssueDate: deliveryDate,
        status: "pending",
      });
      created++;
      const matchingPayment = projectPayments.find(p => !p.salesInvoiceId && p.splitIndex === 1);
      if (matchingPayment) await storage.updatePayment(matchingPayment.id, { salesInvoiceId: newInv.id });
    } else { skipped++; }
  } else {
    const stageIndexMap: Record<string, number> = { "계약금": 1, "중도금": 2, "잔금": 3 };
    const stages = projectStages(project)
      .map(s => ({ ...s, supply: stageSupply(project.totalAmount, s.ratio, s.amount) }))
      .filter(s => s.supply > 0);

    for (const stage of stages) {
      if (issuedStages.has(stage.name)) { skipped++; continue; }
      const supply = stage.supply;
      const tax = Math.round(supply * 0.1);
      const { issueDate } = calcStageDates(baseDate, deliveryDate, stage.timingType, stage.timingDays, stage.afterDelivery);
      const newInv = await storage.createSalesInvoice({
        projectId: project.id,
        customerId: project.customerId || null,
        companyName: planCustomer?.companyName || project.customerName || "",
        businessNumber: planCustomer?.businessNumber || null,
        representative: planCustomer?.representative || null,
        address: planCustomer?.address || null,
        issueDate: null,
        year: yearNum,
        item: `${project.projectNumber || ""} ${stage.name}`.trim() || null,
        supplyAmount: supply,
        taxAmount: tax,
        totalAmount: supply + tax,
        invoiceStage: stage.name,
        plannedIssueDate: issueDate,
        status: "pending",
      });
      created++;
      const idx = stageIndexMap[stage.name] || 0;
      const matchingPayment = projectPayments.find(p => !p.salesInvoiceId && (p.splitIndex === idx || (p.description && p.description.includes(stage.name))));
      if (matchingPayment) await storage.updatePayment(matchingPayment.id, { salesInvoiceId: newInv.id });
    }
  }
  return { created, skipped, deleted };
}
