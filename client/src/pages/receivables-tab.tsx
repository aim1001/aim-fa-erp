import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, ChevronRight, Search, Link2, Link2Off, CheckCircle2, AlertCircle, Filter } from "lucide-react";

interface ReceivableInvoice {
  id: string;
  invoiceNumber: string | null;
  companyName: string | null;
  customerId: string | null;
  projectId: string | null;
  projectNumber: string | null;
  writeDate: string | null;
  issueDate: string | null;
  totalAmount: number | null;
  supplyAmount: number | null;
  taxAmount: number | null;
  status: string | null;
  collectedAmount: number;
  linkedTxCount: number;
  linkedTxIds: string[];
}

interface ReceivablesData {
  invoices: ReceivableInvoice[];
  summary: {
    totalBilled: number;
    totalCollected: number;
    totalOutstanding: number;
    invoiceCount: number;
  };
}

interface BankTransaction {
  id: string;
  txDate: string;
  description: string | null;
  counterparty: string | null;
  creditAmount: number | null;
  debitAmount: number | null;
  matchStatus: string | null;
  matchedSalesInvoiceId: string | null;
}

function formatAmount(n: number | null | undefined) {
  if (!n) return "0";
  return n.toLocaleString("ko-KR");
}

function formatDate(d: string | null | undefined) {
  if (!d) return "-";
  return d.slice(0, 10);
}

const YEARS = [2025, 2024, 2023, 2022];

