import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Receipt, Wallet, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
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

      <Dialog open={!!selectedProjectId} onOpenChange={open => { if (!open) setSelectedProjectId(null); }}>
        {selectedProjectId && <ProjectDetailModal projectId={selectedProjectId} onClose={() => setSelectedProjectId(null)} />}
      </Dialog>

      <Dialog open={!!selectedInvoiceId} onOpenChange={open => { if (!open) setSelectedInvoiceId(null); }}>
        {selectedInvoiceId && <InvoiceDetailModal invoiceId={selectedInvoiceId} onClose={() => setSelectedInvoiceId(null)} />}
      </Dialog>
    </div>
  );
}
