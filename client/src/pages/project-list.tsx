import { useQuery, useMutation } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RefreshCw, FolderOpen, ExternalLink, X, Plus, Receipt, ReceiptText, Wallet, Settings, FileText, CalendarClock, ChevronDown, ChevronUp, Check, Pencil } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Project, SalesInvoice, PurchaseInvoice, Payment } from "@shared/schema";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";

type EnrichedProject = Project & {
  salesTotal: number;
  purchaseTotal: number;
  profit: number;
  paidIncome: number;
  paidExpense: number;
  pendingPayments: number;
  salesCount: number;
  purchaseCount: number;
};

type ProjectDetail = Project & {
  salesInvoices: SalesInvoice[];
  purchaseInvoices: PurchaseInvoice[];
  payments: Payment[];
};

function fmt(n: number) {
  if (!n) return "-";
  return n.toLocaleString();
}

const TIMING_OPTIONS = [
  { value: "end_of_next_month", label: "익월말" },
  { value: "two_weeks", label: "2주이내" },
  { value: "end_of_month", label: "월말" },
  { value: "specific_days", label: "일자지정" },
];

function timingLabel(t: string | null) {
  return TIMING_OPTIONS.find(o => o.value === t)?.label || "-";
}

function fmtComma(n: number | string): string {
  const num = typeof n === "string" ? parseInt(n.replace(/,/g, ""), 10) : n;
  if (!num && num !== 0) return "";
  return num.toLocaleString();
}

function CommaInput({ value, onChange, className, ...props }: { value: number; onChange: (v: number) => void; className?: string; [key: string]: any }) {
  const [display, setDisplay] = useState(value ? fmtComma(value) : "");

  useEffect(() => {
    setDisplay(value ? fmtComma(value) : "");
  }, [value]);

  return (
    <Input
      type="text"
      inputMode="numeric"
      className={className}
      value={display}
      onChange={e => {
        const raw = e.target.value.replace(/[^0-9]/g, "");
        const num = parseInt(raw, 10) || 0;
        setDisplay(raw ? fmtComma(num) : "");
        onChange(num);
      }}
      {...props}
    />
  );
}

