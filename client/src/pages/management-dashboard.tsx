import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Receipt, Wallet, Clock, ChevronDown, ChevronUp, Archive, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { ProjectDetailModal } from "./project-list";
import { InvoiceDetailModal } from "./sales-invoice-list";

type UnissuedInvoice = {
  invoiceId: string;
  projectId: string;
  projectNumber: string;
  customerName: string;
  stage: string;
  supplyAmount: number;
  taxAmount: number;
  totalAmount: number;
  plannedIssueDate: string | null;
  isOverdue: boolean;
};

type UncollectedPayment = {
  paymentId: string;
  projectId: string | null;
  salesInvoiceId: string | null;
  projectNumber: string;
  customerName: string;
  description: string;
  amount: number;
  plannedDate: string | null;
  isOverdue: boolean;
};

type DashboardData = {
  summary: {
    unissuedCount: number;
    overdueInvoiceCount: number;
    uncollectedCount: number;
    overduePaymentCount: number;
    totalUnissuedAmount: number;
    totalOverdueAmount: number;
    totalUncollected: number;
    totalOverduePayment: number;
  };
  unissuedInvoices: UnissuedInvoice[];
  uncollectedPayments: UncollectedPayment[];
};

function fmtComma(n: number): string {
  if (!n && n !== 0) return "-";
  return n.toLocaleString();
}

function fmtDate(d: string | null): string {
  if (!d) return "-";
  return d;
}

