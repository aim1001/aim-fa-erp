import { useQuery, useMutation } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RefreshCw, FolderOpen, ExternalLink, X, Plus, Receipt, ReceiptText, Wallet, Settings, FileText, CalendarClock, Check, Pencil, Trash2, Banknote, AlertTriangle, Undo2 } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { useSearch } from "wouter";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type EnrichedProject = Project & {
  salesTotal: number;
  salesSupplyTotal: number;
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
  { value: "within_days", label: "N일이내" },
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
  const [totalAmount, setTotalAmount] = useState(project.totalAmount ?? 0);
  const [depositRatio, setDepositRatio] = useState(project.depositRatio ?? 50);
  const [depositTimingType, setDepositTimingType] = useState(project.depositTimingType || "end_of_next_month");
  const [depositTimingDays, setDepositTimingDays] = useState(project.depositTimingDays ?? 0);
  const [midRatio, setMidRatio] = useState(project.midRatio ?? 0);
  const [midTimingType, setMidTimingType] = useState(project.midTimingType || "end_of_next_month");
  const [midTimingDays, setMidTimingDays] = useState(project.midTimingDays ?? 0);
  const [midAfterDelivery, setMidAfterDelivery] = useState(project.midAfterDelivery === "true");
  const [finalRatio, setFinalRatio] = useState(project.finalRatio ?? 50);
  const [finalTimingType, setFinalTimingType] = useState(project.finalTimingType || "end_of_next_month");
  const [finalTimingDays, setFinalTimingDays] = useState(project.finalTimingDays ?? 0);
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
      toast({ title: "계약조건 저장 완료" });
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
              {stage.timing === "within_days" && (
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">{stage.showAfter && stage.after ? "납품후" : "계약후"}</span>
                  <Input type="number" className="h-7 w-14 text-xs" value={stage.days} onChange={e => stage.setDays(Number(e.target.value))} data-testid={`input-${stage.label}-within-days`} />
                  <span className="text-[10px] text-muted-foreground">일 이내</span>
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
        <Check className="h-3 w-3 mr-1" />{saveMutation.isPending ? "저장중..." : "계약조건 저장"}
      </Button>
    </div>
  );
}

export function ProjectDetailModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
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
    mutationFn: async ({ type, invoiceId, link, invoiceStage }: { type: "sales" | "purchase"; invoiceId: string; link: boolean; invoiceStage?: string | null }) => {
      const endpoint = type === "sales" ? `/api/sales-invoices/${invoiceId}` : `/api/purchase-invoices/${invoiceId}`;
      const body: any = { projectId: link ? projectId : null };
      if (type === "sales") body.invoiceStage = link ? (invoiceStage || null) : null;
      const res = await apiRequest("PATCH", endpoint, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-invoices"] });
    },
    onError: (err: Error) => {
      toast({ title: "연결 실패", description: err.message, variant: "destructive" });
    },
  });

  const genCollectionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/generate-collection-plan`, { confirmed: true });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
    },
    onError: (err: Error) => toast({ title: "수금 계획 생성 실패", description: err.message, variant: "destructive" }),
  });

  const genInvoiceMutation = useMutation({
    mutationFn: async (confirmed: boolean) => {
      const res = await fetch(`/api/projects/${projectId}/generate-invoice-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed }),
        credentials: "include",
      });
      const data = await res.json();
      if (res.status === 409 && data.needConfirm) {
        return { needConfirm: true, existingCount: data.existingCount };
      }
      if (!res.ok) throw new Error(data.message || "계산서 생성 실패");
      return data;
    },
    onSuccess: (data) => {
      if (data.needConfirm) {
        setShowInvoiceRegenConfirm(true);
        return;
      }
      toast({ title: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices"] });
      setShowInvoiceRegenConfirm(false);
    },
    onError: (err: Error) => {
      toast({ title: "계산서 생성 실패", description: err.message, variant: "destructive" });
    },
  });

  const invalidatePayments = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
    queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
    queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices-with-payments"] });
    queryClient.invalidateQueries({ queryKey: ["/api/purchase-invoices-with-payments"] });
  };

  const updatePaymentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, any> }) => {
      const res = await apiRequest("PATCH", `/api/payments/${id}`, data);
      return res.json();
    },
    onSuccess: invalidatePayments,
    onError: (err: Error) => toast({ title: "수정 실패", description: err.message, variant: "destructive" }),
  });

  const createPaymentMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("POST", "/api/payments", data);
      return res.json();
    },
    onSuccess: invalidatePayments,
    onError: (err: Error) => toast({ title: "추가 실패", description: err.message, variant: "destructive" }),
  });

  const deletePaymentMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/payments/${id}`);
      return res.json();
    },
    onSuccess: invalidatePayments,
    onError: (err: Error) => toast({ title: "삭제 실패", description: err.message, variant: "destructive" }),
  });

  const confirmPaymentMutation = useMutation({
    mutationFn: async (data: { id: string; actualDate: string; actualAmount: number; originalAmount: number; remainderAction?: "merge" | "new"; remainderTargetId?: string; remainderNewDescription?: string; remainderPlannedDate?: string; projectId?: string; companyName?: string }) => {
      const res = await apiRequest("POST", `/api/payments/${data.id}/confirm`, data);
      return res.json();
    },
    onSuccess: invalidatePayments,
    onError: (err: Error) => toast({ title: "입금 처리 실패", description: err.message, variant: "destructive" }),
  });

  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState(0);
  const [editDate, setEditDate] = useState("");
  const [confirmingPaymentId, setConfirmingPaymentId] = useState<string | null>(null);
  const [confirmAmount, setConfirmAmount] = useState(0);
  const [confirmDate, setConfirmDate] = useState("");
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [newPaymentDesc, setNewPaymentDesc] = useState("");
  const [newPaymentAmount, setNewPaymentAmount] = useState(0);
  const [newPaymentDate, setNewPaymentDate] = useState("");
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);
  const [showInvoiceRegenConfirm, setShowInvoiceRegenConfirm] = useState(false);

  const [editingInvoiceDateId, setEditingInvoiceDateId] = useState<string | null>(null);
  const [editInvoiceDate, setEditInvoiceDate] = useState("");
  const updateInvoiceDateMutation = useMutation({
    mutationFn: async ({ id, plannedIssueDate }: { id: string; plannedIssueDate: string | null }) => {
      const res = await apiRequest("PATCH", `/api/sales-invoices/${id}`, { plannedIssueDate });
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] }); },
    onError: (err: Error) => toast({ title: "예정일 변경 실패", description: err.message, variant: "destructive" }),
  });

  const [showSalesPicker, setShowSalesPicker] = useState(false);
  const [showPurchasePicker, setShowPurchasePicker] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [stagePicker, setStagePicker] = useState<string | null>(null);
  const [stageSearchTerm, setStageSearchTerm] = useState("");

  const stageUnlinkedSales = useMemo(() => {
    if (!allSales || !project) return [];
    return allSales.filter(i => !i.projectId && i.companyName?.toLowerCase().includes(stageSearchTerm.toLowerCase()));
  }, [allSales, project, stageSearchTerm]);

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

  const salesSupplyTotal = project.salesInvoices.reduce((s, i) => s + (i.supplyAmount || 0), 0);
  const salesTotalAmount = project.salesInvoices.reduce((s, i) => s + (i.totalAmount || 0), 0);
  const purchaseTotal = project.purchaseInvoices.reduce((s, i) => s + (i.totalAmount || 0), 0);
  const incomePayments = project.payments.filter(p => p.type === "income");
  const paidIncome = incomePayments.filter(p => p.status === "completed" || p.actualDate).reduce((s, p) => s + (p.actualAmount || p.amount || 0), 0);
  const paidIncomeSupply = Math.round(paidIncome / 1.1);
  const plannedIncome = incomePayments.filter(p => p.status !== "completed" && !p.actualDate).reduce((s, p) => s + (p.amount || 0), 0);
  const hasConditions = !!project.totalAmount && project.totalAmount > 0;
  const contractAmount = project.totalAmount || 0;
  const issuedPct = contractAmount > 0 ? Math.min(Math.round((salesSupplyTotal / contractAmount) * 100), 100) : 0;
  const collectedPct = contractAmount > 0 ? Math.min(Math.round((paidIncomeSupply / contractAmount) * 100), 100) : 0;
  const profit = salesTotalAmount - purchaseTotal;

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

      {hasConditions ? (
        <div className="border rounded-lg p-3 mt-2 space-y-2">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-[10px] text-muted-foreground">계약 (공급가액)</div>
              <div className="text-sm font-semibold" data-testid="text-detail-contract">{fmtComma(contractAmount)}원</div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground">발행 (계산서)</div>
              <div className="text-sm font-semibold text-blue-600" data-testid="text-detail-issued">{fmtComma(salesSupplyTotal)}원</div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground">수금 (입금완료)</div>
              <div className="text-sm font-semibold text-green-600" data-testid="text-detail-collected">{fmtComma(paidIncomeSupply)}원</div>
            </div>
          </div>
          <div className="space-y-1.5">
            <div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-0.5">
                <span>발행 진행률</span>
                <span>{issuedPct}% ({fmtComma(salesSupplyTotal)} / {fmtComma(contractAmount)})</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${issuedPct}%` }} data-testid="bar-issued" />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-0.5">
                <span>수금 진행률</span>
                <span>{collectedPct}% ({fmtComma(paidIncomeSupply)} / {fmtComma(contractAmount)})</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${collectedPct}%` }} data-testid="bar-collected" />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between text-[10px] pt-1 border-t">
            <span className="text-muted-foreground">매입: <span className="text-red-600 font-medium">{fmtComma(purchaseTotal)}원</span></span>
            <span className="text-muted-foreground">수익: <span className={`font-medium ${profit >= 0 ? "text-green-600" : "text-orange-600"}`}>{fmtComma(profit)}원</span></span>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3 mt-2">
          <div className="border rounded-lg p-2.5 bg-blue-50/50 dark:bg-blue-900/10">
            <div className="text-[10px] text-muted-foreground">매출</div>
            <div className="text-sm font-semibold text-blue-600" data-testid="text-detail-sales">{fmt(salesTotalAmount)}원</div>
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
      )}

      <Tabs defaultValue="conditions" className="mt-2">
        <TabsList className="w-full grid grid-cols-3 h-8">
          <TabsTrigger value="conditions" className="text-xs" data-testid="tab-conditions">
            <Settings className="h-3 w-3 mr-1" />계약조건
          </TabsTrigger>
          <TabsTrigger value="collection" className="text-xs" data-testid="tab-collection">
            <CalendarClock className="h-3 w-3 mr-1" />수금계획
          </TabsTrigger>
          <TabsTrigger value="invoices" className="text-xs" data-testid="tab-invoices">
            <FileText className="h-3 w-3 mr-1" />계산서발행
          </TabsTrigger>
        </TabsList>

        <TabsContent value="conditions" className="mt-2 space-y-3">
          <CollectionConditionsEditor project={project} onSave={() => queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] })} />
        </TabsContent>

        <TabsContent value="collection" className="mt-2 space-y-3">
        {hasConditions ? (
          <div className="border rounded-lg p-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium flex items-center gap-1"><CalendarClock className="h-3 w-3" />수금 계획 <span className="text-[9px] text-muted-foreground font-normal">(VAT포함 합계 기준)</span></span>
              <div className="flex items-center gap-1">
                {incomePayments.length > 0 ? (
                  <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => setShowRegenConfirm(true)} disabled={genCollectionMutation.isPending} data-testid="button-gen-collection">
                    {genCollectionMutation.isPending ? "생성중..." : "재생성"}
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => genCollectionMutation.mutate()} disabled={genCollectionMutation.isPending} data-testid="button-gen-collection">
                    {genCollectionMutation.isPending ? "생성중..." : "수금 계획 생성"}
                  </Button>
                )}
              </div>
            </div>
            {showRegenConfirm && (() => {
              const plannedCount = incomePayments.filter(p => p.status !== "completed" && !p.actualDate).length;
              const completedCount = incomePayments.filter(p => p.status === "completed" || p.actualDate).length;
              return (
                <div className="border rounded p-2 bg-orange-50/50 dark:bg-orange-900/10 space-y-1.5">
                  <div className="text-[10px] font-medium text-orange-700 dark:text-orange-400 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />수금 계획 재생성 확인
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    예정 항목 {plannedCount}건이 삭제되고 계약조건에 따라 새로 생성됩니다.
                    {completedCount > 0 && <span className="text-green-600"> 입금완료 {completedCount}건은 유지됩니다.</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="destructive" className="h-6 text-[10px] px-2" data-testid="button-confirm-regen"
                      onClick={() => { genCollectionMutation.mutate(); setShowRegenConfirm(false); }}>
                      재생성
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => setShowRegenConfirm(false)} data-testid="button-cancel-regen">
                      취소
                    </Button>
                  </div>
                </div>
              );
            })()}
            {incomePayments.length > 0 && (
              <div className="border rounded overflow-hidden">
                {incomePayments.map((pay, idx) => {
                  const isEditing = editingPaymentId === pay.id;
                  const isConfirming = confirmingPaymentId === pay.id;
                  const isDone = pay.status === "completed" || !!pay.actualDate;
                  const amt = isDone && pay.actualAmount ? pay.actualAmount : (pay.amount || 0);
                  const supply = Math.round(amt / 1.1);
                  const vat = amt - supply;
                  const pct = project.totalAmount ? Math.round((supply / project.totalAmount) * 100) : 0;
                  const remainder = isConfirming ? amt - confirmAmount : 0;
                  const nextPending = incomePayments.find((p, i) => i > idx && p.status !== "completed" && !p.actualDate);

                  return (
                    <div key={pay.id} className="border-b last:border-b-0">
                      {isConfirming ? (
                        <div className="p-2 bg-blue-50/50 dark:bg-blue-900/10 space-y-2">
                          <div className="text-[10px] font-medium text-blue-700 dark:text-blue-400">입금 처리: {pay.description}</div>
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="text-[10px] text-muted-foreground">입금일</span>
                            <Input type="date" value={confirmDate} onChange={e => setConfirmDate(e.target.value)} className="h-6 text-xs w-[130px] px-1" data-testid={`input-confirm-date-${pay.id}`} />
                            <span className="text-[10px] text-muted-foreground">입금액</span>
                            <CommaInput value={confirmAmount} onChange={setConfirmAmount} className="h-6 text-xs w-[100px] px-1" data-testid={`input-confirm-amount-${pay.id}`} />
                            <span className="text-[10px] text-muted-foreground">원</span>
                          </div>
                          {confirmAmount > 0 && (
                            <div className="text-[10px] text-muted-foreground">
                              공급 {fmtComma(Math.round(confirmAmount / 1.1))} + VAT {fmtComma(confirmAmount - Math.round(confirmAmount / 1.1))} = {fmtComma(confirmAmount)}원
                              {remainder > 0 && <span className="text-orange-600 ml-2">잔여 {fmtComma(remainder)}원</span>}
                            </div>
                          )}
                          {remainder > 0 && (
                            <div className="flex items-center gap-1 flex-wrap">
                              {nextPending && (
                                <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" data-testid={`button-remainder-next-${pay.id}`}
                                  onClick={() => {
                                    confirmPaymentMutation.mutate({ id: pay.id, actualDate: confirmDate, actualAmount: confirmAmount, originalAmount: amt, remainderAction: "merge", remainderTargetId: nextPending.id });
                                    setConfirmingPaymentId(null);
                                  }}>
                                  잔여 → {nextPending.description}에 합산
                                </Button>
                              )}
                              <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" data-testid={`button-remainder-new-${pay.id}`}
                                onClick={() => {
                                  confirmPaymentMutation.mutate({ id: pay.id, actualDate: confirmDate, actualAmount: confirmAmount, originalAmount: amt, remainderAction: "new", projectId: project.id, companyName: project.customerName || "", remainderNewDescription: `${pay.description} 잔여`, remainderPlannedDate: pay.plannedDate || undefined });
                                  setConfirmingPaymentId(null);
                                }}>
                                잔여 → 새 항목 추가
                              </Button>
                            </div>
                          )}
                          <div className="flex items-center gap-1">
                            {remainder <= 0 && (
                              <Button size="sm" className="h-6 text-[10px] px-2" data-testid={`button-confirm-payment-${pay.id}`}
                                onClick={() => {
                                  confirmPaymentMutation.mutate({ id: pay.id, actualDate: confirmDate, actualAmount: confirmAmount, originalAmount: amt });
                                  setConfirmingPaymentId(null);
                                }}>
                                <Check className="h-3 w-3 mr-0.5" />입금 확인
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => setConfirmingPaymentId(null)} data-testid={`button-cancel-confirm-${pay.id}`}>
                              취소
                            </Button>
                          </div>
                        </div>
                      ) : isEditing ? (
                        <div className="p-2 bg-muted/30 space-y-1.5">
                          <div className="text-[10px] font-medium text-muted-foreground">{isDone ? "입금 내역 수정" : "계획 수정"}: {pay.description}</div>
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="text-[10px] text-muted-foreground">{isDone ? "입금일" : "예정일"}</span>
                            <Input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="h-6 text-xs w-[130px] px-1" data-testid={`input-edit-date-${pay.id}`} />
                            <span className="text-[10px] text-muted-foreground">합계(VAT포함)</span>
                            <CommaInput value={editAmount} onChange={setEditAmount} className="h-6 text-xs w-[100px] px-1" data-testid={`input-edit-amount-${pay.id}`} />
                            <span className="text-[10px] text-muted-foreground">원</span>
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" data-testid={`button-save-payment-${pay.id}`}
                              onClick={() => {
                                const data: Record<string, any> = isDone
                                  ? { actualAmount: editAmount, actualDate: editDate || undefined, amount: editAmount }
                                  : { amount: editAmount, plannedDate: editDate || undefined };
                                updatePaymentMutation.mutate({ id: pay.id, data });
                                setEditingPaymentId(null);
                              }}>
                              <Check className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setEditingPaymentId(null)} data-testid={`button-cancel-edit-${pay.id}`}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                          {editAmount > 0 && (
                            <div className="text-[10px] text-muted-foreground pl-1">
                              공급 {fmtComma(Math.round(editAmount / 1.1))} + VAT {fmtComma(editAmount - Math.round(editAmount / 1.1))} = {fmtComma(editAmount)}원
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="py-1.5 px-2">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{pay.description}</span>
                              <span className="text-[10px] text-muted-foreground">({pct}%)</span>
                              <span className={`text-[10px] px-1 py-0.5 rounded ${isDone ? "text-green-700 bg-green-50 dark:bg-green-900/30" : "text-orange-700 bg-orange-50 dark:bg-orange-900/30"}`}>
                                {isDone ? "입금완료" : "예정"}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              {!isDone && (
                                <Button size="sm" variant="ghost" className="h-5 text-[10px] px-1 text-blue-600" data-testid={`button-confirm-start-${pay.id}`}
                                  onClick={() => { setConfirmingPaymentId(pay.id); setConfirmAmount(pay.amount || 0); setConfirmDate(new Date().toISOString().split("T")[0]); }}>
                                  <Banknote className="h-3 w-3 mr-0.5" />입금처리
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" className="h-5 w-5 p-0" data-testid={`button-edit-payment-${pay.id}`}
                                onClick={() => { setEditingPaymentId(pay.id); setEditAmount(isDone ? (pay.actualAmount || pay.amount || 0) : (pay.amount || 0)); setEditDate(isDone ? (pay.actualDate || pay.plannedDate || "") : (pay.plannedDate || "")); }}>
                                <Pencil className="h-3 w-3" />
                              </Button>
                              {isDone && (
                                <Button size="sm" variant="ghost" className="h-5 text-[10px] px-1 text-orange-600" data-testid={`button-undo-payment-${pay.id}`}
                                  onClick={() => updatePaymentMutation.mutate({ id: pay.id, data: { status: "planned", actualDate: null, actualAmount: null } })}>
                                  <Undo2 className="h-3 w-3 mr-0.5" />입금취소
                                </Button>
                              )}
                              {!isDone && (
                                <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-red-400 hover:text-red-600" data-testid={`button-delete-payment-${pay.id}`}
                                  onClick={() => deletePaymentMutation.mutate(pay.id)}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-[10px] mt-0.5">
                            <span className="text-muted-foreground">{isDone ? `입금 ${pay.actualDate || pay.plannedDate}` : `예정 ${pay.plannedDate || "미정"}`}</span>
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <span>공급 {fmtComma(supply)}</span>
                              <span>VAT {fmtComma(vat)}</span>
                              <span className="text-blue-600 font-medium">{fmtComma(amt)}원</span>
                            </div>
                          </div>
                          {isDone && pay.actualAmount && pay.actualAmount !== pay.amount && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              계획 {fmtComma(pay.amount || 0)}원 → 실제 {fmtComma(pay.actualAmount)}원
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {(() => {
                  const totalAmt = paidIncome + plannedIncome;
                  const totalSupply = Math.round(totalAmt / 1.1);
                  const totalVat = totalAmt - totalSupply;
                  const projectTotal = project.totalAmount ? Math.round(project.totalAmount * 1.1) : 0;
                  const diff = projectTotal - totalAmt;
                  return (
                    <>
                      <div className="flex items-center justify-between text-[10px] py-1.5 px-2 bg-muted/30 font-medium">
                        <span>합계 {project.totalAmount ? `(${Math.round((totalSupply / project.totalAmount) * 100)}%)` : ""}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">공급 {fmtComma(totalSupply)}</span>
                          <span className="text-muted-foreground">VAT {fmtComma(totalVat)}</span>
                          <span className="text-blue-600">{fmtComma(totalAmt)}원</span>
                          <span className="text-muted-foreground ml-1">수금 {fmtComma(paidIncome)} / 예정 {fmtComma(plannedIncome)}</span>
                        </div>
                      </div>
                      {projectTotal > 0 && diff !== 0 && (
                        <div className={`flex items-center justify-between text-[10px] py-1 px-2 ${diff > 0 ? "bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400" : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"}`}>
                          <div className="flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            <span>{diff > 0 ? "미배정" : "초과"} {fmtComma(Math.abs(diff))}원</span>
                          </div>
                          <span className="text-muted-foreground">
                            프로젝트 총액 {fmtComma(projectTotal)}원 (공급 {fmtComma(project.totalAmount || 0)})
                            {diff > 0 && " — 예정 항목 금액을 조정하거나 새 항목을 추가하세요"}
                          </span>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
            {showAddPayment ? (
              <div className="border rounded p-2 space-y-1.5 bg-muted/20">
                <div className="text-[10px] font-medium">수금 항목 추가</div>
                <div className="flex items-center gap-1.5 text-xs">
                  <Input placeholder="내용" value={newPaymentDesc} onChange={e => setNewPaymentDesc(e.target.value)} className="h-6 text-xs w-[120px] px-1" data-testid="input-new-payment-desc" />
                  <Input type="date" value={newPaymentDate} onChange={e => setNewPaymentDate(e.target.value)} className="h-6 text-xs w-[120px] px-1" data-testid="input-new-payment-date" />
                  <CommaInput value={newPaymentAmount} onChange={setNewPaymentAmount} className="h-6 text-xs w-[100px] px-1" data-testid="input-new-payment-amount" />
                  <span className="text-[10px] text-muted-foreground">원</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" className="h-6 text-[10px] px-2" data-testid="button-save-new-payment"
                    disabled={!newPaymentDesc || !newPaymentAmount}
                    onClick={() => {
                      createPaymentMutation.mutate({ type: "income", projectId: project.id, companyName: project.customerName || "", description: newPaymentDesc, amount: newPaymentAmount, plannedDate: newPaymentDate || undefined, status: "planned" });
                      setShowAddPayment(false); setNewPaymentDesc(""); setNewPaymentAmount(0); setNewPaymentDate("");
                    }}>
                    <Check className="h-3 w-3 mr-0.5" />추가
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => setShowAddPayment(false)} data-testid="button-cancel-new-payment">취소</Button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 w-full" onClick={() => setShowAddPayment(true)} data-testid="button-add-payment">
                <Plus className="h-3 w-3 mr-0.5" />수금 항목 추가
              </Button>
            )}
          </div>
        ) : (
          <div className="text-center py-6 text-sm text-muted-foreground">
            <Settings className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
            <p>계약조건을 먼저 설정해주세요.</p>
            <p className="text-[10px] mt-1">계약조건 탭에서 총 금액과 비율을 입력하면 수금 계획을 생성할 수 있습니다.</p>
          </div>
        )}
        </TabsContent>

        <TabsContent value="invoices" className="mt-2 space-y-3">
        {hasConditions ? (
          <>
        {(() => {
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
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium flex items-center gap-1"><FileText className="h-3 w-3" />계산서 발행 계획 <span className="text-[9px] text-muted-foreground font-normal">(공급가액 기준)</span></span>
                <div className="flex items-center gap-1">
                  {project.salesInvoices.length > 0 ? (
                    <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => setShowInvoiceRegenConfirm(true)} disabled={genInvoiceMutation.isPending} data-testid="button-gen-invoice">
                      {genInvoiceMutation.isPending ? "생성중..." : "재생성"}
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => genInvoiceMutation.mutate(false)} disabled={genInvoiceMutation.isPending} data-testid="button-gen-invoice">
                      {genInvoiceMutation.isPending ? "생성중..." : "계산서 생성"}
                    </Button>
                  )}
                </div>
              </div>
              {showInvoiceRegenConfirm && (
                <div className="border rounded p-2 bg-orange-50/50 dark:bg-orange-900/10 space-y-1.5">
                  <div className="text-[10px] font-medium text-orange-700 dark:text-orange-400 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />계산서 재생성 확인
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {(() => {
                      const issued = project.salesInvoices.filter((i: any) => !!i.issueDate).length;
                      const placeholder = project.salesInvoices.filter((i: any) => !i.issueDate).length;
                      if (issued > 0 && placeholder > 0) return `미발행 ${placeholder}건이 삭제되고 새로 생성됩니다. (발행완료 ${issued}건은 유지됩니다)`;
                      if (issued > 0) return `발행완료 ${issued}건은 유지되며, 미발행 스테이지만 새로 생성됩니다.`;
                      return `기존 미발행 계산서 ${placeholder}건이 삭제되고 계약조건에 따라 새로 생성됩니다.`;
                    })()}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="destructive" className="h-6 text-[10px] px-2" data-testid="button-confirm-invoice-regen"
                      onClick={() => genInvoiceMutation.mutate(true)}>
                      재생성
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => setShowInvoiceRegenConfirm(false)} data-testid="button-cancel-invoice-regen">
                      취소
                    </Button>
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                {stages.map(stage => {
                  const supply = Math.round(plannedTotal * stage.ratio / 100);
                  const vat = Math.round(supply * 0.1);
                  const stageInvoices = project.salesInvoices.filter(i => i.invoiceStage === stage.name);
                  const stageLinkedSupply = stageInvoices.reduce((s, i) => s + (i.supplyAmount || 0), 0);
                  const stageDiff = supply - stageLinkedSupply;
                  const isPickerOpen = stagePicker === stage.name;

                  return (
                    <div key={stage.name} className="border rounded overflow-hidden">
                      <div className="flex items-center justify-between text-xs py-1.5 px-2 bg-muted/20">
                        <span className="font-medium">{stage.name} ({stage.ratio}%)</span>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <span>공급 {fmtComma(supply)}</span>
                          <span>VAT {fmtComma(vat)}</span>
                          <span className="font-medium text-foreground">{fmtComma(supply + vat)}원</span>
                          <Button size="sm" variant="ghost" className="h-5 text-[10px] px-1" onClick={() => { setStagePicker(isPickerOpen ? null : stage.name); setStageSearchTerm(""); }} data-testid={`button-link-stage-${stage.name}`}>
                            <Plus className="h-3 w-3 mr-0.5" />연결
                          </Button>
                        </div>
                      </div>
                      {isPickerOpen && (
                        <div className="p-2 bg-muted/10 border-t space-y-1">
                          <Input placeholder="거래처/품목 검색..." value={stageSearchTerm} onChange={e => setStageSearchTerm(e.target.value)} className="h-6 text-xs" data-testid={`input-stage-search-${stage.name}`} />
                          <div className="max-h-28 overflow-y-auto space-y-0.5">
                            {stageUnlinkedSales.slice(0, 15).map(inv => (
                              <div key={inv.id} className="flex items-center justify-between text-[10px] py-1 px-1 hover:bg-muted rounded cursor-pointer" onClick={() => { linkMutation.mutate({ type: "sales", invoiceId: inv.id, link: true, invoiceStage: stage.name }); setStagePicker(null); }} data-testid={`link-stage-${stage.name}-${inv.id}`}>
                                <span className="truncate">{inv.issueDate} {inv.companyName} {inv.item ? `(${inv.item})` : ""}</span>
                                <span className="text-blue-600 ml-2 whitespace-nowrap">공급 {fmtComma(inv.supplyAmount || 0)}</span>
                              </div>
                            ))}
                            {stageUnlinkedSales.length === 0 && <div className="text-[10px] text-muted-foreground py-1">연결 가능한 계산서가 없습니다</div>}
                          </div>
                        </div>
                      )}
                      {stageInvoices.length > 0 && (
                        <div className="border-t">
                          {stageInvoices.map(inv => {
                            const isIssued = !!inv.issueDate;
                            const isPastDue = !isIssued && inv.plannedIssueDate && inv.plannedIssueDate < new Date().toISOString().split("T")[0];
                            const isEditingDate = editingInvoiceDateId === inv.id;
                            return (
                              <div key={inv.id} className={`text-[10px] py-1 px-2 border-b last:border-b-0 ${isIssued ? "bg-green-50/50 dark:bg-green-900/10" : isPastDue ? "bg-red-50/50 dark:bg-red-900/10" : ""}`}>
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className={`text-[9px] px-1 py-0.5 rounded whitespace-nowrap ${isIssued ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : isPastDue ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"}`}>
                                      {isIssued ? "발행완료" : isPastDue ? "미발행(지연)" : "미발행"}
                                    </span>
                                    <span className="truncate">{inv.companyName}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-muted-foreground">공급 {fmtComma(inv.supplyAmount || 0)}</span>
                                    <span className="text-muted-foreground">VAT {fmtComma(inv.taxAmount || 0)}</span>
                                    <span className="text-blue-600 font-medium">{fmtComma(inv.totalAmount || 0)}원</span>
                                    <Button size="sm" variant="ghost" className="h-4 w-4 p-0" onClick={() => linkMutation.mutate({ type: "sales", invoiceId: inv.id, link: false })} data-testid={`unlink-stage-${inv.id}`}>
                                      <X className="h-2.5 w-2.5 text-muted-foreground" />
                                    </Button>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  {isIssued ? (
                                    <span className="text-green-700 dark:text-green-400">발행일 {inv.issueDate}</span>
                                  ) : isEditingDate ? (
                                    <div className="flex items-center gap-1">
                                      <span className="text-muted-foreground">예정일</span>
                                      <Input type="date" value={editInvoiceDate} onChange={e => setEditInvoiceDate(e.target.value)} className="h-5 text-[10px] w-[120px] px-1" data-testid={`input-invoice-date-${inv.id}`} />
                                      <Button size="sm" variant="ghost" className="h-5 w-5 p-0" data-testid={`button-save-invoice-date-${inv.id}`}
                                        onClick={() => { updateInvoiceDateMutation.mutate({ id: inv.id, plannedIssueDate: editInvoiceDate || null }); setEditingInvoiceDateId(null); }}>
                                        <Check className="h-3 w-3" />
                                      </Button>
                                      <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => setEditingInvoiceDateId(null)} data-testid={`button-cancel-invoice-date-${inv.id}`}>
                                        <X className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  ) : (
                                    <span className={`cursor-pointer hover:underline ${isPastDue ? "text-red-600 dark:text-red-400 font-medium" : inv.plannedIssueDate ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground"}`}
                                      onClick={() => { setEditingInvoiceDateId(inv.id); setEditInvoiceDate(inv.plannedIssueDate || ""); }}
                                      data-testid={`text-invoice-date-${inv.id}`}>
                                      {inv.plannedIssueDate ? `예정 ${inv.plannedIssueDate}` : "예정일 미정 (클릭하여 설정)"}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {stageInvoices.length > 0 && (
                        <div className="flex items-center justify-end text-[10px] py-1 px-2 bg-muted/10 border-t">
                          {stageDiff === 0 ? (
                            <span className="text-green-600 font-medium flex items-center gap-0.5"><Check className="h-2.5 w-2.5" />일치</span>
                          ) : stageDiff > 0 ? (
                            <span className="text-orange-600">미발행 공급 {fmtComma(stageDiff)}원</span>
                          ) : (
                            <span className="text-red-600">초과 공급 {fmtComma(Math.abs(stageDiff))}원</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between text-[10px] px-1 pt-1">
                <span className="text-muted-foreground">연결 합계: 공급 {fmtComma(linkedTotal)} + VAT {fmtComma(Math.round(linkedTotal * 0.1))} = {fmtComma(Math.round(linkedTotal * 1.1))}원</span>
                {diff === 0 ? (
                  <span className="text-green-600 font-medium flex items-center gap-0.5"><Check className="h-3 w-3" />일치</span>
                ) : diff > 0 ? (
                  <span className="text-orange-600 font-medium">미발행 공급 {fmtComma(diff)}원</span>
                ) : (
                  <span className="text-red-600 font-medium">초과 공급 {fmtComma(Math.abs(diff))}원</span>
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
              {project.salesInvoices.map(inv => {
                const isIssued = !!inv.issueDate;
                const isPastDue = !isIssued && inv.plannedIssueDate && inv.plannedIssueDate < new Date().toISOString().split("T")[0];
                const isEditingDate = editingInvoiceDateId === inv.id;
                return (
                  <div key={inv.id} className={`text-xs py-1.5 px-2 border-b last:border-b-0 ${isIssued ? "bg-green-50/30 dark:bg-green-900/10" : isPastDue ? "bg-red-50/30 dark:bg-red-900/10" : "hover:bg-muted/30"}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`text-[9px] px-1 py-0.5 rounded whitespace-nowrap ${isIssued ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : isPastDue ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"}`}>
                          {isIssued ? "발행완료" : isPastDue ? "미발행(지연)" : "미발행"}
                        </span>
                        <span className="font-medium truncate">{inv.companyName}</span>
                        {inv.item && <span className="text-muted-foreground truncate hidden md:inline">({inv.item})</span>}
                        {inv.invoiceStage && <span className="text-[9px] px-1 py-0.5 rounded bg-blue-50 text-blue-600 dark:bg-blue-900/30 whitespace-nowrap">{inv.invoiceStage}</span>}
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-blue-600 font-medium whitespace-nowrap">{fmtComma(inv.totalAmount || 0)}원</span>
                        <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => linkMutation.mutate({ type: "sales", invoiceId: inv.id, link: false })} data-testid={`unlink-sales-${inv.id}`}>
                          <X className="h-3 w-3 text-muted-foreground" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 text-[10px]">
                      {isIssued ? (
                        <span className="text-green-700 dark:text-green-400">발행일 {inv.issueDate}</span>
                      ) : isEditingDate ? (
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">예정일</span>
                          <Input type="date" value={editInvoiceDate} onChange={e => setEditInvoiceDate(e.target.value)} className="h-5 text-[10px] w-[120px] px-1" data-testid={`input-sales-invoice-date-${inv.id}`} />
                          <Button size="sm" variant="ghost" className="h-5 w-5 p-0" data-testid={`button-save-sales-invoice-date-${inv.id}`}
                            onClick={() => { updateInvoiceDateMutation.mutate({ id: inv.id, plannedIssueDate: editInvoiceDate || null }); setEditingInvoiceDateId(null); }}>
                            <Check className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => setEditingInvoiceDateId(null)} data-testid={`button-cancel-sales-invoice-date-${inv.id}`}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <span className={`cursor-pointer hover:underline ${isPastDue ? "text-red-600 dark:text-red-400 font-medium" : inv.plannedIssueDate ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground"}`}
                          onClick={() => { setEditingInvoiceDateId(inv.id); setEditInvoiceDate(inv.plannedIssueDate || ""); }}
                          data-testid={`text-sales-invoice-date-${inv.id}`}>
                          {inv.plannedIssueDate ? `예정 ${inv.plannedIssueDate}` : "예정일 미정 (클릭하여 설정)"}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
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
        </>
        ) : (
          <div className="text-center py-6 text-sm text-muted-foreground">
            <Settings className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
            <p>계약조건을 먼저 설정해주세요.</p>
            <p className="text-[10px] mt-1">계약조건 탭에서 총 금액과 비율을 입력하면 계산서 발행 계획을 생성할 수 있습니다.</p>
          </div>
        )}
        </TabsContent>
      </Tabs>
    </DialogContent>
  );
}

export default function ProjectList() {
  const { toast } = useToast();
  const searchString = useSearch();
  const urlParams = new URLSearchParams(searchString);
  const urlStatus = urlParams.get("status");
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

  const filteredProjects = useMemo(() => {
    if (!projects) return [];
    if (!urlStatus) return projects;
    return projects.filter(p => (p.status || "active") === urlStatus);
  }, [projects, urlStatus]);

  const totals = useMemo(() => {
    if (!filteredProjects.length) return { contract: 0, issued: 0, collected: 0, purchase: 0, profit: 0 };
    return {
      contract: filteredProjects.reduce((s, p) => s + (p.totalAmount || 0), 0),
      issued: filteredProjects.reduce((s, p) => s + (p.salesSupplyTotal || 0), 0),
      collected: filteredProjects.reduce((s, p) => s + Math.round((p.paidIncome || 0) / 1.1), 0),
      purchase: filteredProjects.reduce((s, p) => s + p.purchaseTotal, 0),
      profit: filteredProjects.reduce((s, p) => s + p.profit, 0),
    };
  }, [filteredProjects]);

  return (
    <div className="p-6 space-y-4 overflow-auto h-full">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-semibold" data-testid="text-project-list-title">
          프로젝트{urlStatus === "active" ? " - 진행중" : urlStatus === "completed" ? " - 완료" : ""}
        </h1>
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

      {filteredProjects.length > 0 && (
        <div className="grid grid-cols-5 gap-2">
          <div className="border rounded-lg p-2.5">
            <div className="text-[10px] text-muted-foreground">계약</div>
            <div className="text-sm font-semibold" data-testid="text-total-contract">{fmt(totals.contract)}원</div>
          </div>
          <div className="border rounded-lg p-2.5 bg-blue-50/50 dark:bg-blue-900/10">
            <div className="text-[10px] text-muted-foreground">발행</div>
            <div className="text-sm font-semibold text-blue-600" data-testid="text-total-issued">{fmt(totals.issued)}원</div>
          </div>
          <div className="border rounded-lg p-2.5 bg-green-50/50 dark:bg-green-900/10">
            <div className="text-[10px] text-muted-foreground">수금</div>
            <div className="text-sm font-semibold text-green-600" data-testid="text-total-collected">{fmt(totals.collected)}원</div>
          </div>
          <div className="border rounded-lg p-2.5 bg-red-50/50 dark:bg-red-900/10">
            <div className="text-[10px] text-muted-foreground">매입</div>
            <div className="text-sm font-semibold text-red-600" data-testid="text-total-purchase">{fmt(totals.purchase)}원</div>
          </div>
          <div className={`border rounded-lg p-2.5 ${totals.profit >= 0 ? "bg-green-50/50 dark:bg-green-900/10" : "bg-orange-50/50 dark:bg-orange-900/10"}`}>
            <div className="text-[10px] text-muted-foreground">수익</div>
            <div className={`text-sm font-semibold ${totals.profit >= 0 ? "text-green-600" : "text-orange-600"}`} data-testid="text-total-profit">{fmt(totals.profit)}원</div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10" />)}</div>
      ) : filteredProjects.length > 0 ? (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left py-2 px-3 font-medium text-xs w-20">번호</th>
                <th className="text-left py-2 px-3 font-medium text-xs">고객사</th>
                <th className="text-left py-2 px-3 font-medium text-xs hidden md:table-cell">내용</th>
                <th className="text-right py-2 px-3 font-medium text-xs hidden md:table-cell w-20">계약</th>
                <th className="text-right py-2 px-3 font-medium text-xs hidden md:table-cell w-20">발행</th>
                <th className="text-right py-2 px-3 font-medium text-xs hidden md:table-cell w-20">수금</th>
                <th className="text-center py-2 px-3 font-medium text-xs w-14">상태</th>
                <th className="text-center py-2 px-3 font-medium text-xs w-10">폴더</th>
              </tr>
            </thead>
            <tbody>
              {filteredProjects.map(p => {
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
                      {(p.totalAmount || 0) > 0 ? (
                        <span className="text-xs font-medium">{(p.totalAmount || 0).toLocaleString()}</span>
                      ) : <span className="text-xs text-muted-foreground">-</span>}
                    </td>
                    <td className="py-2 px-3 text-right hidden md:table-cell">
                      {(p.salesSupplyTotal || 0) > 0 ? (
                        <span className="text-xs font-medium text-blue-600">{(p.salesSupplyTotal || 0).toLocaleString()}</span>
                      ) : <span className="text-xs text-muted-foreground">-</span>}
                    </td>
                    <td className="py-2 px-3 text-right hidden md:table-cell">
                      {(p.paidIncome || 0) > 0 ? (
                        <span className="text-xs font-medium text-green-600">{Math.round((p.paidIncome || 0) / 1.1).toLocaleString()}</span>
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