function CollectionConditionsEditor({ project, onSave }: { project: ProjectDetail; onSave: () => void }) {
  const { toast } = useToast();
  const [totalAmount, setTotalAmount] = useState(project.totalAmount || 0);
  const [depositRatio, setDepositRatio] = useState(project.depositRatio || 30);
  const [depositTimingType, setDepositTimingType] = useState(project.depositTimingType || "end_of_next_month");
  const [depositTimingDays, setDepositTimingDays] = useState(project.depositTimingDays || 0);
  const [midRatio, setMidRatio] = useState(project.midRatio || 40);
  const [midTimingType, setMidTimingType] = useState(project.midTimingType || "end_of_next_month");
  const [midTimingDays, setMidTimingDays] = useState(project.midTimingDays || 0);
  const [midAfterDelivery, setMidAfterDelivery] = useState(project.midAfterDelivery === "true");
  const [finalRatio, setFinalRatio] = useState(project.finalRatio || 30);
  const [finalTimingType, setFinalTimingType] = useState(project.finalTimingType || "end_of_next_month");
  const [finalTimingDays, setFinalTimingDays] = useState(project.finalTimingDays || 0);
  const [finalAfterDelivery, setFinalAfterDelivery] = useState(project.finalAfterDelivery === "true");
  const [invoicePlan, setInvoicePlan] = useState(project.invoicePlan || "split");
  const [deliveryDate, setDeliveryDate] = useState(project.deliveryDate || "");

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/projects/${project.id}`, {
        totalAmount, depositRatio, depositTimingType, depositTimingDays,
        midRatio, midTimingType, midTimingDays, midAfterDelivery: midAfterDelivery ? "true" : "false",
        finalRatio, finalTimingType, finalTimingDays, finalAfterDelivery: finalAfterDelivery ? "true" : "false",
        invoicePlan, deliveryDate: deliveryDate || null,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "수금 조건 저장 완료" });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      onSave();
    },
    onError: (err: Error) => toast({ title: "저장 실패", description: err.message, variant: "destructive" }),
  });

  const ratioSum = depositRatio + midRatio + finalRatio;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px]">공급가액 (VAT별도)</Label>
            <CommaInput className="h-8 text-xs" value={totalAmount} onChange={setTotalAmount} data-testid="input-total-amount" />
          </div>
          <div>
            <Label className="text-[10px]">납품예정일</Label>
            <Input type="date" className="h-8 text-xs" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} data-testid="input-delivery-date" />
          </div>
        </div>
        {totalAmount > 0 && (
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground px-1">
            <span>공급가액: {fmtComma(totalAmount)}원</span>
            <span>VAT(10%): {fmtComma(Math.round(totalAmount * 0.1))}원</span>
            <span className="font-medium text-foreground">합계: {fmtComma(Math.round(totalAmount * 1.1))}원</span>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {[
          { label: "계약금", ratio: depositRatio, setRatio: setDepositRatio, timing: depositTimingType, setTiming: setDepositTimingType, days: depositTimingDays, setDays: setDepositTimingDays, after: false, setAfter: () => {}, showAfter: false },
          { label: "중도금", ratio: midRatio, setRatio: setMidRatio, timing: midTimingType, setTiming: setMidTimingType, days: midTimingDays, setDays: setMidTimingDays, after: midAfterDelivery, setAfter: setMidAfterDelivery, showAfter: true },
          { label: "잔금", ratio: finalRatio, setRatio: setFinalRatio, timing: finalTimingType, setTiming: setFinalTimingType, days: finalTimingDays, setDays: setFinalTimingDays, after: finalAfterDelivery, setAfter: setFinalAfterDelivery, showAfter: true },
        ].map(stage => (
          <div key={stage.label} className="border rounded p-2 bg-muted/20">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium w-10">{stage.label}</span>
              <div className="flex items-center gap-1">
                <Input type="number" className="h-7 w-16 text-xs" value={stage.ratio} onChange={e => stage.setRatio(Number(e.target.value))} data-testid={`input-${stage.label}-ratio`} />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
              {totalAmount > 0 && (
                <span className="text-[10px] text-muted-foreground">{fmtComma(Math.round(totalAmount * stage.ratio / 100))}원 (VAT포함 {fmtComma(Math.round(totalAmount * stage.ratio / 100 * 1.1))}원)</span>
              )}
              <Select value={stage.timing} onValueChange={stage.setTiming}>
                <SelectTrigger className="h-7 w-24 text-xs" data-testid={`select-${stage.label}-timing`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMING_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {stage.timing === "specific_days" && (
                <div className="flex items-center gap-1">
                  <Input type="number" className="h-7 w-14 text-xs" value={stage.days} onChange={e => stage.setDays(Number(e.target.value))} data-testid={`input-${stage.label}-days`} />
                  <span className="text-[10px] text-muted-foreground">일</span>
                </div>
              )}
              {stage.showAfter && (
                <div className="flex items-center gap-1">
                  <Switch checked={stage.after} onCheckedChange={stage.setAfter} className="scale-75" data-testid={`switch-${stage.label}-after`} />
                  <span className="text-[10px] text-muted-foreground">납품후</span>
                </div>
              )}
            </div>
          </div>
        ))}
        {ratioSum !== 100 && (
          <div className="text-[10px] text-destructive">비율 합계: {ratioSum}% (100%가 되어야 합니다)</div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Label className="text-[10px]">계산서 발행</Label>
        <Select value={invoicePlan} onValueChange={setInvoicePlan}>
          <SelectTrigger className="h-7 w-28 text-xs" data-testid="select-invoice-plan">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="split">분할 발행</SelectItem>
            <SelectItem value="bulk">일괄 발행</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button size="sm" className="w-full h-8 text-xs" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || ratioSum !== 100} data-testid="button-save-conditions">
        <Check className="h-3 w-3 mr-1" />{saveMutation.isPending ? "저장중..." : "수금 조건 저장"}
      </Button>
    </div>
  );
}

function ProjectDetailModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { toast } = useToast();
  const { data: project, isLoading } = useQuery<ProjectDetail>({
    queryKey: ["/api/projects", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}`);
      return res.json();
    },
  });

  const { data: allSales } = useQuery<SalesInvoice[]>({
    queryKey: ["/api/sales-invoices"],
  });

  const { data: allPurchases } = useQuery<PurchaseInvoice[]>({
    queryKey: ["/api/purchase-invoices"],
  });

  const linkMutation = useMutation({
    mutationFn: async ({ type, invoiceId, link }: { type: "sales" | "purchase"; invoiceId: string; link: boolean }) => {
      const endpoint = type === "sales" ? `/api/sales-invoices/${invoiceId}` : `/api/purchase-invoices/${invoiceId}`;
      const res = await apiRequest("PATCH", endpoint, { projectId: link ? projectId : null });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-invoices"] });
    },
    onError: (err: Error) => {
      toast({ title: "연결 실패", description: err.message, variant: "destructive" });
    },
  });

  const genCollectionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/generate-collection-plan`, {});
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
    },
    onError: (err: Error) => toast({ title: "수금 계획 생성 실패", description: err.message, variant: "destructive" }),
  });

  const updatePaymentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { amount?: number; plannedDate?: string; description?: string } }) => {
      const res = await apiRequest("PATCH", `/api/payments/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
    },
    onError: (err: Error) => toast({ title: "수정 실패", description: err.message, variant: "destructive" }),
  });

  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState(0);
  const [editDate, setEditDate] = useState("");

  const [showSalesPicker, setShowSalesPicker] = useState(false);
  const [showPurchasePicker, setShowPurchasePicker] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showConditions, setShowConditions] = useState(false);

  const unlinkedSales = useMemo(() => {
    if (!allSales || !project) return [];
    return allSales.filter(i => !i.projectId && i.companyName?.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [allSales, project, searchTerm]);

  const unlinkedPurchases = useMemo(() => {
    if (!allPurchases || !project) return [];
    return allPurchases.filter(i => !i.projectId && i.companyName?.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [allPurchases, project, searchTerm]);

  if (isLoading || !project) {
    return (
      <DialogContent className="max-w-2xl">
        <div className="p-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-48 mt-4" /></div>
      </DialogContent>
    );
  }

  const salesTotal = project.salesInvoices.reduce((s, i) => s + (i.totalAmount || 0), 0);
  const purchaseTotal = project.purchaseInvoices.reduce((s, i) => s + (i.totalAmount || 0), 0);
  const profit = salesTotal - purchaseTotal;
  const incomePayments = project.payments.filter(p => p.type === "income");
  const paidIncome = incomePayments.filter(p => p.status === "completed" || p.actualDate).reduce((s, p) => s + (p.amount || 0), 0);
  const plannedIncome = incomePayments.filter(p => p.status !== "completed" && !p.actualDate).reduce((s, p) => s + (p.amount || 0), 0);
  const hasConditions = !!project.totalAmount && project.totalAmount > 0;

  return (
    <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="modal-project-detail">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <span className="font-mono text-muted-foreground">{project.projectNumber}</span>
          <span>{project.customerName}</span>
          {project.onedriveWebUrl && (
            <a href={project.onedriveWebUrl} target="_blank" rel="noopener noreferrer" className="ml-auto">
              <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </a>
          )}
        </DialogTitle>
      </DialogHeader>

      {project.description && (
        <div className="text-sm text-muted-foreground">{project.description}</div>
      )}

      <div className="grid grid-cols-3 gap-3 mt-2">
        <div className="border rounded-lg p-2.5 bg-blue-50/50 dark:bg-blue-900/10">
          <div className="text-[10px] text-muted-foreground">매출</div>
          <div className="text-sm font-semibold text-blue-600" data-testid="text-detail-sales">{fmt(salesTotal)}원</div>
        </div>
        <div className="border rounded-lg p-2.5 bg-red-50/50 dark:bg-red-900/10">
          <div className="text-[10px] text-muted-foreground">매입</div>
          <div className="text-sm font-semibold text-red-600" data-testid="text-detail-purchase">{fmt(purchaseTotal)}원</div>
        </div>
        <div className={`border rounded-lg p-2.5 ${profit >= 0 ? "bg-green-50/50 dark:bg-green-900/10" : "bg-orange-50/50 dark:bg-orange-900/10"}`}>
          <div className="text-[10px] text-muted-foreground">수익</div>
          <div className={`text-sm font-semibold ${profit >= 0 ? "text-green-600" : "text-orange-600"}`} data-testid="text-detail-profit">{fmt(profit)}원</div>
        </div>
      </div>

      <div className="space-y-3 mt-2">
        <div className="border rounded-lg">
          <button className="w-full flex items-center justify-between p-2.5 text-left hover:bg-muted/30 rounded-lg transition-colors" onClick={() => setShowConditions(!showConditions)} data-testid="button-toggle-conditions">
            <span className="text-xs font-medium flex items-center gap-1"><Settings className="h-3 w-3" />수금 조건</span>
            <div className="flex items-center gap-2">
              {hasConditions && (
                <span className="text-[10px] text-muted-foreground">
                  {fmtComma(project.totalAmount!)}원(VAT별도) | {project.depositRatio || 0}/{project.midRatio || 0}/{project.finalRatio || 0}% | {project.invoicePlan === "bulk" ? "일괄" : "분할"}
                </span>
              )}
              {showConditions ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
            </div>
          </button>
          {showConditions && (
            <div className="px-2.5 pb-2.5 border-t pt-2">
              <CollectionConditionsEditor project={project} onSave={() => queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] })} />
            </div>
          )}
        </div>

        {hasConditions && (
          <div className="border rounded-lg p-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium flex items-center gap-1"><CalendarClock className="h-3 w-3" />수금 계획</span>
              <div className="flex items-center gap-1">
                {incomePayments.length > 0 && (
                  <span className="text-[10px] text-muted-foreground mr-1">
                    수금 {fmt(paidIncome)}원 / 예정 {fmt(plannedIncome)}원
                  </span>
                )}
                <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => genCollectionMutation.mutate()} disabled={genCollectionMutation.isPending} data-testid="button-gen-collection">
                  {genCollectionMutation.isPending ? "생성중..." : incomePayments.length > 0 ? "재생성" : "수금 계획 생성"}
                </Button>
              </div>
            </div>
            {incomePayments.length > 0 && (
              <div className="border rounded overflow-hidden">
                {incomePayments.map(pay => {
                  const isEditing = editingPaymentId === pay.id;
                  return (
                    <div key={pay.id} className="border-b last:border-b-0">
                      {isEditing ? (
                        <div className="flex items-center gap-1.5 text-xs py-1.5 px-2 bg-muted/30">
                          <Input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="h-6 text-xs w-[130px] px-1" data-testid={`input-edit-date-${pay.id}`} />
                          <CommaInput value={editAmount} onChange={setEditAmount} className="h-6 text-xs w-[100px] px-1" data-testid={`input-edit-amount-${pay.id}`} />
                          <span className="text-[10px] text-muted-foreground">원</span>
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" data-testid={`button-save-payment-${pay.id}`}
                            onClick={() => {
                              updatePaymentMutation.mutate({ id: pay.id, data: { amount: editAmount, plannedDate: editDate || undefined } });
                              setEditingPaymentId(null);
                            }}>
                            <Check className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setEditingPaymentId(null)} data-testid={`button-cancel-edit-${pay.id}`}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between text-xs py-1.5 px-2">
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground whitespace-nowrap">{pay.plannedDate || "미정"}</span>
                            <span className="font-medium">{pay.description}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-blue-600 font-medium whitespace-nowrap">{fmtComma(pay.amount || 0)}원</span>
                            <span className={`text-[10px] px-1 py-0.5 rounded ${pay.status === "completed" || pay.actualDate ? "text-green-700 bg-green-50 dark:bg-green-900/30" : "text-orange-700 bg-orange-50 dark:bg-orange-900/30"}`}>
                              {pay.status === "completed" || pay.actualDate ? "입금완료" : "예정"}
                            </span>
                            {pay.status !== "completed" && !pay.actualDate && (
                              <Button size="sm" variant="ghost" className="h-5 w-5 p-0" data-testid={`button-edit-payment-${pay.id}`}
                                onClick={() => { setEditingPaymentId(pay.id); setEditAmount(pay.amount || 0); setEditDate(pay.plannedDate || ""); }}>
                                <Pencil className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {hasConditions && (() => {
          const stages = project.invoicePlan === "bulk"
            ? [{ name: "일괄", ratio: 100 }]
            : [
                { name: "계약금", ratio: project.depositRatio || 0 },
                { name: "중도금", ratio: project.midRatio || 0 },
                { name: "잔금", ratio: project.finalRatio || 0 },
              ].filter(s => s.ratio > 0);

          const linkedTotal = project.salesInvoices.reduce((s, i) => s + (i.supplyAmount || 0), 0);
          const plannedTotal = project.totalAmount!;
          const diff = plannedTotal - linkedTotal;

          return (
            <div className="border rounded-lg p-2.5 space-y-2">
              <span className="text-xs font-medium flex items-center gap-1"><FileText className="h-3 w-3" />계산서 발행 계획</span>
              <div className="border rounded overflow-hidden">
                {stages.map(stage => {
                  const supply = Math.round(plannedTotal * stage.ratio / 100);
                  const vat = Math.round(supply * 0.1);
                  return (
                    <div key={stage.name} className="flex items-center justify-between text-xs py-1.5 px-2 border-b last:border-b-0">
                      <span className="font-medium">{stage.name} ({stage.ratio}%)</span>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span>공급 {fmtComma(supply)}</span>
                        <span>VAT {fmtComma(vat)}</span>
                        <span className="font-medium text-foreground">{fmtComma(supply + vat)}원</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between text-[10px] px-1">
                <span className="text-muted-foreground">연결된 계산서 공급가액: {fmtComma(linkedTotal)}원</span>
                {diff === 0 ? (
                  <span className="text-green-600 font-medium flex items-center gap-0.5"><Check className="h-3 w-3" />일치</span>
                ) : diff > 0 ? (
                  <span className="text-orange-600 font-medium">미발행 {fmtComma(diff)}원</span>
                ) : (
                  <span className="text-red-600 font-medium">초과 {fmtComma(Math.abs(diff))}원</span>
                )}
              </div>
            </div>
          );
        })()}

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium flex items-center gap-1"><Receipt className="h-3 w-3" />매출계산서 ({project.salesInvoices.length})</span>
            <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => { setShowSalesPicker(!showSalesPicker); setSearchTerm(""); }} data-testid="button-add-sales-invoice">
              <Plus className="h-3 w-3 mr-0.5" />연결
            </Button>
          </div>
          {showSalesPicker && (
            <div className="border rounded p-2 mb-2 bg-muted/30 space-y-1">
              <Input placeholder="거래처 검색..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="h-7 text-xs" data-testid="input-search-sales" />
              <div className="max-h-32 overflow-y-auto space-y-0.5">
                {unlinkedSales.slice(0, 20).map(inv => (
                  <div key={inv.id} className="flex items-center justify-between text-xs py-1 px-1 hover:bg-muted rounded cursor-pointer" onClick={() => linkMutation.mutate({ type: "sales", invoiceId: inv.id, link: true })} data-testid={`link-sales-${inv.id}`}>
                    <span className="truncate">{inv.issueDate} {inv.companyName}</span>
                    <span className="text-blue-600 ml-2 whitespace-nowrap">{(inv.totalAmount || 0).toLocaleString()}</span>
                  </div>
                ))}
                {unlinkedSales.length === 0 && <div className="text-[10px] text-muted-foreground py-1">연결 가능한 계산서가 없습니다</div>}
              </div>
            </div>
          )}
          {project.salesInvoices.length > 0 ? (
            <div className="border rounded overflow-hidden">
              {project.salesInvoices.map(inv => (
                <div key={inv.id} className="flex items-center justify-between text-xs py-1.5 px-2 border-b last:border-b-0 hover:bg-muted/30">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-muted-foreground whitespace-nowrap">{inv.issueDate}</span>
                    <span className="font-medium truncate">{inv.companyName}</span>
                    {inv.item && <span className="text-muted-foreground truncate hidden md:inline">({inv.item})</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-blue-600 font-medium whitespace-nowrap">{(inv.totalAmount || 0).toLocaleString()}</span>
                    <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => linkMutation.mutate({ type: "sales", invoiceId: inv.id, link: false })} data-testid={`unlink-sales-${inv.id}`}>
                      <X className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[10px] text-muted-foreground py-2">연결된 매출계산서가 없습니다</div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium flex items-center gap-1"><ReceiptText className="h-3 w-3" />매입계산서 ({project.purchaseInvoices.length})</span>
            <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => { setShowPurchasePicker(!showPurchasePicker); setSearchTerm(""); }} data-testid="button-add-purchase-invoice">
              <Plus className="h-3 w-3 mr-0.5" />연결
            </Button>
          </div>
          {showPurchasePicker && (
            <div className="border rounded p-2 mb-2 bg-muted/30 space-y-1">
              <Input placeholder="거래처 검색..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="h-7 text-xs" data-testid="input-search-purchase" />
              <div className="max-h-32 overflow-y-auto space-y-0.5">
                {unlinkedPurchases.slice(0, 20).map(inv => (
                  <div key={inv.id} className="flex items-center justify-between text-xs py-1 px-1 hover:bg-muted rounded cursor-pointer" onClick={() => linkMutation.mutate({ type: "purchase", invoiceId: inv.id, link: true })} data-testid={`link-purchase-${inv.id}`}>
                    <span className="truncate">{inv.issueDate} {inv.companyName}</span>
                    <span className="text-red-600 ml-2 whitespace-nowrap">{(inv.totalAmount || 0).toLocaleString()}</span>
                  </div>
                ))}
                {unlinkedPurchases.length === 0 && <div className="text-[10px] text-muted-foreground py-1">연결 가능한 계산서가 없습니다</div>}
              </div>
            </div>
          )}
          {project.purchaseInvoices.length > 0 ? (
            <div className="border rounded overflow-hidden">
              {project.purchaseInvoices.map(inv => (
                <div key={inv.id} className="flex items-center justify-between text-xs py-1.5 px-2 border-b last:border-b-0 hover:bg-muted/30">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-muted-foreground whitespace-nowrap">{inv.issueDate}</span>
                    <span className="font-medium truncate">{inv.companyName}</span>
                    {inv.item && <span className="text-muted-foreground truncate hidden md:inline">({inv.item})</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-red-600 font-medium whitespace-nowrap">{(inv.totalAmount || 0).toLocaleString()}</span>
                    <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => linkMutation.mutate({ type: "purchase", invoiceId: inv.id, link: false })} data-testid={`unlink-purchase-${inv.id}`}>
                      <X className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[10px] text-muted-foreground py-2">연결된 매입계산서가 없습니다</div>
          )}
        </div>

        {project.payments.filter(p => p.type !== "income").length > 0 && (
          <div>
            <span className="text-xs font-medium flex items-center gap-1 mb-1"><Wallet className="h-3 w-3" />지출현황 ({project.payments.filter(p => p.type !== "income").length})</span>
            <div className="border rounded overflow-hidden">
              {project.payments.filter(p => p.type !== "income").map(pay => (
                <div key={pay.id} className="flex items-center justify-between text-xs py-1.5 px-2 border-b last:border-b-0">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{pay.plannedDate || "미정"}</span>
                    <span>{pay.companyName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-red-600">{(pay.amount || 0).toLocaleString()}</span>
                    <span className={`text-[10px] px-1 py-0.5 rounded ${pay.status === "completed" || pay.actualDate ? "text-green-700 bg-green-50" : "text-orange-700 bg-orange-50"}`}>
                      {pay.status === "completed" || pay.actualDate ? "완료" : "예정"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </DialogContent>
  );
}

export default function ProjectList() {
  const { toast } = useToast();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: years, isLoading: yearsLoading } = useQuery<number[]>({
    queryKey: ["/api/projects/years"],
  });

  const { data: projects, isLoading } = useQuery<EnrichedProject[]>({
    queryKey: ["/api/projects", year],
    queryFn: async () => {
      const res = await fetch(`/api/projects?year=${year}`);
      return res.json();
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/projects/sync?year=${year}`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "동기화 완료", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    },
    onError: (err: Error) => {
      toast({ title: "동기화 실패", description: err.message, variant: "destructive" });
    },
  });

  const statusLabel = (status: string | null) => {
    switch (status) {
      case "active": return { text: "진행중", className: "text-blue-700 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-400" };
      case "completed": return { text: "완료", className: "text-green-700 bg-green-50 dark:bg-green-900/30 dark:text-green-400" };
      case "hold": return { text: "보류", className: "text-orange-700 bg-orange-50 dark:bg-orange-900/30 dark:text-orange-400" };
      default: return { text: status || "진행중", className: "text-gray-700 bg-gray-50 dark:bg-gray-900/30 dark:text-gray-400" };
    }
  };

  const totals = useMemo(() => {
    if (!projects) return { sales: 0, purchase: 0, profit: 0 };
    return {
      sales: projects.reduce((s, p) => s + p.salesTotal, 0),
      purchase: projects.reduce((s, p) => s + p.purchaseTotal, 0),
      profit: projects.reduce((s, p) => s + p.profit, 0),
    };
  }, [projects]);

  return (
    <div className="p-6 space-y-4 overflow-auto h-full">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-semibold" data-testid="text-project-list-title">프로젝트</h1>
        <div className="flex items-center gap-2">
          {yearsLoading ? (
            <Skeleton className="h-9 w-24" />
          ) : (
            <Select value={String(year)} onValueChange={v => setYear(parseInt(v))}>
              <SelectTrigger className="w-24 h-9" data-testid="select-project-year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(years || []).map(y => (
                  <SelectItem key={y} value={String(y)}>{y}년</SelectItem>
                ))}
                {years && !years.includes(year) && (
                  <SelectItem value={String(year)}>{year}년</SelectItem>
                )}
              </SelectContent>
            </Select>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            data-testid="button-sync-projects"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            동기화
          </Button>
        </div>
      </div>

      {projects && projects.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="border rounded-lg p-3 bg-blue-50/50 dark:bg-blue-900/10">
            <div className="text-xs text-muted-foreground">총 매출</div>
            <div className="text-lg font-semibold text-blue-600" data-testid="text-total-sales">{fmt(totals.sales)}원</div>
          </div>
          <div className="border rounded-lg p-3 bg-red-50/50 dark:bg-red-900/10">
            <div className="text-xs text-muted-foreground">총 매입</div>
            <div className="text-lg font-semibold text-red-600" data-testid="text-total-purchase">{fmt(totals.purchase)}원</div>
          </div>
          <div className={`border rounded-lg p-3 ${totals.profit >= 0 ? "bg-green-50/50 dark:bg-green-900/10" : "bg-orange-50/50 dark:bg-orange-900/10"}`}>
            <div className="text-xs text-muted-foreground">총 수익</div>
            <div className={`text-lg font-semibold ${totals.profit >= 0 ? "text-green-600" : "text-orange-600"}`} data-testid="text-total-profit">{fmt(totals.profit)}원</div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10" />)}</div>
      ) : projects && projects.length > 0 ? (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left py-2 px-3 font-medium text-xs w-20">번호</th>
                <th className="text-left py-2 px-3 font-medium text-xs">고객사</th>
                <th className="text-left py-2 px-3 font-medium text-xs hidden md:table-cell">내용</th>
                <th className="text-right py-2 px-3 font-medium text-xs hidden md:table-cell w-24">매출</th>
                <th className="text-right py-2 px-3 font-medium text-xs hidden md:table-cell w-24">매입</th>
                <th className="text-right py-2 px-3 font-medium text-xs hidden lg:table-cell w-24">수익</th>
                <th className="text-center py-2 px-3 font-medium text-xs w-14">상태</th>
                <th className="text-center py-2 px-3 font-medium text-xs w-10">폴더</th>
              </tr>
            </thead>
            <tbody>
              {projects.map(p => {
                const status = statusLabel(p.status);
                return (
                  <tr
                    key={p.id}
                    className="border-b last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => setSelectedId(p.id)}
                    data-testid={`row-project-${p.id}`}
                  >
                    <td className="py-2 px-3">
                      <span className="text-xs font-mono font-medium" data-testid={`text-project-number-${p.id}`}>{p.projectNumber || "-"}</span>
                    </td>
                    <td className="py-2 px-3">
                      <span className="text-sm font-medium" data-testid={`text-project-customer-${p.id}`}>{p.customerName || "-"}</span>
                    </td>
                    <td className="py-2 px-3 hidden md:table-cell">
                      <span className="text-xs text-muted-foreground truncate block max-w-[200px]" data-testid={`text-project-desc-${p.id}`}>{p.description || "-"}</span>
                    </td>
                    <td className="py-2 px-3 text-right hidden md:table-cell">
                      {p.salesTotal > 0 ? (
                        <span className="text-xs font-medium text-blue-600">{p.salesTotal.toLocaleString()}</span>
                      ) : <span className="text-xs text-muted-foreground">-</span>}
                    </td>
                    <td className="py-2 px-3 text-right hidden md:table-cell">
                      {p.purchaseTotal > 0 ? (
                        <span className="text-xs font-medium text-red-600">{p.purchaseTotal.toLocaleString()}</span>
                      ) : <span className="text-xs text-muted-foreground">-</span>}
                    </td>
                    <td className="py-2 px-3 text-right hidden lg:table-cell">
                      {(p.salesTotal > 0 || p.purchaseTotal > 0) ? (
                        <span className={`text-xs font-medium ${p.profit >= 0 ? "text-green-600" : "text-orange-600"}`}>{p.profit.toLocaleString()}</span>
                      ) : <span className="text-xs text-muted-foreground">-</span>}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${status.className}`} data-testid={`text-project-status-${p.id}`}>
                        {status.text}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-center">
                      {p.onedriveWebUrl ? (
                        <a
                          href={p.onedriveWebUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          data-testid={`link-project-folder-${p.id}`}
                        >
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                        </a>
                      ) : (
                        <FolderOpen className="h-3.5 w-3.5 text-muted-foreground/30" />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <FolderOpen className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p>프로젝트가 없습니다. "동기화" 버튼을 눌러 OneDrive에서 가져오세요.</p>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        {projects && projects.length > 0 && `총 ${projects.length}건`}
      </div>

      <Dialog open={!!selectedId} onOpenChange={open => { if (!open) setSelectedId(null); }}>
        {selectedId && <ProjectDetailModal projectId={selectedId} onClose={() => setSelectedId(null)} />}
      </Dialog>
    </div>
  );
}
