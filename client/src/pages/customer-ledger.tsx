import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText, FolderKanban, Wallet, CircleCheck, CircleDot, Clock, CircleMinus } from "lucide-react";
import type { Customer } from "@shared/schema";
import { InvoiceDetailModal } from "./sales-invoice-list";

type LedgerInvoice = {
  id: string;
  invoiceNumber: string | null;
  issueDate: string | null;
  writeDate: string | null;
  plannedIssueDate: string | null;
  item: string | null;
  totalAmount: number | null;
  paidAmount: number;
  remainingAmount: number;
  paymentStatus: "none" | "planned" | "partial" | "completed";
  nextPaymentDate: string | null;
  payments: { id: string; status: string | null; amount: number | null; actualAmount: number | null; plannedDate: string | null; actualDate: string | null }[];
};

type LedgerGroup = {
  project: { id: string; projectNumber: string | null; description: string | null } | null;
  invoices: LedgerInvoice[];
};

type LedgerData = {
  customer: Customer;
  summary: { invoiceTotal: number; collectedTotal: number; outstanding: number; projectCount: number; invoiceCount: number };
  groups: LedgerGroup[];
};

type Period = "6m" | "1y" | "2y" | "all";

const fmt = (n: number | null | undefined) => (n || n === 0 ? Number(n).toLocaleString() : "-");
const fmtDate = (d: string | null | undefined) => d || "-";

function periodRange(period: Period): { startDate: string; endDate: string } {
  if (period === "all") return { startDate: "", endDate: "" };
  const end = new Date().toISOString().slice(0, 10);
  const s = new Date();
  if (period === "6m") s.setMonth(s.getMonth() - 6);
  else if (period === "1y") s.setFullYear(s.getFullYear() - 1);
  else if (period === "2y") s.setFullYear(s.getFullYear() - 2);
  return { startDate: s.toISOString().slice(0, 10), endDate: end };
}

function PaymentStatusBadge({ inv }: { inv: LedgerInvoice }) {
  if (inv.paymentStatus === "completed") {
    return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0"><CircleCheck className="h-3 w-3 mr-1" />입금완료</Badge>;
  }
  if (inv.paymentStatus === "partial") {
    return <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-0"><CircleDot className="h-3 w-3 mr-1" />일부입금</Badge>;
  }
  if (inv.paymentStatus === "planned") {
    return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-0"><Clock className="h-3 w-3 mr-1" />입금계획</Badge>;
  }
  return <Badge variant="outline" className="text-muted-foreground border-muted-foreground/30"><CircleMinus className="h-3 w-3 mr-1" />미설정</Badge>;
}

