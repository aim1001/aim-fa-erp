// 해외(USD) 프로젝트 — 계약은 USD, 매출은 매출 인식일(선적일) 환율로 원화 확정,
// 수금은 실제 원화 입금액. 단계별 (입금 원화 − 매출 원화) = 환차손익.
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RefreshCw } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Project, SalesInvoice, PurchaseInvoice, Payment } from "@shared/schema";
import { num, fmtUsd, usdToKrw } from "@shared/fx";

type ProjectLike = Project & { salesInvoices: SalesInvoice[]; purchaseInvoices: PurchaseInvoice[]; payments: Payment[] };

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const STAGE_ORDER: Record<string, number> = { "계약금": 1, "중도금": 2, "잔금": 3 };
const today = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

function stageRows(project: ProjectLike) {
  const incomes = project.payments.filter(p => p.type === "income");
  return [...project.salesInvoices]
    .filter(i => i.currency === "USD")
    .sort((a, b) => (STAGE_ORDER[a.invoiceStage || ""] || 9) - (STAGE_ORDER[b.invoiceStage || ""] || 9))
    .map(inv => {
      const pay = incomes.find(p => p.salesInvoiceId === inv.id) || null;
      const recognized = !!inv.issueDate && num(inv.fxRate) > 0;
      const received = pay?.status === "completed";
      const actual = received ? (pay!.actualAmount ?? pay!.amount ?? 0) : 0;
      const fxGain = recognized && received ? actual - (inv.totalAmount || 0) : null;
      return { inv, pay, recognized, received, actual, fxGain };
    });
}

export function overseasTotals(project: ProjectLike) {
  const rows = stageRows(project);
  const recognizedKrw = rows.filter(r => r.recognized).reduce((s, r) => s + (r.inv.totalAmount || 0), 0);
  const receivedKrw = rows.filter(r => r.received).reduce((s, r) => s + r.actual, 0);
  const fxGain = rows.reduce((s, r) => s + (r.fxGain ?? 0), 0);
  const purchase = project.purchaseInvoices.reduce((s, i) => s + (i.totalAmount || 0), 0);
  return { rows, recognizedKrw, receivedKrw, fxGain, purchase };
}

export function OverseasProjectSummary({ project }: { project: ProjectLike }) {
  const totalFx = num(project.contractAmountFx);
  const quoteRate = num(project.quoteRate);
  const { recognizedKrw, receivedKrw, fxGain, purchase } = overseasTotals(project);
  // 수익 = 매출(원화 확정) + 환차손익 − 매입
  const profit = recognizedKrw + fxGain - purchase;
  return (
    <div className="border rounded-lg p-3 mt-2 space-y-2" data-testid="section-overseas-summary">
      <div className="grid grid-cols-4 gap-3">
        <div>
          <div className="text-[10px] text-muted-foreground">계약 (USD)</div>
          <div className="text-sm font-semibold" data-testid="text-contract-usd">$ {fmtUsd(totalFx)}</div>
          <div className="text-[10px] text-muted-foreground">견적환율 {quoteRate ? quoteRate.toLocaleString() : "-"} · ≈{won(project.totalAmount || usdToKrw(totalFx, quoteRate))}</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground">매출 인식 (원화 확정)</div>
          <div className="text-sm font-semibold text-blue-600">{won(recognizedKrw)}</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground">수금 (실제 입금)</div>
          <div className="text-sm font-semibold text-green-600">{won(receivedKrw)}</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground">환차손익</div>
          <div className={`text-sm font-semibold ${fxGain >= 0 ? "text-blue-600" : "text-red-500"}`} data-testid="text-fx-gain">
            {fxGain > 0 ? "+" : ""}{won(fxGain)}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between text-[10px] pt-1 border-t">
        <span className="text-muted-foreground">매입: <span className="text-red-600 font-medium">{won(purchase)}</span></span>
        <span className="text-muted-foreground">수익(매출+환차손익−매입): <span className={`font-medium ${profit >= 0 ? "text-green-600" : "text-orange-600"}`}>{won(profit)}</span></span>
      </div>
    </div>
  );
}

