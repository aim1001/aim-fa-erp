// 해외(USD) 프로젝트 — 세금계산서 없이 선적(수출 매출) 1건으로 매출을 확정한다.
// 선수금은 실제 입금 원화 그대로, 나머지 USD는 선적일 기준환율로 환산. 선적 후 입금분만 환차손익.
// 계산 규칙은 shared/export-revenue.ts (서버 목록 합계와 동일)
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Ship } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Project, PurchaseInvoice, Payment } from "@shared/schema";
import { num, fmtUsd, usdToKrw } from "@shared/fx";
import { calcExportRevenue, paymentFxGain } from "@shared/export-revenue";

type ProjectLike = Project & { purchaseInvoices: PurchaseInvoice[]; payments: Payment[] };

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const signedWon = (n: number) => `${n > 0 ? "+" : ""}${won(n)}`;
const today = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const parseNum = (s: string) => parseFloat(s.replace(/[,\s]/g, "")) || 0;

function refreshProject(projectId: string) {
  queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
  queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
}

export function OverseasProjectSummary({ project }: { project: ProjectLike }) {
  const rev = calcExportRevenue(project, project.payments);
  const quoteRate = num(project.quoteRate);
  const purchase = project.purchaseInvoices.reduce((s, i) => s + (i.totalAmount || 0), 0);
  const profit = rev.revenueKrw + rev.fxGain - purchase;
  return (
    <div className="border rounded-lg p-3 mt-2 space-y-2" data-testid="section-overseas-summary">
      <div className="grid grid-cols-4 gap-3">
        <div>
          <div className="text-[10px] text-muted-foreground">계약 (USD)</div>
          <div className="text-sm font-semibold" data-testid="text-contract-usd">$ {fmtUsd(rev.contractFx)}</div>
          <div className="text-[10px] text-muted-foreground">견적환율 {quoteRate ? quoteRate.toLocaleString() : "-"}</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground">수출 매출 (선적)</div>
          <div className="text-sm font-semibold text-blue-600" data-testid="text-export-revenue">
            {rev.shipped ? won(rev.revenueKrw) : <span className="text-muted-foreground font-normal">선적 전</span>}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground">수금 (실제 입금)</div>
          <div className="text-sm font-semibold text-green-600">{won(rev.receivedKrw)}</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground">환차손익</div>
          <div className={`text-sm font-semibold ${rev.fxGain >= 0 ? "text-blue-600" : "text-red-500"}`} data-testid="text-fx-gain">{signedWon(rev.fxGain)}</div>
        </div>
      </div>
      <div className="flex items-center justify-between text-[10px] pt-1 border-t">
        <span className="text-muted-foreground">세금계산서 없음 (수출 영세율) · 매입: <span className="text-red-600 font-medium">{won(purchase)}</span></span>
        <span className="text-muted-foreground">수익(매출+환차손익−매입): <span className={`font-medium ${profit >= 0 ? "text-green-600" : "text-orange-600"}`}>{won(profit)}</span></span>
      </div>
    </div>
  );
}

function ShipmentCard({ project }: { project: ProjectLike }) {
  const { toast } = useToast();
  const [shipDate, setShipDate] = useState(project.shipDate || today());
  const [rate, setRate] = useState(num(project.shipRate) ? String(num(project.shipRate)) : "");
  const [declNo, setDeclNo] = useState(project.exportDeclNo || "");
  const [ciNo, setCiNo] = useState(project.commercialInvoiceNo || "");
  const save = useMutation({
    mutationFn: (body: Record<string, any>) => apiRequest("PATCH", `/api/projects/${project.id}`, body),
    onSuccess: () => { refreshProject(project.id); toast({ title: "선적 정보 저장" }); },
    onError: (e: Error) => toast({ title: "저장 실패", description: e.message, variant: "destructive" }),
  });

  // 입력 중인 값으로 미리보기
  const preview = calcExportRevenue({ ...project, shipDate, shipRate: parseNum(rate) }, project.payments);
  const shipRate = parseNum(rate);

  return (
    <div className="border rounded-md p-3 space-y-2 text-xs" data-testid="card-shipment">
      <div className="flex items-center gap-2">
        <Ship className="h-3.5 w-3.5" />
        <span className="font-semibold">선적 (수출 매출)</span>
        {project.shipDate && <Badge variant="secondary" className="text-[10px]">매출 확정</Badge>}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="space-y-1">
          <div className="text-muted-foreground">선적일 (공급시기)</div>
          <Input type="date" value={shipDate} onChange={e => setShipDate(e.target.value)} className="h-7 text-xs" data-testid="input-ship-date" />
        </div>
        <div className="space-y-1">
          <div className="text-muted-foreground">선적일 기준환율</div>
          <Input value={rate} onChange={e => setRate(e.target.value)} placeholder="KRW/USD" className="h-7 text-xs text-right" data-testid="input-ship-rate" />
        </div>
        <div className="space-y-1">
          <div className="text-muted-foreground">수출신고번호</div>
          <Input value={declNo} onChange={e => setDeclNo(e.target.value)} placeholder="선택" className="h-7 text-xs" data-testid="input-export-decl-no" />
        </div>
        <div className="space-y-1">
          <div className="text-muted-foreground">Commercial Invoice No.</div>
          <Input value={ciNo} onChange={e => setCiNo(e.target.value)} placeholder="선택" className="h-7 text-xs" data-testid="input-ci-no" />
        </div>
      </div>
      <div className="rounded bg-muted/40 p-2 space-y-0.5">
        <div className="flex justify-between"><span className="text-muted-foreground">선적 전 받은 선수금 $ {fmtUsd(preview.advanceFx)}</span><span>{won(preview.advanceKrw)} (실제 입금액)</span></div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">나머지 $ {fmtUsd(Math.max(0, preview.contractFx - preview.advanceFx))} × {shipRate ? shipRate.toLocaleString() : "선적환율"}</span>
          <span>{shipRate ? won(usdToKrw(Math.max(0, preview.contractFx - preview.advanceFx), shipRate)) : "-"}</span>
        </div>
        <div className="flex justify-between border-t pt-1 font-medium">
          <span>수출 매출 (원화)</span><span data-testid="text-ship-preview">{shipRate ? won(preview.advanceKrw + usdToKrw(Math.max(0, preview.contractFx - preview.advanceFx), shipRate)) : "-"}</span>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        {project.shipDate && (
          <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={save.isPending}
            onClick={() => { if (confirm("선적 정보를 지우고 선적 전 상태로 되돌릴까요?")) save.mutate({ shipDate: null, shipRate: null }); }}
            data-testid="button-clear-shipment">선적 취소</Button>
        )}
        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!shipDate || shipRate <= 0 || save.isPending}
          onClick={() => save.mutate({ shipDate, shipRate, exportDeclNo: declNo || null, commercialInvoiceNo: ciNo || null })}
          data-testid="button-save-shipment">
          {project.shipDate ? "수정" : "선적 확정"}
        </Button>
      </div>
    </div>
  );
}

