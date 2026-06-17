import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { FileText, FolderKanban, Wallet, CircleCheck, CircleDot, Clock, CircleMinus, Search, Star, ArrowLeft, Building2 } from "lucide-react";
import type { Customer } from "@shared/schema";
import { InvoiceDetailModal } from "./sales-invoice-list";

type SummaryRow = {
  customerId: string;
  companyName: string;
  isFavorite: boolean;
  invoiceCount: number;
  outstanding: number;
  overdueAmount: number;
  plannedAmount: number;
  noPaymentCount: number;
  lastTransactionDate: string | null;
};

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
type FilterBy = "all" | "favorite" | "noplan";
type SortBy = "outstanding" | "recent" | "name";

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

  // 리스트(허브) 상태
  const [search, setSearch] = useState("");
  const [filterBy, setFilterBy] = useState<FilterBy>("all");
  const [statusFilters, setStatusFilters] = useState<Set<"overdue" | "planned">>(new Set());
  const [sortBy, setSortBy] = useState<SortBy>("outstanding");

  const { startDate, endDate } = periodRange(period);

  const { data: summary = [], isLoading: summaryLoading } = useQuery<SummaryRow[]>({
    queryKey: ["/api/customers-receivables-summary"],
  });

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

  const counts = useMemo(() => ({
    all: summary.length,
    favorite: summary.filter(r => r.isFavorite).length,
    noplan: summary.filter(r => r.noPaymentCount > 0).length,
    overdue: summary.filter(r => r.overdueAmount > 0).length,
    planned: summary.filter(r => r.plannedAmount > 0).length,
  }), [summary]);

  const filteredSummary = useMemo(() => {
    let list = summary;
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(r => r.companyName?.toLowerCase().includes(s));
    }
    if (statusFilters.size > 0) {
      list = list.filter(r =>
        (statusFilters.has("overdue") && r.overdueAmount > 0) ||
        (statusFilters.has("planned") && r.plannedAmount > 0)
      );
    } else {
      if (filterBy === "favorite") list = list.filter(r => r.isFavorite);
      if (filterBy === "noplan") list = list.filter(r => r.noPaymentCount > 0);
    }
    return [...list].sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
      if (sortBy === "outstanding") return b.outstanding - a.outstanding;
      if (sortBy === "recent") return (b.lastTransactionDate || "").localeCompare(a.lastTransactionDate || "");
      return (a.companyName || "").localeCompare(b.companyName || "");
    });
  }, [summary, search, filterBy, statusFilters, sortBy]);

  // ───────────────────── 리스트(허브) 모드 ─────────────────────
  if (!customerId) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 p-3 border-b bg-background flex-wrap">
          <h1 className="text-lg font-semibold flex items-center gap-2"><Wallet className="h-5 w-5" />고객사 거래원장</h1>
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="고객사명 검색" className="pl-8 h-8 text-sm" data-testid="input-search-customer-ledger" />
          </div>
        </div>

        <div className="flex items-center gap-3 px-3 py-2 border-b flex-wrap">
          <div className="flex items-center gap-1">
            {(["all", "favorite", "noplan"] as const).map(f => (
              <Button key={f} size="sm" variant={filterBy === f && statusFilters.size === 0 ? "default" : "ghost"} className="h-7 text-xs" onClick={() => { setFilterBy(f); setStatusFilters(new Set()); }}>
                {f === "all" ? `전체 ${counts.all}` : f === "favorite" ? "⭐ 즐겨찾기" : `⚠️ 계획없음 ${counts.noplan}`}
              </Button>
            ))}
            <span className="mx-1 h-4 w-px bg-border" />
            {(["overdue", "planned"] as const).map(s => (
              <Button
                key={s}
                size="sm"
                variant={statusFilters.has(s) ? "default" : "ghost"}
                className="h-7 text-xs"
                onClick={() => {
                  setStatusFilters(prev => {
                    const next = new Set(prev);
                    if (next.has(s)) next.delete(s); else next.add(s);
                    return next;
                  });
                  setFilterBy("all");
                }}
              >
                {s === "overdue" ? `🔴 지연 ${counts.overdue}` : `🔵 결제예정 ${counts.planned}`}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-1 ml-auto">
            <span className="text-xs text-muted-foreground">정렬:</span>
            {(["outstanding", "recent", "name"] as const).map(s => (
              <Button key={s} size="sm" variant={sortBy === s ? "default" : "ghost"} className="h-7 text-xs" onClick={() => setSortBy(s)}>
                {s === "outstanding" ? "미수금순" : s === "recent" ? "최근거래" : "이름순"}
              </Button>
            ))}
          </div>
        </div>

        {summaryLoading ? (
          <div className="p-4 space-y-2">{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-11 w-full" />)}</div>
        ) : filteredSummary.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground flex-col gap-2">
            <FileText className="h-10 w-10 opacity-30" />
            <p className="text-sm">조건에 맞는 고객사가 없습니다.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b bg-muted/50 text-xs">
                  <th className="text-left py-2.5 px-4 font-medium">고객사</th>
                  <th className="text-center py-2.5 px-4 font-medium hidden lg:table-cell">계산서</th>
                  <th className="text-right py-2.5 px-4 font-medium hidden lg:table-cell" title="입금예정일이 지났는데 미입금">지연</th>
                  <th className="text-right py-2.5 px-4 font-medium hidden lg:table-cell" title="미래 입금예정 금액">결제예정</th>
                  <th className="text-center py-2.5 px-4 font-medium hidden lg:table-cell" title="수금 계획이 하나도 없는 계산서 건수">계획없음</th>
                  <th className="text-right py-2.5 px-4 font-medium">미수금</th>
                  <th className="text-left py-2.5 px-4 font-medium hidden md:table-cell">최근거래</th>
                </tr>
              </thead>
              <tbody>
                {filteredSummary.map(r => (
                  <tr
                    key={r.customerId}
                    className="border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => setCustomerId(r.customerId)}
                    data-testid={`customer-row-${r.customerId}`}
                  >
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2">
                        {r.isFavorite
                          ? <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400 shrink-0" />
                          : <Building2 className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />}
                        <span className="font-medium">{r.companyName}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-center hidden lg:table-cell">
                      {r.invoiceCount > 0 ? <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 px-2 py-0.5 rounded-full">{r.invoiceCount}건</span> : <span className="text-muted-foreground">-</span>}
                    </td>
                    <td className="py-2.5 px-4 text-right hidden lg:table-cell">
                      {r.overdueAmount > 0 ? <span className="text-xs text-red-600 dark:text-red-400 font-medium">{fmt(r.overdueAmount)}</span> : <span className="text-muted-foreground">-</span>}
                    </td>
                    <td className="py-2.5 px-4 text-right hidden lg:table-cell">
                      {r.plannedAmount > 0 ? <span className="text-xs text-blue-600 dark:text-blue-400">{fmt(r.plannedAmount)}</span> : <span className="text-muted-foreground">-</span>}
                    </td>
                    <td className="py-2.5 px-4 text-center hidden lg:table-cell">
                      {r.noPaymentCount > 0 ? <span className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 px-2 py-0.5 rounded-full">{r.noPaymentCount}</span> : <span className="text-muted-foreground">-</span>}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      {r.outstanding > 0
                        ? <span className="text-red-600 dark:text-red-400 font-medium">{fmt(r.outstanding)}</span>
                        : r.outstanding < 0
                          ? <span className="text-amber-600 dark:text-amber-400">{fmt(r.outstanding)}</span>
                          : <span className="text-muted-foreground">-</span>}
                    </td>
                    <td className="py-2.5 px-4 text-muted-foreground text-xs hidden md:table-cell">{fmtDate(r.lastTransactionDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-2 text-xs text-muted-foreground">총 {filteredSummary.length}개 고객사</div>
          </div>
        )}
      </div>
    );
  }

  // ───────────────────── 상세(원장) 모드 ─────────────────────
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 p-3 border-b bg-background flex-wrap">
        <Button variant="ghost" size="sm" className="h-8" onClick={() => setCustomerId("")} data-testid="button-back-to-list">
          <ArrowLeft className="h-4 w-4 mr-1" />목록
        </Button>
        <span className="font-semibold text-base">{ledger?.customer.companyName || ""}</span>
        <div className="flex items-center gap-1 border rounded-lg p-0.5">
          {(["6m", "1y", "2y", "all"] as const).map(p => (
            <Button key={p} variant={period === p ? "default" : "ghost"} size="sm" className="h-7 text-xs" onClick={() => setPeriod(p)} data-testid={`period-${p}`}>
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

      {isLoading ? (
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