function daysFromToday(dateStr: string | null): string {
  if (!dateStr) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  const diff = Math.floor((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return `${Math.abs(diff)}일 지연`;
  if (diff === 0) return "오늘";
  return `${diff}일 후`;
}

function BulkCompleteSection() {
  const { toast } = useToast();
  const currentYear = new Date().getFullYear();
  const [toYear, setToYear] = useState(String(currentYear - 1));
  const [toMonth, setToMonth] = useState("12");
  const [preview, setPreview] = useState<{ invoiceCount: number; paymentCount: number; cutoffDate: string } | null>(null);

  const years = Array.from({ length: 5 }, (_, i) => String(currentYear - 1 - i));
  const months = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `${i + 1}월` }));

  const previewMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/purchase-invoices/bulk-complete", { toYear: Number(toYear), toMonth: Number(toMonth), preview: true });
      return res.json();
    },
    onSuccess: (data) => setPreview(data),
    onError: (e: Error) => toast({ title: "조회 실패", description: e.message, variant: "destructive" }),
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/purchase-invoices/bulk-complete", { toYear: Number(toYear), toMonth: Number(toMonth) });
      return res.json();
    },
    onSuccess: (data) => {
      setPreview(null);
      toast({ title: "일괄 완료 처리 완료", description: `계산서 ${data.updatedInvoices}건, 자금계획 ${data.updatedPayments}건 지급완료 처리됨` });
    },
    onError: (e: Error) => toast({ title: "처리 실패", description: e.message, variant: "destructive" }),
  });

  return (
    <Card className="border-dashed">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Archive className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">매입계산서 이전 데이터 일괄 완료 처리</span>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          선택한 기간까지의 미완료 매입계산서를 지급완료로 일괄 처리합니다.<br />
          연결된 자금계획도 완료 처리되며, 없는 경우 완료 payment가 자동 생성됩니다.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">~</span>
          <Select value={toYear} onValueChange={v => { setToYear(v); setPreview(null); }}>
            <SelectTrigger className="w-24 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map(y => <SelectItem key={y} value={y}>{y}년</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={toMonth} onValueChange={v => { setToMonth(v); setPreview(null); }}>
            <SelectTrigger className="w-20 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {months.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">까지</span>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending}>
            {previewMutation.isPending ? "조회 중..." : "대상 조회"}
          </Button>
        </div>

        {preview && (
          <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-md border border-amber-200 dark:border-amber-800">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">{preview.cutoffDate} 이전 미완료 항목</p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                  매입계산서 <strong>{preview.invoiceCount}건</strong> · 자금계획 <strong>{preview.paymentCount}건</strong> 처리 예정
                </p>
                {preview.invoiceCount === 0 && (
                  <p className="text-xs text-muted-foreground mt-1">처리할 항목이 없습니다.</p>
                )}
              </div>
              {preview.invoiceCount > 0 && (
                <Button
                  size="sm"
                  className="h-8 text-xs shrink-0 bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={() => {
                    if (confirm(`${preview.cutoffDate}까지 매입계산서 ${preview.invoiceCount}건을 지급완료 처리하시겠습니까?`)) {
                      completeMutation.mutate();
                    }
                  }}
                  disabled={completeMutation.isPending}
                >
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  {completeMutation.isPending ? "처리 중..." : "일괄 완료 처리"}
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ManagementDashboard() {
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/management-dashboard"],
  });

  const [showAllInvoices, setShowAllInvoices] = useState(false);
  const [showAllPayments, setShowAllPayments] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!data) return <div className="p-4 text-muted-foreground">데이터를 불러올 수 없습니다</div>;

  const { summary, unissuedInvoices, uncollectedPayments } = data;

  const overdueInvoices = unissuedInvoices.filter(i => i.isOverdue);
  const pendingInvoices = unissuedInvoices.filter(i => !i.isOverdue);

  const overduePayments = uncollectedPayments.filter(p => p.isOverdue);
  const pendingPayments = uncollectedPayments.filter(p => !p.isOverdue);

  const displayInvoices = showAllInvoices ? unissuedInvoices : unissuedInvoices.slice(0, 10);
  const displayPayments = showAllPayments ? uncollectedPayments : uncollectedPayments.slice(0, 10);

  return (
    <div className="h-full overflow-auto p-4 space-y-4" data-testid="page-management-dashboard">
      <h1 className="text-lg font-semibold">경영지원 대시보드</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className={summary.overdueInvoiceCount > 0 ? "border-red-300 bg-red-50/50 dark:bg-red-900/10" : ""}>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className={`h-4 w-4 ${summary.overdueInvoiceCount > 0 ? "text-red-500" : "text-muted-foreground"}`} />
              <span className="text-[11px] text-muted-foreground">미발행 지연</span>
            </div>
            <div className={`text-xl font-bold ${summary.overdueInvoiceCount > 0 ? "text-red-600" : ""}`} data-testid="text-overdue-invoice-count">
              {summary.overdueInvoiceCount}건
            </div>
            <div className="text-[10px] text-muted-foreground">{fmtComma(summary.totalOverdueAmount)}원</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Receipt className="h-4 w-4 text-orange-500" />
              <span className="text-[11px] text-muted-foreground">미발행 전체</span>
            </div>
            <div className="text-xl font-bold" data-testid="text-unissued-count">
              {summary.unissuedCount}건
            </div>
            <div className="text-[10px] text-muted-foreground">{fmtComma(summary.totalUnissuedAmount)}원</div>
          </CardContent>
        </Card>

        <Card className={summary.overduePaymentCount > 0 ? "border-red-300 bg-red-50/50 dark:bg-red-900/10" : ""}>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Clock className={`h-4 w-4 ${summary.overduePaymentCount > 0 ? "text-red-500" : "text-muted-foreground"}`} />
              <span className="text-[11px] text-muted-foreground">수금 지연</span>
            </div>
            <div className={`text-xl font-bold ${summary.overduePaymentCount > 0 ? "text-red-600" : ""}`} data-testid="text-overdue-payment-count">
              {summary.overduePaymentCount}건
            </div>
            <div className="text-[10px] text-muted-foreground">{fmtComma(summary.totalOverduePayment)}원</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="h-4 w-4 text-blue-500" />
              <span className="text-[11px] text-muted-foreground">미수금 전체</span>
            </div>
            <div className="text-xl font-bold" data-testid="text-uncollected-count">
              {summary.uncollectedCount}건
            </div>
            <div className="text-[10px] text-muted-foreground">{fmtComma(summary.totalUncollected)}원</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border rounded-lg">
          <div className="p-3 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-orange-500" />
              <span className="text-sm font-medium">미발행 계산서</span>
              <Badge variant="secondary" className="text-[10px] h-5">{unissuedInvoices.length}건</Badge>
              {overdueInvoices.length > 0 && (
                <Badge variant="destructive" className="text-[10px] h-5">{overdueInvoices.length}건 지연</Badge>
              )}
            </div>
          </div>
          <div className="divide-y max-h-[400px] overflow-auto">
            {displayInvoices.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">미발행 계산서가 없습니다</div>
            )}
            {displayInvoices.map((inv) => (
              <div
                key={inv.invoiceId}
                className={`p-2.5 text-xs flex items-center gap-3 cursor-pointer hover:bg-muted/40 transition-colors ${inv.isOverdue ? "bg-red-50/60 dark:bg-red-900/10" : ""}`}
                onClick={() => inv.projectId && setSelectedProjectId(inv.projectId)}
                data-testid={`row-unissued-invoice-${inv.invoiceId}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-muted-foreground">{inv.projectNumber}</span>
                    <span className="font-medium truncate">{inv.customerName}</span>
                    {inv.stage && <Badge variant="outline" className="text-[9px] h-4 px-1">{inv.stage}</Badge>}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                    <span>공급가: {fmtComma(inv.supplyAmount)}원</span>
                    <span>VAT포함: {fmtComma(inv.totalAmount)}원</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-[11px] ${inv.isOverdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                    {fmtDate(inv.plannedIssueDate)}
                  </div>
                  {inv.plannedIssueDate && (
                    <div className={`text-[10px] ${inv.isOverdue ? "text-red-500" : "text-muted-foreground"}`}>
                      {daysFromToday(inv.plannedIssueDate)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {unissuedInvoices.length > 10 && (
            <div className="p-2 border-t text-center">
              <button
                className="text-[11px] text-blue-600 hover:underline flex items-center gap-1 mx-auto"
                onClick={() => setShowAllInvoices(!showAllInvoices)}
                data-testid="button-toggle-all-invoices"
              >
                {showAllInvoices ? <><ChevronUp className="h-3 w-3" />접기</> : <><ChevronDown className="h-3 w-3" />전체 {unissuedInvoices.length}건 보기</>}
              </button>
            </div>
          )}
          {unissuedInvoices.length > 0 && (
            <div className="p-2 border-t bg-muted/20 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>지연: {overdueInvoices.length}건 ({fmtComma(summary.totalOverdueAmount)}원)</span>
              <span>예정: {pendingInvoices.length}건</span>
              <span className="font-medium text-foreground">합계: {fmtComma(summary.totalUnissuedAmount)}원</span>
            </div>
          )}
        </div>

        <div className="border rounded-lg">
          <div className="p-3 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-medium">미수금 현황</span>
              <Badge variant="secondary" className="text-[10px] h-5">{uncollectedPayments.length}건</Badge>
              {overduePayments.length > 0 && (
                <Badge variant="destructive" className="text-[10px] h-5">{overduePayments.length}건 지연</Badge>
              )}
            </div>
          </div>
          <div className="divide-y max-h-[400px] overflow-auto">
            {displayPayments.length === 0 && (
              <div className="p-6 text-center text-sm text-muted-foreground">미수금 내역이 없습니다</div>
            )}
            {displayPayments.map((pay) => (
              <div
                key={pay.paymentId}
                className={`p-2.5 text-xs flex items-center gap-3 ${(pay.projectId || pay.salesInvoiceId) ? "cursor-pointer hover:bg-muted/40" : ""} transition-colors ${pay.isOverdue ? "bg-red-50/60 dark:bg-red-900/10" : ""}`}
                onClick={() => {
                  if (pay.projectId) setSelectedProjectId(pay.projectId);
                  else if (pay.salesInvoiceId) setSelectedInvoiceId(pay.salesInvoiceId);
                }}
                data-testid={`row-uncollected-payment-${pay.paymentId}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-muted-foreground">{pay.projectNumber}</span>
                    <span className="font-medium truncate">{pay.customerName}</span>
                    {!pay.projectId && pay.salesInvoiceId && (
                      <Badge variant="outline" className="text-[9px] h-4 px-1">계산서</Badge>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{pay.description}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-medium">{fmtComma(pay.amount)}원</div>
                  <div className={`text-[10px] ${pay.isOverdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                    {fmtDate(pay.plannedDate)}
                    {pay.plannedDate && ` (${daysFromToday(pay.plannedDate)})`}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {uncollectedPayments.length > 10 && (
            <div className="p-2 border-t text-center">
              <button
                className="text-[11px] text-blue-600 hover:underline flex items-center gap-1 mx-auto"
                onClick={() => setShowAllPayments(!showAllPayments)}
                data-testid="button-toggle-all-payments"
              >
                {showAllPayments ? <><ChevronUp className="h-3 w-3" />접기</> : <><ChevronDown className="h-3 w-3" />전체 {uncollectedPayments.length}건 보기</>}
              </button>
            </div>
          )}
          {uncollectedPayments.length > 0 && (
            <div className="p-2 border-t bg-muted/20 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>지연: {overduePayments.length}건 ({fmtComma(summary.totalOverduePayment)}원)</span>
              <span>예정: {pendingPayments.length}건</span>
              <span className="font-medium text-foreground">합계: {fmtComma(summary.totalUncollected)}원</span>
            </div>
          )}
        </div>
      </div>

      <BulkCompleteSection />

      <Dialog open={!!selectedProjectId} onOpenChange={open => { if (!open) setSelectedProjectId(null); }}>
        {selectedProjectId && <ProjectDetailModal projectId={selectedProjectId} onClose={() => setSelectedProjectId(null)} />}
      </Dialog>

      <Dialog open={!!selectedInvoiceId} onOpenChange={open => { if (!open) setSelectedInvoiceId(null); }}>
        {selectedInvoiceId && <InvoiceDetailModal invoiceId={selectedInvoiceId} onClose={() => setSelectedInvoiceId(null)} />}
      </Dialog>
    </div>
  );
}