function PaymentRow({ project, pay }: { project: ProjectLike; pay: Payment }) {
  const { toast } = useToast();
  const received = pay.status === "completed";
  const [date, setDate] = useState(pay.actualDate || pay.plannedDate || today());
  const [krw, setKrw] = useState(received ? String(pay.actualAmount ?? pay.amount ?? "") : "");
  const save = useMutation({
    mutationFn: (body: Record<string, any>) => apiRequest("PATCH", `/api/payments/${pay.id}`, body),
    onSuccess: () => { refreshProject(project.id); toast({ title: "입금 저장" }); },
    onError: (e: Error) => toast({ title: "저장 실패", description: e.message, variant: "destructive" }),
  });
  const amountFx = num(pay.amountFx);
  const krwNum = Math.round(parseNum(krw));
  const gain = paymentFxGain(project, pay);
  const isAdvance = received && (!project.shipDate || (pay.actualDate || "") <= project.shipDate);
  const stageName = (pay.description || "").replace(project.projectNumber || "", "").replace(/\(USD [^)]*\)/, "").trim();

  return (
    <div className="border rounded-md p-2.5 space-y-2 text-xs" data-testid={`row-export-payment-${pay.id}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{stageName || `${pay.splitIndex}차`}</span>
          <span className="font-medium">$ {fmtUsd(amountFx)}</span>
          {received && <Badge variant="secondary" className="text-[10px]">{isAdvance ? "선수금" : "입금 완료"}</Badge>}
        </div>
        <span className="text-muted-foreground">예정 {pay.plannedDate || "-"}{!received && ` · 추정 ${won(pay.amount || 0)}`}</span>
      </div>
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
        <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-7 text-xs" data-testid={`input-receive-date-${pay.id}`} />
        <Input value={krw} onChange={e => setKrw(e.target.value)} placeholder="실제 원화 입금액" className="h-7 text-xs text-right" data-testid={`input-receive-amount-${pay.id}`} />
        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!date || krwNum <= 0 || save.isPending}
          onClick={() => save.mutate({ status: "completed", actualDate: date, actualAmount: krwNum })}
          data-testid={`button-receive-${pay.id}`}>
          {received ? "수정" : "입금"}
        </Button>
      </div>
      {gain != null && (
        <div className="text-right">
          환차손익 <span className={`font-semibold ${gain >= 0 ? "text-blue-600" : "text-red-500"}`}>{signedWon(gain)}</span>
          <span className="text-muted-foreground"> (입금 {won(pay.actualAmount ?? 0)} − $ {fmtUsd(amountFx)} × {num(project.shipRate).toLocaleString()})</span>
        </div>
      )}
    </div>
  );
}

export function OverseasStagesPanel({ project }: { project: ProjectLike }) {
  const { toast } = useToast();
  const incomes = project.payments
    .filter(p => p.type === "income")
    .sort((a, b) => (a.splitIndex || 0) - (b.splitIndex || 0));
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
        if (confirm(`${body.message}\n(입금 완료된 단계는 유지됩니다)`)) regen.mutate(true);
        return;
      }
      if (status >= 400) { toast({ title: "생성 실패", description: body.message, variant: "destructive" }); return; }
      refreshProject(project.id);
      toast({ title: body.message });
    },
  });

  return (
    <div className="space-y-3">
      <ShipmentCard project={project} />
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold">수금 (USD 단계)</span>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => regen.mutate(false)} disabled={regen.isPending} data-testid="button-regen-export-plan">
          <RefreshCw className="h-3 w-3 mr-1" />수금 계획 다시 만들기
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        입금 시 실제 받은 원화를 입력하세요. 선적일 이전 입금은 선수금(매출에 그대로 반영), 이후 입금은 선적일 환율과의 차액이 환차손익입니다.
      </p>
      {incomes.length === 0 ? (
        <div className="text-center text-muted-foreground text-xs py-6 border rounded">수금 계획이 없습니다. 단계 비율·시기를 확인한 뒤 계획을 만드세요.</div>
      ) : incomes.map(p => <PaymentRow key={p.id} project={project} pay={p} />)}
    </div>
  );
}