function StageRow({ row, projectId }: { row: ReturnType<typeof stageRows>[number]; projectId: string }) {
  const { toast } = useToast();
  const { inv, pay, recognized, received, actual, fxGain } = row;
  const amountFx = num(inv.amountFx);
  const [recDate, setRecDate] = useState(inv.issueDate || inv.plannedIssueDate || today());
  const [rate, setRate] = useState(num(inv.fxRate) ? String(num(inv.fxRate)) : "");
  const [payDate, setPayDate] = useState(pay?.actualDate || pay?.plannedDate || today());
  const [payKrw, setPayKrw] = useState(received ? String(actual) : "");

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
    queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices"] });
  };
  const recognize = useMutation({
    mutationFn: (body: Record<string, any>) => apiRequest("PATCH", `/api/sales-invoices/${inv.id}`, body),
    onSuccess: () => { refresh(); toast({ title: "매출 인식 저장" }); },
    onError: (e: Error) => toast({ title: "저장 실패", description: e.message, variant: "destructive" }),
  });
  const receive = useMutation({
    mutationFn: (body: Record<string, any>) => apiRequest("PATCH", `/api/payments/${pay!.id}`, body),
    onSuccess: () => { refresh(); toast({ title: "입금 저장" }); },
    onError: (e: Error) => toast({ title: "저장 실패", description: e.message, variant: "destructive" }),
  });

  const rateNum = parseFloat(rate.replace(/,/g, "")) || 0;
  const payNum = Math.round(parseFloat(payKrw.replace(/,/g, "")) || 0);

  return (
    <div className="border rounded-md p-2.5 space-y-2 text-xs" data-testid={`row-export-stage-${inv.id}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{inv.invoiceStage}</span>
          <span className="font-medium">$ {fmtUsd(amountFx)}</span>
          {recognized && <Badge variant="secondary" className="text-[10px]">매출 인식</Badge>}
          {received && <Badge variant="secondary" className="text-[10px]">입금 완료</Badge>}
        </div>
        <span className="text-muted-foreground">예정 매출 {inv.plannedIssueDate || "-"} · 입금 {pay?.plannedDate || "-"}</span>
      </div>

      <div className="grid grid-cols-[64px_1fr_1fr_auto] gap-2 items-center">
        <span className="text-muted-foreground">매출 인식</span>
        <Input type="date" value={recDate} onChange={e => setRecDate(e.target.value)} className="h-7 text-xs" data-testid={`input-recognize-date-${inv.id}`} />
        <Input value={rate} onChange={e => setRate(e.target.value)} placeholder="선적일 환율 (KRW/USD)" className="h-7 text-xs text-right" data-testid={`input-recognize-rate-${inv.id}`} />
        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!recDate || rateNum <= 0 || recognize.isPending}
          onClick={() => recognize.mutate({ issueDate: recDate, writeDate: recDate, fxRate: rateNum })}
          data-testid={`button-recognize-${inv.id}`}>
          {recognized ? "수정" : "인식"}
        </Button>
      </div>
      <div className="text-right text-muted-foreground">
        {recognized
          ? <>매출 원화 <span className="font-medium text-foreground">{won(inv.totalAmount || 0)}</span> ($ {fmtUsd(amountFx)} × {num(inv.fxRate).toLocaleString()})</>
          : rateNum > 0 ? <>저장 시 매출 원화 ≈ {won(usdToKrw(amountFx, rateNum))}</> : <>추정 {won(inv.totalAmount || 0)} (견적환율)</>}
      </div>

      {pay && (
        <div className="grid grid-cols-[64px_1fr_1fr_auto] gap-2 items-center">
          <span className="text-muted-foreground">입금</span>
          <Input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className="h-7 text-xs" data-testid={`input-receive-date-${inv.id}`} />
          <Input value={payKrw} onChange={e => setPayKrw(e.target.value)} placeholder="실제 원화 입금액" className="h-7 text-xs text-right" data-testid={`input-receive-amount-${inv.id}`} />
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!payDate || payNum <= 0 || receive.isPending}
            onClick={() => receive.mutate({ status: "completed", actualDate: payDate, actualAmount: payNum })}
            data-testid={`button-receive-${inv.id}`}>
            {received ? "수정" : "입금"}
          </Button>
        </div>
      )}
      {fxGain != null && (
        <div className="text-right">
          환차손익 <span className={`font-semibold ${fxGain >= 0 ? "text-blue-600" : "text-red-500"}`}>{fxGain > 0 ? "+" : ""}{won(fxGain)}</span>
          <span className="text-muted-foreground"> (입금 {won(actual)} − 매출 {won(inv.totalAmount || 0)})</span>
        </div>
      )}
    </div>
  );
}

export function OverseasStagesPanel({ project }: { project: ProjectLike }) {
  const { toast } = useToast();
  const { rows } = overseasTotals(project);
  const regen = useMutation({
    mutationFn: async (confirmed: boolean) => {
      const res = await fetch(`/api/projects/${project.id}/generate-collection-plan`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ confirmed }),
      });
      return { status: res.status, body: await res.json() };
    },
    onSuccess: ({ status, body }) => {
      if (status === 409 && body.needConfirm) {
        if (confirm(`${body.message}\n(매출 인식·입금된 단계는 유지됩니다)`)) regen.mutate(true);
        return;
      }
      if (status >= 400) { toast({ title: "생성 실패", description: body.message, variant: "destructive" }); return; }
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id] });
      toast({ title: body.message });
    },
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          선적일에 그날 환율로 매출을 인식하고, 실제 원화 입금액을 입력하면 환차손익이 계산됩니다. 수출 영세율이라 세액은 0입니다.
        </span>
        <Button size="sm" variant="ghost" className="h-7 text-xs shrink-0" onClick={() => regen.mutate(false)} disabled={regen.isPending} data-testid="button-regen-export-plan">
          <RefreshCw className="h-3 w-3 mr-1" />계획 다시 만들기
        </Button>
      </div>
      {rows.length === 0 ? (
        <div className="text-center text-muted-foreground text-xs py-6 border rounded">USD 매출 계획이 없습니다. 계약조건(비율)을 확인한 뒤 계획을 만드세요.</div>
      ) : rows.map(r => <StageRow key={r.inv.id} row={r} projectId={project.id} />)}
    </div>
  );
}