export function ReceivablesTab() {
  const { toast } = useToast();
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [showOutstandingOnly, setShowOutstandingOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());
  const [linkDialogInvoice, setLinkDialogInvoice] = useState<ReceivableInvoice | null>(null);
  const [txSearch, setTxSearch] = useState("");

  const { data: receivablesData, isLoading } = useQuery<ReceivablesData>({
    queryKey: ["/api/receivables", selectedYear],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedYear) params.set("year", String(selectedYear));
      const res = await fetch(`/api/receivables?${params}`);
      if (!res.ok) throw new Error("Failed to fetch receivables");
      return res.json();
    },
  });

  const { data: bankTxData } = useQuery<BankTransaction[]>({
    queryKey: ["/api/bank-transactions", { txType: "credit" }],
    queryFn: async () => {
      const res = await fetch("/api/bank-transactions?txType=credit");
      if (!res.ok) throw new Error("Failed to fetch bank transactions");
      return res.json();
    },
    enabled: !!linkDialogInvoice,
  });

  const linkTxMutation = useMutation({
    mutationFn: async ({ txId, invoiceId }: { txId: string; invoiceId: string }) =>
      apiRequest("POST", `/api/bank-transactions/${txId}/link-invoice`, { invoiceId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/receivables"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bank-transactions"] });
      toast({ title: "연결 완료" });
    },
    onError: (e: any) => toast({ title: "연결 실패", description: e.message, variant: "destructive" }),
  });

  const unlinkTxMutation = useMutation({
    mutationFn: async (txId: string) =>
      apiRequest("DELETE", `/api/bank-transactions/${txId}/link-invoice`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/receivables"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bank-transactions"] });
      toast({ title: "연결 해제 완료" });
    },
    onError: (e: any) => toast({ title: "연결 해제 실패", description: e.message, variant: "destructive" }),
  });

  const bulkCompleteMutation = useMutation({
    mutationFn: async (year: number) =>
      apiRequest("POST", "/api/receivables/bulk-complete", { beforeYear: year + 1 }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/receivables"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      toast({ title: `일괄 완료 처리`, description: `${data.updatedInvoices}건 계산서, ${data.updatedPayments}건 자금계획 완료 처리됨` });
    },
    onError: (e: any) => toast({ title: "처리 실패", description: e.message, variant: "destructive" }),
  });

  const invoices = receivablesData?.invoices ?? [];
  const summary = receivablesData?.summary;

  const filtered = useMemo(() => {
    return invoices.filter(inv => {
      if (showOutstandingOnly) {
        const outstanding = (inv.totalAmount ?? 0) - inv.collectedAmount;
        if (outstanding <= 0) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        if (!(inv.companyName ?? "").toLowerCase().includes(q) &&
            !(inv.invoiceNumber ?? "").toLowerCase().includes(q) &&
            !(inv.projectNumber ?? "").toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [invoices, showOutstandingOnly, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, { customerName: string; invoices: ReceivableInvoice[]; totalBilled: number; totalCollected: number }>();
    for (const inv of filtered) {
      const key = inv.customerId ?? inv.companyName ?? "미분류";
      const label = inv.companyName ?? "미분류";
      if (!map.has(key)) map.set(key, { customerName: label, invoices: [], totalBilled: 0, totalCollected: 0 });
      const entry = map.get(key)!;
      entry.invoices.push(inv);
      entry.totalBilled += inv.totalAmount ?? 0;
      entry.totalCollected += inv.collectedAmount;
    }
    return Array.from(map.entries())
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => (b.totalBilled - b.totalCollected) - (a.totalBilled - a.totalCollected));
  }, [filtered]);

  const toggleCustomer = (key: string) => {
    setExpandedCustomers(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const availableTxForLink = useMemo(() => {
    if (!bankTxData || !linkDialogInvoice) return [];
    const q = txSearch.toLowerCase();
    return bankTxData.filter(tx => {
      if (tx.matchedSalesInvoiceId && tx.matchedSalesInvoiceId !== linkDialogInvoice.id) return false;
      if (q) {
        if (!(tx.description ?? "").toLowerCase().includes(q) &&
            !(tx.counterparty ?? "").toLowerCase().includes(q) &&
            !(tx.txDate ?? "").includes(q)) return false;
      }
      return true;
    }).sort((a, b) => {
      if (a.matchedSalesInvoiceId === linkDialogInvoice.id) return -1;
      if (b.matchedSalesInvoiceId === linkDialogInvoice.id) return 1;
      return b.txDate.localeCompare(a.txDate);
    });
  }, [bankTxData, linkDialogInvoice, txSearch]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-48 text-muted-foreground">로딩 중...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 border rounded-lg p-0.5">
          <Button
            variant={selectedYear === null ? "default" : "ghost"}
            size="sm"
            onClick={() => setSelectedYear(null)}
            data-testid="button-year-all"
          >전체</Button>
          {YEARS.map(y => (
            <Button
              key={y}
              variant={selectedYear === y ? "default" : "ghost"}
              size="sm"
              onClick={() => setSelectedYear(y)}
              data-testid={`button-year-${y}`}
            >{y}년</Button>
          ))}
        </div>

        <Button
          variant={showOutstandingOnly ? "default" : "outline"}
          size="sm"
          onClick={() => setShowOutstandingOnly(v => !v)}
          data-testid="button-outstanding-filter"
        >
          <Filter className="h-3.5 w-3.5 mr-1" />미수금만
        </Button>

        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="업체명/계산서번호/PO 검색"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
            data-testid="input-receivables-search"
          />
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => bulkCompleteMutation.mutate(2024)}
          disabled={bulkCompleteMutation.isPending}
          data-testid="button-bulk-complete-2024"
        >
          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
          2024년 이전 일괄완료
        </Button>
      </div>

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="border rounded-lg p-3 bg-background">
            <div className="text-xs text-muted-foreground">총 발행금액</div>
            <div className="text-base font-semibold mt-0.5" data-testid="text-total-billed">
              {formatAmount(summary.totalBilled)}원
            </div>
          </div>
          <div className="border rounded-lg p-3 bg-background">
            <div className="text-xs text-muted-foreground">수금 완료</div>
            <div className="text-base font-semibold mt-0.5 text-green-600 dark:text-green-400" data-testid="text-total-collected">
              {formatAmount(summary.totalCollected)}원
            </div>
          </div>
          <div className="border rounded-lg p-3 bg-background">
            <div className="text-xs text-muted-foreground">미수금</div>
            <div className="text-base font-semibold mt-0.5 text-red-600 dark:text-red-400" data-testid="text-total-outstanding">
              {formatAmount(summary.totalOutstanding)}원
            </div>
          </div>
          <div className="border rounded-lg p-3 bg-background">
            <div className="text-xs text-muted-foreground">계산서 수</div>
            <div className="text-base font-semibold mt-0.5" data-testid="text-invoice-count">
              {summary.invoiceCount}건
            </div>
          </div>
        </div>
      )}

      {/* Grouped customer sections */}
      <div className="space-y-2">
        {grouped.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">해당 조건의 계산서가 없습니다.</div>
        )}
        {grouped.map(group => {
          const outstanding = group.totalBilled - group.totalCollected;
          const isExpanded = expandedCustomers.has(group.key);
          return (
            <Collapsible key={group.key} open={isExpanded} onOpenChange={() => toggleCustomer(group.key)}>
              <CollapsibleTrigger asChild>
                <div
                  className="flex items-center justify-between p-3 border rounded-lg bg-muted/30 hover:bg-muted/50 cursor-pointer select-none"
                  data-testid={`row-customer-${group.key}`}
                >
                  <div className="flex items-center gap-2">
                    {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    <span className="font-semibold text-sm" data-testid={`text-customer-name-${group.key}`}>{group.customerName}</span>
                    <Badge variant="secondary" className="text-xs">{group.invoices.length}건</Badge>
                    {outstanding > 0 && (
                      <Badge variant="destructive" className="text-xs">
                        <AlertCircle className="h-3 w-3 mr-0.5" />미수금
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-muted-foreground hidden sm:inline">발행 <span className="text-foreground font-medium">{formatAmount(group.totalBilled)}</span></span>
                    <span className="text-green-600 dark:text-green-400 hidden sm:inline">수금 <span className="font-medium">{formatAmount(group.totalCollected)}</span></span>
                    <span className={outstanding > 0 ? "text-red-600 dark:text-red-400 font-semibold" : "text-muted-foreground"}>
                      미수금 {formatAmount(outstanding)}원
                    </span>
                  </div>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="border border-t-0 rounded-b-lg overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/20 text-muted-foreground text-xs">
                        <th className="px-3 py-2 text-left font-medium">계산서번호</th>
                        <th className="px-3 py-2 text-left font-medium">작성일</th>
                        <th className="px-3 py-2 text-left font-medium">PO/프로젝트</th>
                        <th className="px-3 py-2 text-right font-medium">청구금액</th>
                        <th className="px-3 py-2 text-right font-medium">수금액</th>
                        <th className="px-3 py-2 text-right font-medium">미수금</th>
                        <th className="px-3 py-2 text-center font-medium">상태</th>
                        <th className="px-3 py-2 text-center font-medium">은행연결</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.invoices.map(inv => {
                        const invOutstanding = (inv.totalAmount ?? 0) - inv.collectedAmount;
                        const isPaid = invOutstanding <= 0 || inv.status === "paid";
                        return (
                          <tr
                            key={inv.id}
                            className="border-b last:border-0 hover:bg-muted/20"
                            data-testid={`row-invoice-${inv.id}`}
                          >
                            <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                              {inv.invoiceNumber ?? "-"}
                            </td>
                            <td className="px-3 py-2 text-xs">
                              {formatDate(inv.writeDate ?? inv.issueDate)}
                            </td>
                            <td className="px-3 py-2">
                              {inv.projectNumber ? (
                                <Badge variant="outline" className="text-xs font-mono">{inv.projectNumber}</Badge>
                              ) : (
                                <span className="text-muted-foreground text-xs">-</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right font-medium">
                              {formatAmount(inv.totalAmount)}
                            </td>
                            <td className="px-3 py-2 text-right text-green-600 dark:text-green-400">
                              {inv.collectedAmount > 0 ? formatAmount(inv.collectedAmount) : "-"}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {invOutstanding > 0 ? (
                                <span className="text-red-600 dark:text-red-400 font-medium">{formatAmount(invOutstanding)}</span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {isPaid ? (
                                <Badge className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 hover:bg-green-100">완료</Badge>
                              ) : inv.collectedAmount > 0 ? (
                                <Badge variant="secondary" className="text-xs">일부수금</Badge>
                              ) : (
                                <Badge variant="destructive" className="text-xs">미수금</Badge>
                              )}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => { setLinkDialogInvoice(inv); setTxSearch(""); }}
                                data-testid={`button-link-tx-${inv.id}`}
                                title="은행거래 연결"
                              >
                                {inv.linkedTxCount > 0 ? (
                                  <Link2 className="h-3.5 w-3.5 text-blue-500" />
                                ) : (
                                  <Link2Off className="h-3.5 w-3.5 text-muted-foreground" />
                                )}
                              </Button>
                              {inv.linkedTxCount > 0 && (
                                <span className="text-xs text-blue-500 ml-0.5">{inv.linkedTxCount}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>

      {/* Link bank transaction dialog */}
      <Dialog open={!!linkDialogInvoice} onOpenChange={open => !open && setLinkDialogInvoice(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              은행거래 연결 — {linkDialogInvoice?.companyName} {linkDialogInvoice?.invoiceNumber}
            </DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground mb-2">
            청구금액: <strong>{formatAmount(linkDialogInvoice?.totalAmount)}원</strong>
            {(linkDialogInvoice?.collectedAmount ?? 0) > 0 && (
              <> · 수금: <strong className="text-green-600">{formatAmount(linkDialogInvoice?.collectedAmount)}원</strong></>
            )}
          </div>
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="날짜/설명/거래처 검색"
              value={txSearch}
              onChange={e => setTxSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
              data-testid="input-tx-search"
            />
          </div>
          <div className="overflow-y-auto flex-1 border rounded-lg">
            {availableTxForLink.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">입금 거래내역이 없습니다</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background border-b">
                  <tr className="text-muted-foreground text-xs">
                    <th className="px-3 py-2 text-left font-medium">날짜</th>
                    <th className="px-3 py-2 text-left font-medium">내용/거래처</th>
                    <th className="px-3 py-2 text-right font-medium">입금액</th>
                    <th className="px-3 py-2 text-center font-medium">연결상태</th>
                    <th className="px-3 py-2 text-center font-medium">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {availableTxForLink.map(tx => {
                    const isLinked = tx.matchedSalesInvoiceId === linkDialogInvoice?.id;
                    return (
                      <tr key={tx.id} className={`border-b last:border-0 hover:bg-muted/20 ${isLinked ? "bg-blue-50 dark:bg-blue-950/30" : ""}`} data-testid={`row-tx-${tx.id}`}>
                        <td className="px-3 py-2 text-xs">{formatDate(tx.txDate)}</td>
                        <td className="px-3 py-2 max-w-[200px]">
                          <div className="truncate text-xs">{tx.description}</div>
                          {tx.counterparty && <div className="truncate text-xs text-muted-foreground">{tx.counterparty}</div>}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-green-600 dark:text-green-400">
                          {formatAmount(tx.creditAmount)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {isLinked ? (
                            <Badge className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 hover:bg-blue-100">연결됨</Badge>
                          ) : tx.matchedSalesInvoiceId ? (
                            <Badge variant="secondary" className="text-xs">다른계산서</Badge>
                          ) : tx.matchStatus === "ignored" ? (
                            <Badge variant="outline" className="text-xs">무시</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">미연결</Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {isLinked ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-red-500 hover:text-red-700"
                              onClick={() => unlinkTxMutation.mutate(tx.id)}
                              disabled={unlinkTxMutation.isPending}
                              data-testid={`button-unlink-tx-${tx.id}`}
                            >
                              <Link2Off className="h-3.5 w-3.5 mr-1" />해제
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-blue-600 hover:text-blue-800"
                              onClick={() => linkTxMutation.mutate({ txId: tx.id, invoiceId: linkDialogInvoice!.id })}
                              disabled={linkTxMutation.isPending}
                              data-testid={`button-link-tx-item-${tx.id}`}
                            >
                              <Link2 className="h-3.5 w-3.5 mr-1" />연결
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