export default function CustomerLedger() {
  const [customerId, setCustomerId] = useState<string>("");
  const [period, setPeriod] = useState<Period>("1y");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);

  const { startDate, endDate } = periodRange(period);

  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });

  const { data: ledger, isLoading } = useQuery<LedgerData>({
    queryKey: ["/api/customers", customerId, "ledger", period],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      const url = `/api/customers/${customerId}/ledger${params.toString() ? "?" + params.toString() : ""}`;
      const res = await apiRequest("GET", url);
      return res.json();
    },
    enabled: !!customerId,
  });

  const sortedCustomers = useMemo(
    () => [...customers].sort((a, b) => (a.companyName || "").localeCompare(b.companyName || "")),
    [customers],
  );

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="flex items-center gap-3 p-3 border-b bg-background flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">고객사</span>
          <Select value={customerId} onValueChange={setCustomerId}>
            <SelectTrigger className="w-52 h-8 text-sm" data-testid="select-customer-ledger">
              <SelectValue placeholder="고객사 선택..." />
            </SelectTrigger>
            <SelectContent>
              {sortedCustomers.map(c => <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1 border rounded-lg p-0.5">
          {(["6m", "1y", "2y", "all"] as const).map(p => (
            <Button
              key={p}
              variant={period === p ? "default" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setPeriod(p)}
              data-testid={`period-${p}`}
            >
              {p === "6m" ? "6개월" : p === "1y" ? "1년" : p === "2y" ? "2년" : "전체"}
            </Button>
          ))}
        </div>
        {period !== "all" && startDate && (
          <span className="text-xs text-muted-foreground">{startDate} ~ {endDate}</span>
        )}
        {ledger && (
          <div className="ml-auto flex items-center divide-x text-sm border rounded-md overflow-hidden">
            <div className="text-center px-3 py-1.5">
              <div className="text-xs text-muted-foreground leading-none mb-0.5">계산서 총액</div>
              <div className="font-semibold leading-none">{fmt(ledger.summary.invoiceTotal)}</div>
            </div>
            <div className="text-center px-3 py-1.5">
              <div className="text-xs text-muted-foreground leading-none mb-0.5">수금완료</div>
              <div className="font-semibold text-green-600 leading-none">{fmt(ledger.summary.collectedTotal)}</div>
            </div>
            <div className="text-center px-3 py-1.5">
              <div className="text-xs text-muted-foreground leading-none mb-0.5">미수금</div>
              <div className={`font-semibold leading-none ${ledger.summary.outstanding > 0 ? "text-red-500" : "text-muted-foreground"}`}>
                {fmt(ledger.summary.outstanding)}
              </div>
            </div>
            <div className="text-center px-3 py-1.5">
              <div className="text-xs text-muted-foreground leading-none mb-0.5">프로젝트</div>
              <div className="font-semibold leading-none">{ledger.summary.projectCount}건</div>
            </div>
          </div>
        )}
      </div>

      {!customerId ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground flex-col gap-2">
          <Wallet className="h-10 w-10 opacity-30" />
          <p className="text-sm">고객사를 선택하면 거래원장이 표시됩니다.</p>
        </div>
      ) : isLoading ? (
        <div className="p-6 space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : !ledger || ledger.groups.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground flex-col gap-2">
          <FileText className="h-10 w-10 opacity-30" />
          <p className="text-sm">해당 기간에 거래 내역이 없습니다.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {ledger.groups.map((g, gi) => {
            const groupTotal = g.invoices.reduce((s, i) => s + (i.totalAmount || 0), 0);
            const groupPaid = g.invoices.reduce((s, i) => s + i.paidAmount, 0);
            const groupOut = g.invoices.reduce((s, i) => s + i.remainingAmount, 0);
            const isUnlinked = g.project === null;
            return (
              <div key={g.project?.id || `unlinked-${gi}`} className="border rounded-lg overflow-hidden" data-testid={`ledger-group-${g.project?.id || "unlinked"}`}>
                <div className={`flex items-center gap-2 px-4 py-2 border-b ${isUnlinked ? "bg-amber-50 dark:bg-amber-950/20" : "bg-muted/40"}`}>
                  {isUnlinked ? (
                    <span className="flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-300">
                      <FileText className="h-4 w-4" />미연결 계산서
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <FolderKanban className="h-4 w-4 text-muted-foreground" />
                      <Badge variant="outline" className="font-mono text-xs">{g.project?.projectNumber || "-"}</Badge>
                      {g.project?.description || ""}
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-3 text-xs">
                    <span className="text-muted-foreground">계산서 {fmt(groupTotal)}</span>
                    <span className="text-green-600 dark:text-green-400">수금 {fmt(groupPaid)}</span>
                    <span className={groupOut > 0 ? "text-red-600 dark:text-red-400 font-medium" : "text-muted-foreground"}>미수금 {fmt(groupOut)}</span>
                  </div>
                </div>
                {g.invoices.length === 0 ? (
                  <div className="px-4 py-3 text-xs text-muted-foreground">계산서 없음</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/20 text-muted-foreground text-xs">
                        <th className="px-3 py-2 text-left font-medium">발급일</th>
                        <th className="px-3 py-2 text-left font-medium">계산서번호</th>
                        <th className="px-3 py-2 text-left font-medium hidden md:table-cell">품목</th>
                        <th className="px-3 py-2 text-right font-medium">합계</th>
                        <th className="px-3 py-2 text-right font-medium">수금액</th>
                        <th className="px-3 py-2 text-right font-medium">잔액</th>
                        <th className="px-3 py-2 text-center font-medium">상태</th>
                        <th className="px-3 py-2 text-left font-medium hidden lg:table-cell">입금예정일</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.invoices.map(inv => {
                        const unissued = !inv.issueDate;
                        return (
                          <tr
                            key={inv.id}
                            className={`border-b last:border-0 hover:bg-muted/20 cursor-pointer ${unissued ? "bg-amber-50/40 dark:bg-amber-950/10" : ""}`}
                            onClick={() => setSelectedInvoiceId(inv.id)}
                            data-testid={`ledger-invoice-${inv.id}`}
                          >
                            <td className="px-3 py-2 text-xs">
                              {inv.issueDate || <span className="text-amber-600 dark:text-amber-400">미발행</span>}
                            </td>
                            <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{inv.invoiceNumber || "-"}</td>
                            <td className="px-3 py-2 text-xs hidden md:table-cell">{inv.item || "-"}</td>
                            <td className="px-3 py-2 text-right font-medium">{fmt(inv.totalAmount)}</td>
                            <td className="px-3 py-2 text-right text-green-600 dark:text-green-400">{inv.paidAmount > 0 ? fmt(inv.paidAmount) : "-"}</td>
                            <td className="px-3 py-2 text-right">
                              {inv.remainingAmount > 0
                                ? <span className="text-red-600 dark:text-red-400 font-medium">{fmt(inv.remainingAmount)}</span>
                                : <span className="text-muted-foreground">-</span>}
                            </td>
                            <td className="px-3 py-2 text-center"><PaymentStatusBadge inv={inv} /></td>
                            <td className="px-3 py-2 text-xs text-muted-foreground hidden lg:table-cell">{fmtDate(inv.nextPaymentDate)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!selectedInvoiceId} onOpenChange={open => { if (!open) setSelectedInvoiceId(null); }}>
        {selectedInvoiceId && <InvoiceDetailModal invoiceId={selectedInvoiceId} onClose={() => setSelectedInvoiceId(null)} />}
      </Dialog>
    </div>
  );
}
