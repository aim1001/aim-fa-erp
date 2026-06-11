import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, ChevronRight, Search, Link2, Link2Off, CheckCircle2, AlertCircle, Filter, X, RefreshCw, Banknote } from "lucide-react";

interface PayableInvoice {
  id: string;
  invoiceNumber: string | null;
  companyName: string | null;
  vendorId: string | null;
  projectId: string | null;
  projectNumber: string | null;
  writeDate: string | null;
  issueDate: string | null;
  totalAmount: number | null;
  supplyAmount: number | null;
  taxAmount: number | null;
  status: string | null;
  paidAmount: number;
  linkedTxCount: number;
  linkedTxIds: string[];
}

interface PayablesData {
  invoices: PayableInvoice[];
  summary: {
    totalBilled: number;
    totalPaid: number;
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
  matchedPurchaseInvoiceId: string | null;
}

function formatAmount(n: number | null | undefined) {
  if (!n) return "0";
  return n.toLocaleString("ko-KR");
}

function formatDate(d: string | null | undefined) {
  if (!d) return "-";
  return d.slice(0, 10);
}

type YearFilter = "all" | "2026" | "2025" | "before2025";

export function PayablesTab() {
  const { toast } = useToast();
  const [yearFilter, setYearFilter] = useState<YearFilter>("all");
  const [showOutstandingOnly, setShowOutstandingOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedVendors, setExpandedVendors] = useState<Set<string>>(new Set());
  const [linkDialogInvoice, setLinkDialogInvoice] = useState<PayableInvoice | null>(null);
  const [txSearch, setTxSearch] = useState("");

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [completeConfirmOpen, setCompleteConfirmOpen] = useState(false);
  const [confirmInvoice, setConfirmInvoice] = useState<PayableInvoice | null>(null);
  const [uncompleteInvoice, setUncompleteInvoice] = useState<PayableInvoice | null>(null);

  const apiYear = yearFilter === "all" ? undefined
    : yearFilter === "before2025" ? undefined
    : parseInt(yearFilter);

  const { data: payablesData, isLoading } = useQuery<PayablesData>({
    queryKey: ["/api/payables", yearFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (apiYear) params.set("year", String(apiYear));
      const res = await fetch(`/api/payables?${params}`);
      if (!res.ok) throw new Error("Failed to fetch payables");
      return res.json();
    },
  });

  const { data: bankTxData } = useQuery<BankTransaction[]>({
    queryKey: ["/api/bank-transactions", { txType: "debit" }],
    queryFn: async () => {
      const res = await fetch("/api/bank-transactions?txType=debit");
      if (!res.ok) throw new Error("Failed to fetch bank transactions");
      return res.json();
    },
    enabled: !!linkDialogInvoice,
  });

  const linkTxMutation = useMutation({
    mutationFn: async ({ txId, invoiceId }: { txId: string; invoiceId: string }) =>
      apiRequest("POST", `/api/bank-transactions/${txId}/link-purchase-invoice`, { invoiceId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payables"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bank-transactions"] });
      toast({ title: "연결 완료" });
    },
    onError: (e: any) => toast({ title: "연결 실패", description: e.message, variant: "destructive" }),
  });

  const unlinkTxMutation = useMutation({
    mutationFn: async (txId: string) =>
      apiRequest("DELETE", `/api/bank-transactions/${txId}/link-purchase-invoice`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payables"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bank-transactions"] });
      toast({ title: "연결 해제 완료" });
    },
    onError: (e: any) => toast({ title: "연결 해제 실패", description: e.message, variant: "destructive" }),
  });

  const completeInvoicesMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiRequest("POST", "/api/payables/complete-invoices", { ids });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/payables"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-invoices-with-payments"] });
      setSelectedIds(new Set());
      toast({
        title: "지급확정 완료",
        description: `계산서 ${data.updatedInvoices}건, 자금계획 ${data.updatedPayments}건 확정 처리됨`,
      });
    },
    onError: (e: any) => toast({ title: "처리 실패", description: e.message, variant: "destructive" }),
  });

  const uncompleteInvoicesMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiRequest("POST", "/api/payables/uncomplete-invoices", { ids });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/payables"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-invoices-with-payments"] });
      toast({
        title: "되돌리기 완료",
        description: `계산서 ${data.updatedInvoices}건, 자금계획 ${data.updatedPayments}건 미완료로 변경됨`,
      });
    },
    onError: (e: any) => toast({ title: "되돌리기 실패", description: e.message, variant: "destructive" }),
  });

  const allInvoices = payablesData?.invoices ?? [];

  const invoices = useMemo(() => {
    if (yearFilter !== "before2025") return allInvoices;
    return allInvoices.filter(inv => {
      const d = inv.writeDate || inv.issueDate;
      if (!d) return false;
      return new Date(d).getFullYear() < 2025;
    });
  }, [allInvoices, yearFilter]);

  const filtered = useMemo(() => {
    return invoices.filter(inv => {
      if (showOutstandingOnly) {
        const outstanding = (inv.totalAmount ?? 0) - inv.paidAmount;
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

  const filteredSummary = useMemo(() => {
    const totalBilled = filtered.reduce((s, i) => s + (i.totalAmount ?? 0), 0);
    const totalPaid = filtered.reduce((s, i) => s + i.paidAmount, 0);
    return { totalBilled, totalPaid, totalOutstanding: totalBilled - totalPaid, invoiceCount: filtered.length };
  }, [filtered]);

  const grouped = useMemo(() => {
    const map = new Map<string, { vendorName: string; invoices: PayableInvoice[]; totalBilled: number; totalPaid: number }>();
    for (const inv of filtered) {
      const key = inv.vendorId ?? inv.companyName ?? "미분류";
      const label = inv.companyName ?? "미분류";
      if (!map.has(key)) map.set(key, { vendorName: label, invoices: [], totalBilled: 0, totalPaid: 0 });
      const entry = map.get(key)!;
      entry.invoices.push(inv);
      entry.totalBilled += inv.totalAmount ?? 0;
      entry.totalPaid += inv.paidAmount;
    }
    return Array.from(map.entries())
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => (b.totalBilled - b.totalPaid) - (a.totalBilled - a.totalPaid));
  }, [filtered]);

  const toggleVendor = (key: string) => {
    setExpandedVendors(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleInvoice = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleGroupSelect = (groupInvoices: PayableInvoice[]) => {
    const unpaidIds = groupInvoices
      .filter(inv => inv.status !== "paid" && (inv.totalAmount ?? 0) - inv.paidAmount > 0)
      .map(inv => inv.id);
    const allSelected = unpaidIds.every(id => selectedIds.has(id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allSelected) {
        unpaidIds.forEach(id => next.delete(id));
      } else {
        unpaidIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const availableTxForLink = useMemo(() => {
    if (!bankTxData || !linkDialogInvoice) return [];
    const q = txSearch.toLowerCase();
    const vendorName = (linkDialogInvoice.companyName ?? "").toLowerCase();
    return bankTxData.filter(tx => {
      if (tx.matchedPurchaseInvoiceId && tx.matchedPurchaseInvoiceId !== linkDialogInvoice.id) return false;
      const counterparty = (tx.counterparty ?? "").toLowerCase();
      const desc = (tx.description ?? "").toLowerCase();
      const isVendorMatch = vendorName && (counterparty.includes(vendorName) || vendorName.includes(counterparty) || desc.includes(vendorName));
      if (!isVendorMatch && !tx.matchedPurchaseInvoiceId && !txSearch) return false;
      if (q && !desc.includes(q) && !counterparty.includes(q) && !(tx.txDate ?? "").includes(q)) return false;
      return true;
    }).sort((a, b) => {
      if (a.matchedPurchaseInvoiceId === linkDialogInvoice.id) return -1;
      if (b.matchedPurchaseInvoiceId === linkDialogInvoice.id) return 1;
      return b.txDate.localeCompare(a.txDate);
    });
  }, [bankTxData, linkDialogInvoice, txSearch]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-48 text-muted-foreground">로딩 중...</div>;
  }

  const someSelected = selectedIds.size > 0;

  return (
    <div className="space-y-4">
      {/* Header controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 border rounded-lg p-0.5">
          <Button
            variant={yearFilter === "all" ? "default" : "ghost"}
            size="sm"
            onClick={() => setYearFilter("all")}
            data-testid="button-payables-year-all"
          >전체</Button>
          <Button
            variant={yearFilter === "2026" ? "default" : "ghost"}
            size="sm"
            onClick={() => setYearFilter("2026")}
            data-testid="button-payables-year-2026"
          >2026년</Button>
          <Button
            variant={yearFilter === "2025" ? "default" : "ghost"}
            size="sm"
            onClick={() => setYearFilter("2025")}
            data-testid="button-payables-year-2025"
          >2025년</Button>
          <Button
            variant={yearFilter === "before2025" ? "default" : "ghost"}
            size="sm"
            onClick={() => setYearFilter("before2025")}
            data-testid="button-payables-year-before2025"
          >2024년 이전</Button>
        </div>

        <Button
          variant={showOutstandingOnly ? "default" : "outline"}
          size="sm"
          onClick={() => setShowOutstandingOnly(v => !v)}
          data-testid="button-payables-outstanding-filter"
        >
          <Filter className="h-3.5 w-3.5 mr-1" />미지급만
        </Button>

        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="업체명/계산서번호/PO 검색"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
            data-testid="input-payables-search"
          />
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="border rounded-lg p-3 bg-background">
          <div className="text-xs text-muted-foreground">총 매입금액</div>
          <div className="text-base font-semibold mt-0.5" data-testid="text-payables-total-billed">
            {formatAmount(filteredSummary.totalBilled)}원
          </div>
        </div>
        <div className="border rounded-lg p-3 bg-background">
          <div className="text-xs text-muted-foreground">지급 완료</div>
          <div className="text-base font-semibold mt-0.5 text-green-600 dark:text-green-400" data-testid="text-payables-total-paid">
            {formatAmount(filteredSummary.totalPaid)}원
          </div>
        </div>
        <div className="border rounded-lg p-3 bg-background">
          <div className="text-xs text-muted-foreground">미지급금</div>
          <div className="text-base font-semibold mt-0.5 text-red-600 dark:text-red-400" data-testid="text-payables-total-outstanding">
            {formatAmount(filteredSummary.totalOutstanding)}원
          </div>
        </div>
        <div className="border rounded-lg p-3 bg-background">
          <div className="text-xs text-muted-foreground">계산서 수</div>
          <div className="text-base font-semibold mt-0.5" data-testid="text-payables-invoice-count">
            {filteredSummary.invoiceCount}건
          </div>
        </div>
      </div>

      {/* Floating bulk action toolbar */}
      {someSelected && (
        <div className="sticky top-2 z-20 flex items-center gap-3 bg-primary text-primary-foreground rounded-lg px-4 py-2.5 shadow-lg" data-testid="payables-bulk-toolbar">
          <span className="text-sm font-medium">{selectedIds.size}건 선택됨</span>
          <div className="h-4 w-px bg-primary-foreground/30" />
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white border-0"
            disabled={completeInvoicesMutation.isPending}
            onClick={() => setCompleteConfirmOpen(true)}
            data-testid="button-payables-selected-complete"
          >
            {completeInvoicesMutation.isPending
              ? <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
              : <CheckCircle2 className="h-3 w-3 mr-1" />}
            지급확정
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-primary-foreground hover:bg-primary-foreground/20"
            onClick={() => setSelectedIds(new Set())}
            data-testid="button-payables-selected-cancel"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Grouped vendor sections */}
      <div className="space-y-2">
        {grouped.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">해당 조건의 계산서가 없습니다.</div>
        )}
        {grouped.map(group => {
          const outstanding = group.totalBilled - group.totalPaid;
          const isExpanded = expandedVendors.has(group.key);
          const unpaidInGroup = group.invoices.filter(inv =>
            inv.status !== "paid" && (inv.totalAmount ?? 0) - inv.paidAmount > 0
          );
          const groupSelectedCount = unpaidInGroup.filter(inv => selectedIds.has(inv.id)).length;
          const groupAllSelected = unpaidInGroup.length > 0 && groupSelectedCount === unpaidInGroup.length;

          return (
            <Collapsible key={group.key} open={isExpanded} onOpenChange={() => toggleVendor(group.key)}>
              <CollapsibleTrigger asChild>
                <div
                  className="flex items-center justify-between p-3 border rounded-lg bg-muted/30 hover:bg-muted/50 cursor-pointer select-none"
                  data-testid={`row-vendor-${group.key}`}
                >
                  <div className="flex items-center gap-2">
                    {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    <span className="font-semibold text-sm" data-testid={`text-vendor-name-${group.key}`}>{group.vendorName}</span>
                    <Badge variant="secondary" className="text-xs">{group.invoices.length}건</Badge>
                    {outstanding > 0 && (
                      <Badge variant="destructive" className="text-xs">
                        <AlertCircle className="h-3 w-3 mr-0.5" />미지급
                      </Badge>
                    )}
                    {groupSelectedCount > 0 && (
                      <Badge className="text-xs bg-primary">{groupSelectedCount}건 선택됨</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-muted-foreground hidden sm:inline">매입 <span className="text-foreground font-medium">{formatAmount(group.totalBilled)}</span></span>
                    <span className="text-green-600 dark:text-green-400 hidden sm:inline">지급 <span className="font-medium">{formatAmount(group.totalPaid)}</span></span>
                    <span className={outstanding > 0 ? "text-red-600 dark:text-red-400 font-semibold" : "text-muted-foreground"}>
                      미지급 {formatAmount(outstanding)}원
                    </span>
                    {unpaidInGroup.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={e => { e.stopPropagation(); toggleGroupSelect(group.invoices); }}
                        data-testid={`button-payables-group-select-${group.key}`}
                      >
                        {groupAllSelected ? "선택해제" : `${unpaidInGroup.length}건 선택`}
                      </Button>
                    )}
                  </div>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="border border-t-0 rounded-b-lg overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/20 text-muted-foreground text-xs">
                        <th className="px-2 py-2 w-8"></th>
                        <th className="px-3 py-2 text-left font-medium">계산서번호</th>
                        <th className="px-3 py-2 text-left font-medium">작성일</th>
                        <th className="px-3 py-2 text-left font-medium">PO/프로젝트</th>
                        <th className="px-3 py-2 text-right font-medium">매입금액</th>
                        <th className="px-3 py-2 text-right font-medium">지급액</th>
                        <th className="px-3 py-2 text-right font-medium">미지급금</th>
                        <th className="px-3 py-2 text-center font-medium">상태</th>
                        <th className="px-3 py-2 text-center font-medium">은행연결</th>
                        <th className="px-3 py-2 text-center font-medium">완료</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.invoices.map(inv => {
                        const invOutstanding = (inv.totalAmount ?? 0) - inv.paidAmount;
                        const isPaid = invOutstanding <= 0 || inv.status === "paid";
                        const isSelected = selectedIds.has(inv.id);
                        return (
                          <tr
                            key={inv.id}
                            className={`border-b last:border-0 hover:bg-muted/20 ${isSelected ? "bg-primary/5" : ""}`}
                            data-testid={`row-payable-invoice-${inv.id}`}
                          >
                            <td
                              className="px-2 py-2 w-8"
                              onClick={e => { e.stopPropagation(); if (!isPaid) toggleInvoice(inv.id); }}
                            >
                              {!isPaid && (
                                <Checkbox
                                  checked={isSelected}
                                  aria-label="선택"
                                  data-testid={`checkbox-payable-invoice-${inv.id}`}
                                />
                              )}
                            </td>
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
                              {inv.paidAmount > 0 ? formatAmount(inv.paidAmount) : "-"}
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
                              ) : inv.paidAmount > 0 ? (
                                <Badge variant="secondary" className="text-xs">일부지급</Badge>
                              ) : (
                                <Badge variant="destructive" className="text-xs">미지급</Badge>
                              )}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => { setLinkDialogInvoice(inv); setTxSearch(""); }}
                                data-testid={`button-payables-link-tx-${inv.id}`}
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
                            <td className="px-3 py-2 text-center">
                              {!isPaid ? (
                                <Button
                                  variant={inv.linkedTxCount > 0 ? "default" : "ghost"}
                                  size="sm"
                                  className={`h-6 text-xs ${inv.linkedTxCount > 0 ? "bg-green-600 hover:bg-green-700 text-white" : "text-green-700 hover:text-green-800 hover:bg-green-50 dark:hover:bg-green-950"}`}
                                  disabled={completeInvoicesMutation.isPending}
                                  onClick={() => setConfirmInvoice(inv)}
                                  data-testid={`button-payables-complete-invoice-${inv.id}`}
                                  title={inv.linkedTxCount > 0 ? `은행내역 ${inv.linkedTxCount}건 연결됨` : "지급확정"}
                                >
                                  {inv.linkedTxCount > 0 && <Banknote className="h-3 w-3 mr-0.5" />}
                                  {inv.linkedTxCount === 0 && <CheckCircle2 className="h-3 w-3 mr-0.5" />}
                                  지급확정
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 text-xs text-muted-foreground hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
                                  disabled={uncompleteInvoicesMutation.isPending}
                                  onClick={() => setUncompleteInvoice(inv)}
                                  data-testid={`button-payables-uncomplete-invoice-${inv.id}`}
                                >
                                  지급취소
                                </Button>
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

      {/* Individual invoice confirm dialog */}
      <AlertDialog open={!!confirmInvoice} onOpenChange={open => !open && setConfirmInvoice(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              지급확정
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  <strong>{confirmInvoice?.invoiceNumber ?? confirmInvoice?.companyName}</strong> 계산서를 지급확정 처리합니다.
                </p>
                {confirmInvoice && confirmInvoice.linkedTxCount > 0 && (
                  <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/20 rounded-md border border-green-200">
                    <Banknote className="h-4 w-4 text-green-600" />
                    <span className="text-green-700 dark:text-green-400">은행내역 {confirmInvoice.linkedTxCount}건 연결됨</span>
                  </div>
                )}
                <p className="text-muted-foreground">연결된 자금계획도 함께 완료 처리됩니다.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-green-600 hover:bg-green-700"
              onClick={() => {
                if (confirmInvoice) completeInvoicesMutation.mutate([confirmInvoice.id]);
                setConfirmInvoice(null);
              }}
            >
              지급확정
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Individual invoice uncomplete dialog */}
      <AlertDialog open={!!uncompleteInvoice} onOpenChange={open => !open && setUncompleteInvoice(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>지급취소</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{uncompleteInvoice?.invoiceNumber ?? uncompleteInvoice?.companyName}</strong> 계산서를 미지급 상태로 되돌립니다.
              <br />연결된 자금계획도 함께 되돌려집니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-orange-600 hover:bg-orange-700"
              onClick={() => {
                if (uncompleteInvoice) uncompleteInvoicesMutation.mutate([uncompleteInvoice.id]);
                setUncompleteInvoice(null);
              }}
            >
              지급취소
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Selected invoices confirm dialog */}
      <AlertDialog open={completeConfirmOpen} onOpenChange={setCompleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              일괄 지급확정
            </AlertDialogTitle>
            <AlertDialogDescription>
              선택한 <strong>{selectedIds.size}건</strong>의 계산서를 지급확정 처리합니다.
              <br />연결된 자금계획도 함께 완료 처리됩니다.
              <br /><br />계속하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-green-600 hover:bg-green-700"
              onClick={() => {
                setCompleteConfirmOpen(false);
                completeInvoicesMutation.mutate(Array.from(selectedIds));
              }}
              data-testid="button-payables-complete-confirm"
            >
              지급확정
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Link bank transaction dialog */}
      <Dialog open={!!linkDialogInvoice} onOpenChange={open => !open && setLinkDialogInvoice(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              은행거래 연결 — {linkDialogInvoice?.companyName} {linkDialogInvoice?.invoiceNumber}
            </DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground mb-2">
            매입금액: <strong>{formatAmount(linkDialogInvoice?.totalAmount)}원</strong>
            {(linkDialogInvoice?.paidAmount ?? 0) > 0 && (
              <> · 지급: <strong className="text-green-600">{formatAmount(linkDialogInvoice?.paidAmount)}원</strong></>
            )}
          </div>
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="날짜/설명/거래처 검색 (검색 시 모든 출금거래 표시)"
              value={txSearch}
              onChange={e => setTxSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
              data-testid="input-payables-tx-search"
            />
          </div>
          <div className="overflow-y-auto flex-1 border rounded-lg">
            {availableTxForLink.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                {txSearch ? "검색 결과가 없습니다" : `${linkDialogInvoice?.companyName} 관련 출금 거래가 없습니다`}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background border-b">
                  <tr className="text-muted-foreground text-xs">
                    <th className="px-3 py-2 text-left font-medium">날짜</th>
                    <th className="px-3 py-2 text-left font-medium">내용/거래처</th>
                    <th className="px-3 py-2 text-right font-medium">출금액</th>
                    <th className="px-3 py-2 text-center font-medium">연결상태</th>
                    <th className="px-3 py-2 text-center font-medium">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {availableTxForLink.map(tx => {
                    const isLinked = tx.matchedPurchaseInvoiceId === linkDialogInvoice?.id;
                    return (
                      <tr key={tx.id} className={`border-b last:border-0 hover:bg-muted/20 ${isLinked ? "bg-blue-50 dark:bg-blue-950/30" : ""}`} data-testid={`row-payables-tx-${tx.id}`}>
                        <td className="px-3 py-2 text-xs">{formatDate(tx.txDate)}</td>
                        <td className="px-3 py-2 max-w-[200px]">
                          <div className="truncate text-xs">{tx.description}</div>
                          {tx.counterparty && <div className="truncate text-xs text-muted-foreground">{tx.counterparty}</div>}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-red-600 dark:text-red-400">
                          {formatAmount(tx.debitAmount)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {isLinked ? (
                            <Badge className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 hover:bg-blue-100">연결됨</Badge>
                          ) : tx.matchedPurchaseInvoiceId ? (
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
                              data-testid={`button-payables-unlink-tx-${tx.id}`}
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
                              data-testid={`button-payables-link-tx-item-${tx.id}`}
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
