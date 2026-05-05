import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo, Fragment } from "react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  ChevronLeft, ChevronRight, Landmark, ClipboardList,
  Link2, Link2Off, AlertCircle, RefreshCw, AlertTriangle, Clock, Check,
} from "lucide-react";
import type { BankAccount, BankTransaction, Payment } from "@shared/schema";

type EnrichedPayment = Payment & {
  invoiceIssueDate: string | null;
  invoiceNumber: string | null;
  invoiceTotalAmount: number | null;
  invoiceItem: string | null;
  invoicePaidAmount: number;
  invoiceRemainingAmount: number;
  projectNumber: string | null;
  projectCustomerName: string | null;
};

type MatchCandidate = {
  id: string;
  type: string;
  status: string;
  description: string | null;
  amount: number | null;
  plannedDate: string | null;
  projectCustomerName: string | null;
  projectNumber: string | null;
};

type CashFlowRow =
  | { kind: "bank"; tx: BankTransaction; estimatedBalance?: never }
  | { kind: "payment"; payment: EnrichedPayment; estimatedBalance: number | null };

function formatAmount(n: number | null | undefined) {
  if (n == null) return "-";
  return n.toLocaleString() + "원";
}

function MatchDialog({ tx, onClose }: { tx: BankTransaction; onClose: () => void }) {
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const isCredit = !!(tx.creditAmount && tx.creditAmount > 0);
  const amount = tx.creditAmount || tx.debitAmount || 0;

  const { data: candidates = [], isLoading } = useQuery<MatchCandidate[]>({
    queryKey: ["/api/bank-transactions", tx.id, "candidates"],
    queryFn: async () => {
      const res = await fetch(`/api/bank-transactions/${tx.id}/candidates`);
      return res.json();
    },
  });

  const matchMutation = useMutation({
    mutationFn: async (data: { paymentId?: string; noMatch?: boolean }) => {
      const res = await apiRequest("POST", `/api/bank-transactions/${tx.id}/match`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bank-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      toast({ title: "처리가 완료되었습니다" });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "실패", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>자금계획 연결</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="bg-muted/40 rounded-lg px-3 py-2.5 text-sm space-y-1">
            <div className="text-xs text-muted-foreground font-medium">은행 거래</div>
            <div className="flex items-center justify-between">
              <div className="font-medium">{tx.counterparty || tx.description || "내용 없음"}</div>
              <div className={isCredit ? "text-blue-600 font-semibold" : "text-red-600 font-semibold"}>
                {isCredit ? "+" : "-"}{amount.toLocaleString()}원
              </div>
            </div>
            <div className="text-xs text-muted-foreground">{tx.txDate}</div>
          </div>

          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">
              연결 가능한 자금계획
              {!isLoading && <span className="ml-1 font-normal">({candidates.length}건 — 날짜 ±30일, 금액 ±20%)</span>}
            </div>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2].map(i => <Skeleton key={i} className="h-14" />)}
              </div>
            ) : candidates.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6 bg-muted/20 rounded-lg">
                <AlertCircle className="h-5 w-5 mx-auto mb-1.5 opacity-40" />
                날짜·금액이 유사한 자금계획 항목이 없습니다
              </div>
            ) : (
              <div className="space-y-1 max-h-52 overflow-y-auto pr-1">
                {candidates.map(c => {
                  const diff = tx.txDate && c.plannedDate
                    ? Math.round((new Date(tx.txDate).getTime() - new Date(c.plannedDate).getTime()) / 86400000)
                    : null;
                  const amtDiff = c.amount && amount ? Math.round(Math.abs(c.amount - amount) / amount * 100) : 0;
                  return (
                    <div
                      key={c.id}
                      className={`border rounded-lg px-3 py-2.5 cursor-pointer transition-colors text-sm ${
                        selectedId === c.id ? "border-primary bg-primary/5" : "hover:border-primary/40 hover:bg-muted/30"
                      }`}
                      onClick={() => setSelectedId(selectedId === c.id ? null : c.id)}
                      data-testid={`candidate-${c.id}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{c.description || c.projectCustomerName || "내용 없음"}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-2">
                            <span>{c.plannedDate || "날짜 미정"}</span>
                            {diff !== null && (
                              <span className={Math.abs(diff) <= 3 ? "text-green-600 font-medium" : "text-orange-500"}>
                                {diff === 0 ? "당일" : diff > 0 ? `D+${diff}` : `D${diff}`}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className={c.type === "income" ? "text-blue-600 font-medium" : "text-red-600 font-medium"}>
                            {(c.amount || 0).toLocaleString()}원
                          </div>
                          {amtDiff > 0 && (
                            <div className="text-xs text-muted-foreground">차이 {amtDiff}%</div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border-t pt-3 flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground mb-1.5">해당하는 계획이 없는 거래라면</div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => matchMutation.mutate({ noMatch: true })}
                disabled={matchMutation.isPending}
                data-testid="button-no-match"
              >
                계획없음으로 표시
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={matchMutation.isPending}>취소</Button>
          <Button
            onClick={() => { if (selectedId) matchMutation.mutate({ paymentId: selectedId }); }}
            disabled={!selectedId || matchMutation.isPending}
            data-testid="button-confirm-match"
          >
            {matchMutation.isPending
              ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
              : <Link2 className="h-4 w-4 mr-1" />}
            연결하기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaymentStatusBadge({ payment }: { payment: EnrichedPayment }) {
  const today = new Date().toISOString().split("T")[0];
  if (payment.status === "completed") {
    return <Badge variant="outline" className="text-green-600 bg-green-50 border-green-200 text-[10px]"><Check className="h-2.5 w-2.5 mr-0.5" />완료</Badge>;
  }
  if (payment.plannedDate && payment.plannedDate < today) {
    return <Badge variant="outline" className="text-red-600 bg-red-50 border-red-200 text-[10px]"><AlertTriangle className="h-2.5 w-2.5 mr-0.5" />연체</Badge>;
  }
  return <Badge variant="outline" className="text-blue-600 bg-blue-50 border-blue-200 text-[10px]"><Clock className="h-2.5 w-2.5 mr-0.5" />예정</Badge>;
}

export function CashFlowTab({ year, month, onPrevMonth, onNextMonth }: {
  year: number;
  month: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}) {
  const [filterAccount, setFilterAccount] = useState<string>("all");
  const [filterType, setFilterType] = useState<"all" | "credit" | "debit">("all");
  const [filterSource, setFilterSource] = useState<"all" | "bank" | "planned">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [matchDialogTx, setMatchDialogTx] = useState<BankTransaction | null>(null);

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const { data: accounts = [] } = useQuery<BankAccount[]>({ queryKey: ["/api/bank-accounts"] });

  const { data: bankTxs = [], isLoading: txLoading } = useQuery<BankTransaction[]>({
    queryKey: ["/api/bank-transactions", "cashflow", filterAccount, startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams({ startDate, endDate });
      if (filterAccount !== "all") params.set("accountId", filterAccount);
      const res = await fetch(`/api/bank-transactions?${params}`);
      return res.json();
    },
  });

  const { data: payments = [], isLoading: paymentsLoading } = useQuery<EnrichedPayment[]>({
    queryKey: ["/api/payments", year, month],
    queryFn: async () => {
      const res = await fetch(`/api/payments?year=${year}&month=${month}`);
      return res.json();
    },
  });

  const unmatchMutation = useMutation({
    mutationFn: async (txId: string) => {
      const res = await apiRequest("DELETE", `/api/bank-transactions/${txId}/match`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bank-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
    },
  });

  const matchedPaymentIds = useMemo(() => {
    const ids = new Set<string>();
    bankTxs.forEach(tx => {
      if (tx.matchedPaymentId) ids.add(tx.matchedPaymentId);
    });
    return ids;
  }, [bankTxs]);

  const rows = useMemo((): CashFlowRow[] => {
    const bankRows: CashFlowRow[] = bankTxs
      .filter(tx => {
        if (filterType === "credit" && !(tx.creditAmount && tx.creditAmount > 0)) return false;
        if (filterType === "debit" && !(tx.debitAmount && tx.debitAmount > 0)) return false;
        return true;
      })
      .map(tx => ({ kind: "bank" as const, tx }));

    const unmatched = payments.filter(p => !matchedPaymentIds.has(p.id));
    const planRows: CashFlowRow[] = unmatched
      .filter(p => {
        if (filterType === "credit" && p.type !== "income") return false;
        if (filterType === "debit" && p.type !== "expense") return false;
        return true;
      })
      .map(p => ({ kind: "payment" as const, payment: p, estimatedBalance: null }));

    const all: CashFlowRow[] = [...bankRows, ...planRows];
    all.sort((a, b) => {
      const da = a.kind === "bank" ? (a.tx.txDate || "") : (a.payment.actualDate || a.payment.plannedDate || "");
      const db = b.kind === "bank" ? (b.tx.txDate || "") : (b.payment.actualDate || b.payment.plannedDate || "");
      return da.localeCompare(db);
    });

    let lastKnownBalance: number | null = null;
    return all.map(row => {
      if (row.kind === "bank") {
        if (row.tx.balance != null) lastKnownBalance = row.tx.balance;
        return row;
      } else {
        let estimated: number | null = null;
        if (lastKnownBalance != null) {
          const amt = row.payment.amount || 0;
          estimated = row.payment.type === "income"
            ? lastKnownBalance + amt
            : lastKnownBalance - amt;
        }
        return { ...row, estimatedBalance: estimated };
      }
    });
  }, [bankTxs, payments, matchedPaymentIds, filterType]);

  const visibleRows = useMemo(() => {
    if (filterSource === "bank") return rows.filter(r => r.kind === "bank");
    if (filterSource === "planned") return rows.filter(r => r.kind === "payment");
    return rows;
  }, [rows, filterSource]);

  const totalCredit = bankTxs.reduce((s, t) => s + (t.creditAmount ?? 0), 0);
  const totalDebit = bankTxs.reduce((s, t) => s + (t.debitAmount ?? 0), 0);
  const plannedIncome = payments.filter(p => p.type === "income" && !matchedPaymentIds.has(p.id)).reduce((s, p) => s + (p.amount || 0), 0);
  const plannedExpense = payments.filter(p => p.type === "expense" && !matchedPaymentIds.has(p.id)).reduce((s, p) => s + (p.amount || 0), 0);

  const isLoading = txLoading || paymentsLoading;

  return (
    <div className="space-y-3" data-testid="cash-flow-tab">
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="ghost" size="icon" onClick={onPrevMonth} data-testid="button-cf-prev-month">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-base font-semibold min-w-[100px] text-center" data-testid="text-cf-month">
          {year}년 {month}월
        </span>
        <Button variant="ghost" size="icon" onClick={onNextMonth} data-testid="button-cf-next-month">
          <ChevronRight className="h-4 w-4" />
        </Button>

        <div className="h-5 w-px bg-border mx-1" />

        <Select value={filterAccount} onValueChange={setFilterAccount}>
          <SelectTrigger className="w-36 h-8 text-xs" data-testid="select-cf-account">
            <SelectValue placeholder="전체 계좌" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 계좌</SelectItem>
            {accounts.map(acc => (
              <SelectItem key={acc.id} value={acc.id}>{acc.accountAlias}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1 border rounded-lg p-0.5">
          <Button variant={filterType === "all" ? "default" : "ghost"} size="sm" className="h-7 text-xs" onClick={() => setFilterType("all")} data-testid="filter-cf-all">전체</Button>
          <Button variant={filterType === "credit" ? "default" : "ghost"} size="sm" className="h-7 text-xs" onClick={() => setFilterType("credit")} data-testid="filter-cf-credit">입금</Button>
          <Button variant={filterType === "debit" ? "default" : "ghost"} size="sm" className="h-7 text-xs" onClick={() => setFilterType("debit")} data-testid="filter-cf-debit">출금</Button>
        </div>

        <div className="flex items-center gap-1 border rounded-lg p-0.5">
          <Button variant={filterSource === "all" ? "default" : "ghost"} size="sm" className="h-7 text-xs" onClick={() => setFilterSource("all")} data-testid="filter-cf-source-all">전체</Button>
          <Button variant={filterSource === "bank" ? "default" : "ghost"} size="sm" className="h-7 text-xs" onClick={() => setFilterSource("bank")} data-testid="filter-cf-source-bank">
            <Landmark className="h-3 w-3 mr-1" />은행
          </Button>
          <Button variant={filterSource === "planned" ? "default" : "ghost"} size="sm" className="h-7 text-xs" onClick={() => setFilterSource("planned")} data-testid="filter-cf-source-planned">
            <ClipboardList className="h-3 w-3 mr-1" />예정
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="border rounded-lg px-3 py-2 bg-blue-50/40 dark:bg-blue-900/10">
          <div className="text-[10px] text-muted-foreground">실제 입금 (은행)</div>
          <div className="text-sm font-semibold text-blue-600" data-testid="text-cf-total-credit">+{totalCredit.toLocaleString()}원</div>
        </div>
        <div className="border rounded-lg px-3 py-2 bg-red-50/40 dark:bg-red-900/10">
          <div className="text-[10px] text-muted-foreground">실제 출금 (은행)</div>
          <div className="text-sm font-semibold text-red-600" data-testid="text-cf-total-debit">-{totalDebit.toLocaleString()}원</div>
        </div>
        <div className="border rounded-lg px-3 py-2 bg-blue-50/20 dark:bg-blue-900/5">
          <div className="text-[10px] text-muted-foreground">예정 입금 (미연결)</div>
          <div className="text-sm font-semibold text-blue-500" data-testid="text-cf-planned-income">+{plannedIncome.toLocaleString()}원</div>
        </div>
        <div className="border rounded-lg px-3 py-2 bg-red-50/20 dark:bg-red-900/5">
          <div className="text-[10px] text-muted-foreground">예정 출금 (미연결)</div>
          <div className="text-sm font-semibold text-red-500" data-testid="text-cf-planned-expense">-{plannedExpense.toLocaleString()}원</div>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : visibleRows.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm border rounded-lg">
          <Landmark className="h-10 w-10 mx-auto mb-3 opacity-20" />
          이 월의 거래내역이 없습니다
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden" data-testid="cashflow-table">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground w-24">날짜</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground w-6"></th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">내용</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground w-28">출금</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground w-28">입금</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground w-28">잔액</th>
                <th className="text-center px-3 py-2 font-medium text-muted-foreground w-20">상태</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {visibleRows.map((row, idx) => {
                if (row.kind === "bank") {
                  const tx = row.tx;
                  const isMatched = tx.matchStatus === "manual" || tx.matchStatus === "auto";
                  const isIgnored = tx.matchStatus === "ignored";
                  const rowKey = `bank-${tx.id}`;
                  const isExpanded = expandedId === rowKey;
                  return (
                    <Fragment key={rowKey}>
                      <tr
                        className={`group hover:bg-muted/30 cursor-pointer transition-colors ${isMatched ? "bg-green-50/40 dark:bg-green-950/10" : ""}`}
                        onClick={() => setExpandedId(isExpanded ? null : rowKey)}
                        data-testid={`cf-bank-row-${tx.id}`}
                      >
                        <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{tx.txDate}</td>
                        <td className="px-1 py-2 text-center">
                          <Landmark className="h-3 w-3 text-muted-foreground" />
                        </td>
                        <td className="px-3 py-2">
                          <div className="min-w-0">
                            {tx.counterparty && <div className="font-medium truncate text-xs">{tx.counterparty}</div>}
                            {tx.description && <div className="text-xs text-muted-foreground truncate">{tx.description}</div>}
                            {!tx.counterparty && !tx.description && <span className="text-muted-foreground text-xs">-</span>}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-xs">
                          {tx.debitAmount ? <span className="text-red-600 font-medium">{tx.debitAmount.toLocaleString()}</span> : <span className="text-muted-foreground">-</span>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-xs">
                          {tx.creditAmount ? <span className="text-blue-600 font-medium">{tx.creditAmount.toLocaleString()}</span> : <span className="text-muted-foreground">-</span>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-xs text-muted-foreground">
                          {tx.balance != null ? tx.balance.toLocaleString() : "-"}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {isMatched ? (
                            <Badge variant="outline" className="text-green-600 bg-green-50 border-green-200 text-[10px]">
                              <Link2 className="h-2.5 w-2.5 mr-0.5" />연결됨
                            </Badge>
                          ) : isIgnored ? (
                            <Badge variant="outline" className="text-muted-foreground text-[10px]">계획없음</Badge>
                          ) : (
                            <Badge variant="outline" className="text-orange-500 bg-orange-50 border-orange-200 text-[10px]">미연결</Badge>
                          )}
                        </td>
                        <td className="px-1 text-right">
                          <div className="flex items-center justify-end gap-0.5">
                            {!isMatched && (
                              <Button
                                variant="ghost" size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100"
                                onClick={e => { e.stopPropagation(); setMatchDialogTx(tx); }}
                                data-testid={`button-cf-match-${tx.id}`}
                              >
                                <Link2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {isMatched && (
                              <Button
                                variant="ghost" size="icon"
                                className="h-6 w-6 text-green-600 hover:text-orange-500 opacity-0 group-hover:opacity-100"
                                onClick={e => { e.stopPropagation(); if (confirm("연결을 해제하시겠습니까?")) unmatchMutation.mutate(tx.id); }}
                                data-testid={`button-cf-unmatch-${tx.id}`}
                              >
                                <Link2Off className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${rowKey}-detail`} className="bg-muted/10">
                          <td colSpan={8} className="px-4 py-2.5">
                            <div className="flex items-center justify-between gap-4">
                              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs flex-1">
                                {tx.txTime && <><span className="text-muted-foreground">거래시각</span><span>{tx.txTime}</span></>}
                                {tx.txCategory && <><span className="text-muted-foreground">거래구분</span><span>{tx.txCategory}</span></>}
                                {isMatched && tx.matchedPaymentId && <><span className="text-muted-foreground">연결된 계획</span><span className="text-green-700 font-medium">자금계획 연결됨</span></>}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {!isMatched ? (
                                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setMatchDialogTx(tx)} data-testid={`button-cf-match-detail-${tx.id}`}>
                                    <Link2 className="h-3 w-3 mr-1" />{isIgnored ? "다시 연결" : "연결하기"}
                                  </Button>
                                ) : (
                                  <Button size="sm" variant="outline" className="h-7 text-xs text-orange-600 border-orange-300" onClick={() => { if (confirm("연결을 해제하시겠습니까?")) unmatchMutation.mutate(tx.id); }} data-testid={`button-cf-unmatch-detail-${tx.id}`}>
                                    <Link2Off className="h-3 w-3 mr-1" />연결 해제
                                  </Button>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                } else {
                  const p = row.payment;
                  const rowKey = `payment-${p.id}`;
                  const isExpanded = expandedId === rowKey;
                  const today = new Date().toISOString().split("T")[0];
                  const isOverdue = p.status !== "completed" && p.plannedDate && p.plannedDate < today;
                  const date = p.actualDate || p.plannedDate || "";
                  return (
                    <Fragment key={rowKey}>
                      <tr
                        className={`group cursor-pointer transition-colors ${isOverdue ? "bg-red-50/30 dark:bg-red-950/10 hover:bg-red-50/50" : "bg-blue-50/10 dark:bg-blue-950/5 hover:bg-muted/20"}`}
                        onClick={() => setExpandedId(isExpanded ? null : rowKey)}
                        data-testid={`cf-payment-row-${p.id}`}
                      >
                        <td className="px-3 py-2 text-xs text-muted-foreground italic whitespace-nowrap">{date || "-"}</td>
                        <td className="px-1 py-2 text-center">
                          <ClipboardList className="h-3 w-3 text-muted-foreground/60" />
                        </td>
                        <td className="px-3 py-2">
                          <div className="min-w-0">
                            <div className="text-xs italic text-muted-foreground truncate">
                              {p.description || p.companyName || p.projectCustomerName || "내용 없음"}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-xs">
                          {p.type === "expense" && p.amount ? (
                            <span className="text-red-400 italic">{p.amount.toLocaleString()}</span>
                          ) : <span className="text-muted-foreground">-</span>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-xs">
                          {p.type === "income" && p.amount ? (
                            <span className="text-blue-400 italic">{p.amount.toLocaleString()}</span>
                          ) : <span className="text-muted-foreground">-</span>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-xs text-muted-foreground italic">
                          {row.estimatedBalance != null ? `~${row.estimatedBalance.toLocaleString()}` : "-"}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <PaymentStatusBadge payment={p} />
                        </td>
                        <td className="px-1"></td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${rowKey}-detail`} className="bg-muted/10">
                          <td colSpan={8} className="px-4 py-2.5">
                            <div className="text-xs grid grid-cols-2 gap-x-6 gap-y-1 flex-1">
                              {p.companyName && <><span className="text-muted-foreground">거래처</span><span>{p.companyName}</span></>}
                              {p.description && <><span className="text-muted-foreground">설명</span><span>{p.description}</span></>}
                              <span className="text-muted-foreground">예정금액</span><span>{formatAmount(p.amount)}</span>
                              <span className="text-muted-foreground">유형</span><span>{p.type === "income" ? "입금" : "출금"}</span>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                }
              })}
            </tbody>
          </table>
        </div>
      )}

      {matchDialogTx && (
        <MatchDialog tx={matchDialogTx} onClose={() => setMatchDialogTx(null)} />
      )}
    </div>
  );
}
