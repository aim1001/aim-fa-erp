import { useQuery, useMutation } from "@tanstack/react-query";
import { deriveCashCategory, type CashCategory, simplifyCategory, type SimpleCashCategory, SIMPLE_CASH_CATEGORIES } from "@shared/cash-category";
import { SIMPLE_CAT_STYLE } from "@/components/cash-category-chip";
import { useState, useMemo, useRef, useEffect, Fragment } from "react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  ChevronLeft, ChevronRight, ChevronDown, Landmark, ClipboardList,
  Link2, Link2Off, AlertCircle, RefreshCw, AlertTriangle, Clock, Check, Plus,
  ArrowUp, ArrowDown, CalendarDays, X, Search, SlidersHorizontal, CheckCircle2,
  Columns3, CalendarRange, TrendingDown,
} from "lucide-react";
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import type { BankAccount, BankTransaction, MonthlyBalance, Payment } from "@shared/schema";
import { PaymentDetailModal } from "./fund-overview-tab";

type RangeMode = "month" | "6mo";

function endOfMonthStr(year: number, monthIdx0: number): string {
  const d = new Date(year, monthIdx0 + 1, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type EnrichedPayment = Payment & {
  invoiceIssueDate: string | null;
  invoiceNumber: string | null;
  invoiceTotalAmount: number | null;
  invoiceItem: string | null;
  invoicePaidAmount: number;
  invoiceRemainingAmount: number;
  invoiceSupplyAmount: number | null;
  invoiceTaxAmount: number | null;
  projectNumber: string | null;
  projectCustomerName: string | null;
  purchaseOrderNumber: string | null;
};

// 지급계획의 용도(카테고리)
function catOfPayment(p: EnrichedPayment): CashCategory {
  return deriveCashCategory({
    type: p.type, category: (p as any).category, companyName: p.companyName, description: p.description,
    salesInvoiceId: p.salesInvoiceId, purchaseInvoiceId: p.purchaseInvoiceId, recurringExpenseId: (p as any).recurringExpenseId,
  });
}
// 은행거래의 용도 — 매칭된 계획이 있으면 그 용도를, 없으면 거래처/적요로 추정
function catOfBank(tx: BankTransaction, linked?: EnrichedPayment): CashCategory {
  if (linked) return catOfPayment(linked);
  return deriveCashCategory({
    type: (tx.creditAmount || 0) > 0 ? "income" : "expense",
    companyName: tx.counterparty, description: tx.description, salesInvoiceId: (tx as any).matchedSalesInvoiceId,
  });
}
// 간소화 카테고리(화면용). 수금은 고객사(프로젝트/계산서) 연결된 입금만, 그 외 입금은 기타.
function scatOfPayment(p: EnrichedPayment): SimpleCashCategory {
  if (p.type === "income") return (p.projectNumber || p.salesInvoiceId || p.projectCustomerName) ? "수금" : "기타";
  return simplifyCategory(catOfPayment(p));
}
function scatOfBank(tx: BankTransaction, linked?: EnrichedPayment): SimpleCashCategory {
  if ((tx.creditAmount || 0) > 0) return (linked && (linked.projectNumber || linked.salesInvoiceId)) ? "수금" : "기타";
  return simplifyCategory(catOfBank(tx, linked));
}
// 자금계획 변경 시 함께 갱신할 화면들 (경영 대시보드·월별요약·미수금 등)
function invalidateCashViews() {
  ["/api/payments", "/api/bank-transactions", "/api/cash-flow/monthly-summary",
   "/api/management-dashboard", "/api/receivables", "/api/bank-accounts/balances"]
    .forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
}

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
  | { kind: "bank"; tx: BankTransaction; runningBalance: number | null; estimatedBalance?: never }
  | { kind: "payment"; payment: EnrichedPayment; runningBalance?: never; estimatedBalance: number | null };

type FilterStatus = "all" | "matched" | "unmatched" | "planned" | "overdue";

function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const ny = dt.getFullYear();
  const nm = String(dt.getMonth() + 1).padStart(2, "0");
  const nd = String(dt.getDate()).padStart(2, "0");
  return `${ny}-${nm}-${nd}`;
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
      invalidateCashViews();
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

function AddPaymentDialog({ defaultYear, defaultMonth, onClose }: {
  defaultYear: number;
  defaultMonth: number;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const defaultDate = `${defaultYear}-${String(defaultMonth).padStart(2, "0")}-01`;

  const [type, setType] = useState<"income" | "expense">("expense");
  const [companyName, setCompanyName] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [plannedDate, setPlannedDate] = useState(defaultDate);

  const addMutation = useMutation({
    mutationFn: async () => {
      const amt = parseInt(amount);
      if (!amount || isNaN(amt) || amt <= 0) throw new Error("금액을 올바르게 입력해주세요");
      const res = await apiRequest("POST", "/api/payments", {
        type,
        companyName: companyName || null,
        description: description || null,
        amount: amt,
        plannedDate: plannedDate || null,
        status: "planned",
        paymentMethod: "specific_date",
      });
      return res.json();
    },
    onSuccess: () => {
      invalidateCashViews();
      toast({ title: "자금계획이 추가되었습니다" });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "추가 실패", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>자금계획 추가</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-1 border rounded-lg p-0.5 w-fit">
            <Button
              variant={type === "expense" ? "default" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setType("expense")}
              data-testid="button-add-payment-expense"
            >출금</Button>
            <Button
              variant={type === "income" ? "default" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setType("income")}
              data-testid="button-add-payment-income"
            >입금</Button>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">거래처</Label>
            <Input
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              placeholder="거래처명"
              className="h-8 text-sm"
              data-testid="input-add-payment-company"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">설명</Label>
            <Input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="내용"
              className="h-8 text-sm"
              data-testid="input-add-payment-description"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">금액 <span className="text-red-500">*</span></Label>
            <Input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0"
              className="h-8 text-sm"
              onKeyDown={e => { if (e.key === "Enter") addMutation.mutate(); }}
              data-testid="input-add-payment-amount"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">예정일</Label>
            <Input
              type="date"
              value={plannedDate}
              onChange={e => setPlannedDate(e.target.value)}
              className="h-8 text-sm"
              data-testid="input-add-payment-date"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={addMutation.isPending}>취소</Button>
          <Button onClick={() => addMutation.mutate()} disabled={!amount || addMutation.isPending} data-testid="button-add-payment-confirm">
            {addMutation.isPending ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
            추가
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// 변동금액 정기 등 '확인 필요' 건을 실제 출금에 연결하거나 완료처리하는 다이얼로그
function ConfirmRecurringDialog({ payment, onClose }: { payment: EnrichedPayment; onClose: () => void }) {
  const { toast } = useToast();
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const ym = (payment.plannedDate || payment.actualDate || "").slice(0, 7);
  const [y, m] = ym.split("-").map(Number);
  const start = `${ym}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${ym}-${String(lastDay).padStart(2, "0")}`;

  const { data: txs = [], isLoading } = useQuery<BankTransaction[]>({
    queryKey: ["/api/bank-transactions", "confirm-debit", ym, start, end],
    queryFn: async () => {
      const res = await fetch(`/api/bank-transactions?startDate=${start}&endDate=${end}&txType=debit`);
      return res.json();
    },
  });
  const candidates = useMemo(() => txs
    .filter(t => (t.debitAmount || 0) > 0 && (!t.matchStatus || t.matchStatus === "unmatched"))
    .sort((a, b) => Math.abs((a.debitAmount || 0) - (payment.amount || 0)) - Math.abs((b.debitAmount || 0) - (payment.amount || 0))),
    [txs, payment.amount]);

  const linkMutation = useMutation({
    mutationFn: async (txId: string) => {
      const res = await apiRequest("POST", `/api/bank-transactions/${txId}/match`, { paymentId: payment.id });
      return res.json();
    },
    onSuccess: () => { invalidateCashViews(); toast({ title: "확인 완료 — 실제 출금에 연결됨" }); onClose(); },
    onError: (e: Error) => toast({ title: "연결 실패", description: e.message, variant: "destructive" }),
  });
  const completeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/payments/bulk-complete", { ids: [payment.id] });
      return res.json();
    },
    onSuccess: () => { invalidateCashViews(); toast({ title: "완료 처리됨" }); onClose(); },
    onError: (e: Error) => toast({ title: "완료 실패", description: e.message, variant: "destructive" }),
  });
  const pending = linkMutation.isPending || completeMutation.isPending;

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>정기지출 확인 — 실제 출금 연결</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="bg-muted/40 rounded-lg px-3 py-2.5 text-sm space-y-1">
            <div className="flex items-center justify-between">
              <div className="font-medium">{payment.companyName || payment.description || "정기지출"}</div>
              <div className="text-red-600 font-semibold">-{(payment.amount || 0).toLocaleString()}원</div>
            </div>
            <div className="text-xs text-muted-foreground">예정일 {payment.plannedDate} · 실제 나간 금액으로 연결됩니다</div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">
              {ym} 미연결 출금 {!isLoading && <span className="font-normal">({candidates.length}건 — 금액 가까운 순)</span>}
            </div>
            {isLoading ? (
              <div className="space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-12" />)}</div>
            ) : candidates.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6 bg-muted/20 rounded-lg">이 달에 미연결 출금이 없습니다</div>
            ) : (
              <div className="space-y-1 max-h-60 overflow-y-auto pr-1">
                {candidates.slice(0, 15).map(t => {
                  const diff = (t.debitAmount || 0) - (payment.amount || 0);
                  return (
                    <div key={t.id}
                      className={`border rounded-lg px-3 py-2 cursor-pointer text-sm ${selectedTxId === t.id ? "border-primary bg-primary/5" : "hover:border-primary/40 hover:bg-muted/30"}`}
                      onClick={() => setSelectedTxId(selectedTxId === t.id ? null : t.id)}
                      data-testid={`confirm-candidate-${t.id}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{t.counterparty || t.description || "내용 없음"}</div>
                          <div className="text-xs text-muted-foreground">{t.txDate}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-red-600 font-medium">-{(t.debitAmount || 0).toLocaleString()}</div>
                          {diff !== 0 && <div className="text-[10px] text-muted-foreground">예정대비 {diff > 0 ? "+" : ""}{diff.toLocaleString()}</div>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" size="sm" className="text-xs text-muted-foreground" disabled={pending}
            onClick={() => completeMutation.mutate()} data-testid="button-confirm-complete-only">
            은행출금 없이 완료
          </Button>
          <div className="flex gap-2 sm:ml-auto">
            <Button variant="secondary" size="sm" onClick={onClose} disabled={pending}>취소(연체 유지)</Button>
            <Button size="sm" disabled={!selectedTxId || pending}
              onClick={() => { if (selectedTxId) linkMutation.mutate(selectedTxId); }} data-testid="button-confirm-link">
              {pending ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : <Link2 className="h-4 w-4 mr-1" />}연결
            </Button>
          </div>
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

export function CashFlowTab({ year, month, onPrevMonth, onNextMonth, onGoToMonth }: {
  year: number;
  month: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onGoToMonth?: (year: number, month: number) => void;
}) {
  const { toast } = useToast();
  const [rangeMode, setRangeMode] = useState<RangeMode>("6mo");
  const [filterAccount, setFilterAccount] = useState<string>("all");
  const [filterType, setFilterType] = useState<"all" | "credit" | "debit">("all");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [filterCategory, setFilterCategory] = useState<SimpleCashCategory | "all">("all");
  const [showActual, setShowActual] = useState(false); // 과거 실제 거래 펼치기
  const [confirmTarget, setConfirmTarget] = useState<EnrichedPayment | null>(null); // 연체 정기 확인
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [matchDialogTx, setMatchDialogTx] = useState<BankTransaction | null>(null);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDate, setBulkDate] = useState("");

  const [showDetailColumns, setShowDetailColumns] = useState(false);

  // Search/filter state
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMinAmount, setSearchMinAmount] = useState("");
  const [searchMaxAmount, setSearchMaxAmount] = useState("");
  const [searchDateFrom, setSearchDateFrom] = useState("");
  const [searchDateTo, setSearchDateTo] = useState("");

  const isSearchActive = !!(searchQuery || searchMinAmount || searchMaxAmount || searchDateFrom || searchDateTo);

  const resetSearch = () => {
    setSearchQuery("");
    setSearchMinAmount("");
    setSearchMaxAmount("");
    setSearchDateFrom("");
    setSearchDateTo("");
    setSelectedIds(new Set());
    setBulkDate("");
  };

  // Clear selection when month or filters change
  const clearSelection = () => { setSelectedIds(new Set()); setBulkDate(""); };
  const handlePrevMonth = () => { clearSelection(); onPrevMonth(); };
  const handleNextMonth = () => { clearSelection(); onNextMonth(); };
  const handleFilterAccount = (v: string) => { clearSelection(); setFilterAccount(v); };
  const handleFilterType = (v: "all" | "credit" | "debit") => { clearSelection(); setFilterType(v); };
  const handleFilterStatus = (v: FilterStatus) => { clearSelection(); setFilterStatus(v); };
  const handleFilterCategory = (v: SimpleCashCategory | "all") => { clearSelection(); setFilterCategory(v); };

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  // 6mo mode: current month start through +5 months end (6 months total); month mode: this month only
  const endDate = rangeMode === "6mo"
    ? endOfMonthStr(year, month - 1 + 5)
    : endOfMonthStr(year, month - 1);

  // When search is active, use search date range; if only non-date search, use unbounded range
  const effectiveStartDate = isSearchActive
    ? (searchDateFrom || "1900-01-01")
    : startDate;
  const effectiveEndDate = isSearchActive
    ? (searchDateTo || new Date().toISOString().split("T")[0])
    : endDate;

  const { data: accounts = [] } = useQuery<BankAccount[]>({ queryKey: ["/api/bank-accounts"] });

  const { data: accountBalanceSummary } = useQuery<{ balances: { accountId: string; balance: number }[]; total: number }>({
    queryKey: ["/api/bank-accounts/balances"],
    queryFn: async () => {
      const res = await fetch("/api/bank-accounts/balances");
      return res.json();
    },
  });

  const { data: monthlyBalance } = useQuery<MonthlyBalance | null>({
    queryKey: ["/api/monthly-balances", year, month],
    queryFn: async () => {
      const res = await fetch(`/api/monthly-balances?year=${year}&month=${month}`);
      return res.json();
    },
  });

  const { data: bankTxs = [], isLoading: txLoading } = useQuery<BankTransaction[]>({
    queryKey: ["/api/bank-transactions", "cashflow", filterAccount, effectiveStartDate, effectiveEndDate, searchQuery, searchMinAmount, searchMaxAmount],
    queryFn: async () => {
      const params = new URLSearchParams({ startDate: effectiveStartDate, endDate: effectiveEndDate });
      if (filterAccount !== "all") params.set("accountId", filterAccount);
      const res = await fetch(`/api/bank-transactions?${params}`);
      let txList: BankTransaction[] = await res.json();
      if (isSearchActive) {
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          txList = txList.filter(tx =>
            (tx.counterparty && tx.counterparty.toLowerCase().includes(q)) ||
            (tx.description && tx.description.toLowerCase().includes(q))
          );
        }
        if (searchMinAmount) {
          const min = parseInt(searchMinAmount);
          if (!isNaN(min)) {
            txList = txList.filter(tx => {
              const amt = (tx.creditAmount || 0) + (tx.debitAmount || 0);
              return amt >= min;
            });
          }
        }
        if (searchMaxAmount) {
          const max = parseInt(searchMaxAmount);
          if (!isNaN(max)) {
            txList = txList.filter(tx => {
              const amt = (tx.creditAmount || 0) + (tx.debitAmount || 0);
              return amt <= max;
            });
          }
        }
      }
      return txList;
    },
  });

  const { data: payments = [], isLoading: paymentsLoading } = useQuery<EnrichedPayment[]>({
    queryKey: ["/api/payments", isSearchActive ? "search" : rangeMode, isSearchActive ? "search" : year, isSearchActive ? "search" : month, searchQuery, searchMinAmount, searchMaxAmount, searchDateFrom, searchDateTo],
    queryFn: async () => {
      if (isSearchActive) {
        const params = new URLSearchParams();
        if (searchDateFrom && searchDateTo) {
          params.set("dateFrom", searchDateFrom);
          params.set("dateTo", searchDateTo);
        } else if (searchDateFrom) {
          params.set("dateFrom", searchDateFrom);
          params.set("dateTo", new Date().toISOString().split("T")[0]);
        } else if (searchDateTo) {
          params.set("dateFrom", "2020-01-01");
          params.set("dateTo", searchDateTo);
        }
        if (searchQuery) params.set("companyName", searchQuery);
        if (searchMinAmount) params.set("minAmount", searchMinAmount);
        if (searchMaxAmount) params.set("maxAmount", searchMaxAmount);
        const res = await fetch(`/api/payments?${params}`);
        return res.json();
      }
      if (rangeMode === "6mo") {
        const res = await fetch(`/api/payments?dateFrom=${startDate}&dateTo=${endDate}`);
        return res.json();
      }
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
      invalidateCashViews();
    },
  });

  // Shift a single payment's plannedDate by ±1 day
  const shiftDateMutation = useMutation({
    mutationFn: async ({ id, delta }: { id: string; delta: number }) => {
      const payment = payments.find(p => p.id === id);
      if (!payment?.plannedDate) throw new Error("날짜 없음");
      const newDate = shiftDate(payment.plannedDate, delta);
      const res = await apiRequest("PATCH", `/api/payments/${id}`, { plannedDate: newDate });
      return res.json();
    },
    onSuccess: (data) => {
      invalidateCashViews();
      if (data?.plannedDate) {
        const [ny, nm] = data.plannedDate.split("-").map(Number);
        if (ny !== year || nm !== month) {
          if (onGoToMonth) onGoToMonth(ny, nm);
          toast({ title: `${ny}년 ${nm}월로 이동됨`, description: "날짜가 현재 월 밖으로 이동되어 해당 월 뷰로 전환했습니다" });
        }
      }
    },
    onError: (err: Error) => {
      toast({ title: "날짜 변경 실패", description: err.message, variant: "destructive" });
    },
  });

  // Bulk uncomplete (되돌리기)
  const bulkUncompleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiRequest("POST", "/api/payments/bulk-uncomplete", { ids });
      return res.json();
    },
    onSuccess: (data) => {
      invalidateCashViews();
      toast({ title: `${data.updated}건 되돌리기 완료`, description: "미완료 상태로 변경됐습니다" });
    },
    onError: (err: Error) => {
      toast({ title: "되돌리기 실패", description: err.message, variant: "destructive" });
    },
  });

  // Bulk complete
  const bulkCompleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiRequest("POST", "/api/payments/bulk-complete", { ids });
      return res.json();
    },
    onSuccess: (data) => {
      invalidateCashViews();
      queryClient.invalidateQueries({ queryKey: ["/api/bank-transactions"] });
      toast({ title: `${data.updated}건 완료 처리됨`, description: "계산서 일자 기준으로 실제일이 설정됐습니다" });
      setSelectedIds(new Set());
      setBulkDate("");
    },
    onError: (err: Error) => {
      toast({ title: "완료 처리 실패", description: err.message, variant: "destructive" });
    },
  });

  // Bulk date change
  const bulkDateMutation = useMutation({
    mutationFn: async ({ ids, plannedDate }: { ids: string[]; plannedDate: string }) => {
      const res = await apiRequest("POST", "/api/payments/bulk-date", { ids, plannedDate });
      return res.json();
    },
    onSuccess: (data, variables) => {
      invalidateCashViews();
      const [ny, nm] = variables.plannedDate.split("-").map(Number);
      if (ny !== year || nm !== month) {
        if (onGoToMonth) onGoToMonth(ny, nm);
        toast({ title: `${data.updated}건 날짜 변경 완료 — ${ny}년 ${nm}월로 이동됨` });
      } else {
        toast({ title: `${data.updated}건 날짜 변경 완료` });
      }
      setSelectedIds(new Set());
      setBulkDate("");
    },
    onError: (err: Error) => {
      toast({ title: "일괄 변경 실패", description: err.message, variant: "destructive" });
    },
  });

  // 정기지출 자동 투영: 이번 달부터 6개월치 정기항목을 예정으로 생성(멱등)
  const projectMutation = useMutation({
    mutationFn: async () => {
      let total = 0;
      for (let i = 0; i < 6; i++) {
        const d = new Date(year, month - 1 + i, 1);
        const res = await apiRequest("POST", `/api/recurring-expenses/generate?year=${d.getFullYear()}&month=${d.getMonth() + 1}`);
        const j = await res.json().catch(() => ({}));
        total += j.created || 0;
      }
      return total;
    },
    onSuccess: (total: number) => {
      invalidateCashViews();
      toast({ title: "정기지출 반영 완료", description: total > 0 ? `${total}건 생성` : "이미 모두 반영됨" });
    },
    onError: (e: Error) => toast({ title: "반영 실패", description: e.message, variant: "destructive" }),
  });

  // 정기지출 ↔ 실제 출금 자동매칭 (같은 달·동일 금액). 미매칭은 '확인 필요'로 남음.
  const recurringMatchMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/recurring-payments/auto-match", {});
      return res.json() as Promise<{ matched: number; unresolvedCount: number }>;
    },
    onSuccess: (d) => {
      invalidateCashViews();
      toast({
        title: `정기 자동매칭 — ${d.matched}건 매칭됨`,
        description: d.unresolvedCount > 0 ? `${d.unresolvedCount}건은 금액이 달라 확인 필요(수동매칭/연체)` : "남은 미확인 없음",
      });
    },
    onError: (e: Error) => toast({ title: "자동매칭 실패", description: e.message, variant: "destructive" }),
  });

  const matchedPaymentIds = useMemo(() => {
    const ids = new Set<string>();
    bankTxs.forEach(tx => {
      if (tx.matchedPaymentId) ids.add(tx.matchedPaymentId);
    });
    return ids;
  }, [bankTxs]);

  // 매칭된 은행거래에 프로젝트/발주 정보를 붙이기 위한 룩업
  const paymentById = useMemo(() => new Map(payments.map(p => [p.id, p])), [payments]);
  // 계산서ID로도 enrich (입금 자동매칭은 payment가 아니라 계산서에 연결되므로)
  const invoiceInfo = useMemo(() => {
    const m = new Map<string, EnrichedPayment>();
    payments.forEach(p => {
      for (const key of [p.salesInvoiceId, p.purchaseInvoiceId]) {
        if (!key) continue;
        const ex = m.get(key);
        if (!ex || (!ex.projectNumber && p.projectNumber)) m.set(key, p);
      }
    });
    return m;
  }, [payments]);
  // 은행거래 → 연결된 계획/계산서 정보 (payment 우선, 없으면 계산서)
  const bankLinkOf = (tx: BankTransaction): EnrichedPayment | undefined =>
    (tx.matchedPaymentId ? paymentById.get(tx.matchedPaymentId) : undefined)
    ?? (tx.matchedSalesInvoiceId ? invoiceInfo.get(tx.matchedSalesInvoiceId) : undefined)
    ?? (tx.matchedPurchaseInvoiceId ? invoiceInfo.get(tx.matchedPurchaseInvoiceId) : undefined);

  const rows = useMemo((): CashFlowRow[] => {
    const today = new Date().toISOString().split("T")[0];

    const bankRows: CashFlowRow[] = bankTxs
      .filter(tx => {
        if (filterType === "credit" && !(tx.creditAmount && tx.creditAmount > 0)) return false;
        if (filterType === "debit" && !(tx.debitAmount && tx.debitAmount > 0)) return false;
        return true;
      })
      .map(tx => ({ kind: "bank" as const, tx, runningBalance: null }));

    // 완료된 계획은 은행거래로 집행되어 표시되므로 제외(중복 방지). 미완료 예정만 plan row로.
    const unmatched = payments.filter(p => p.status !== "completed" && !matchedPaymentIds.has(p.id));
    const planRows: CashFlowRow[] = unmatched
      .filter(p => {
        if (filterType === "credit" && p.type !== "income") return false;
        if (filterType === "debit" && p.type !== "expense") return false;
        return true;
      })
      .map(p => {
        const isOverdue = p.status !== "completed" && p.plannedDate && p.plannedDate < today;
        return { kind: "payment" as const, payment: p, estimatedBalance: null, isOverdue: !!isOverdue };
      });

    const all: CashFlowRow[] = [...bankRows, ...planRows];
    const isIncomeRow = (r: CashFlowRow) => r.kind === "bank" ? (r.tx.creditAmount || 0) > 0 : r.payment.type === "income";
    all.sort((a, b) => {
      const da = a.kind === "bank" ? (a.tx.txDate || "") : (a.payment.actualDate || a.payment.plannedDate || "");
      const db = b.kind === "bank" ? (b.tx.txDate || "") : (b.payment.actualDate || b.payment.plannedDate || "");
      if (da !== db) return da.localeCompare(db);
      // 같은 날짜: 수금(입금)을 먼저
      const ai = isIncomeRow(a), bi = isIncomeRow(b);
      return ai === bi ? 0 : ai ? -1 : 1;
    });

    const openingBalance = monthlyBalance?.openingBalance ?? null;

    if (filterAccount !== "all") {
      let cursor: number | null = openingBalance;
      return all.map(row => {
        if (row.kind === "bank") {
          if (row.tx.balance != null) cursor = row.tx.balance;
          return { ...row, runningBalance: cursor };
        } else {
          let estimated: number | null = null;
          if (cursor != null) {
            const amt = row.payment.amount || 0;
            estimated = row.payment.type === "income" ? cursor + amt : cursor - amt;
            cursor = estimated;
          }
          return { ...row, estimatedBalance: estimated };
        }
      });
    } else {
      const accountBalances = new Map<string, number>();
      let cursor: number | null = openingBalance;

      return all.map(row => {
        if (row.kind === "bank") {
          const tx = row.tx;
          if (tx.balance != null) {
            accountBalances.set(tx.accountId, tx.balance);
            cursor = Array.from(accountBalances.values()).reduce((s, v) => s + v, 0);
          } else if (cursor != null) {
            cursor = cursor + (tx.creditAmount || 0) - (tx.debitAmount || 0);
          }
          return { ...row, runningBalance: cursor };
        } else {
          let estimated: number | null = null;
          if (cursor != null) {
            const amt = row.payment.amount || 0;
            estimated = row.payment.type === "income" ? cursor + amt : cursor - amt;
            cursor = estimated;
          }
          return { ...row, estimatedBalance: estimated };
        }
      });
    }
  }, [bankTxs, payments, matchedPaymentIds, filterType, filterAccount, monthlyBalance]);

  const visibleRows = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    return rows.filter(row => {
      // 용도(카테고리) 필터 — 간소화 카테고리 기준
      if (filterCategory !== "all") {
        const cat = row.kind === "bank"
          ? scatOfBank(row.tx, bankLinkOf(row.tx))
          : scatOfPayment(row.payment);
        if (cat !== filterCategory) return false;
      }
      // 상태 필터
      if (filterStatus === "all") return true;
      if (row.kind === "bank") {
        const isMatched = row.tx.matchStatus === "manual" || row.tx.matchStatus === "auto";
        if (filterStatus === "matched") return isMatched;
        if (filterStatus === "unmatched") return !isMatched;
        return false;
      } else {
        if (filterStatus === "matched" || filterStatus === "unmatched") return false;
        const isOverdue = row.payment.status !== "completed" && row.payment.plannedDate && row.payment.plannedDate < today;
        if (filterStatus === "planned") return row.payment.status !== "completed" && !isOverdue;
        if (filterStatus === "overdue") return !!isOverdue;
        return true;
      }
    });
  }, [rows, filterStatus, filterCategory, paymentById]);

  // 실제(은행) 행은 접고, 예정(계획) 행은 펼쳐서 강조
  const todayStr = new Date().toISOString().split("T")[0];
  const bankVisible = useMemo(() => visibleRows.filter((r): r is Extract<CashFlowRow, { kind: "bank" }> => r.kind === "bank"), [visibleRows]);
  const planVisible = useMemo(() => visibleRows.filter((r): r is Extract<CashFlowRow, { kind: "payment" }> => r.kind === "payment"), [visibleRows]);
  const actualSummary = useMemo(() => {
    let credit = 0, debit = 0;
    bankVisible.forEach(r => { credit += r.tx.creditAmount || 0; debit += r.tx.debitAmount || 0; });
    return { credit, debit, count: bankVisible.length };
  }, [bankVisible]);
  // 예정 목록 중 오늘 이후 첫 행 (연체/오늘 구분선용)
  const todayDividerIndex = useMemo(() => {
    if (isSearchActive) return -1;
    return planVisible.findIndex(r => (r.payment.actualDate || r.payment.plannedDate || "") >= todayStr);
  }, [planVisible, isSearchActive, todayStr]);
  // 날짜 지났는데 미확인(연체) — 실제 출금 매칭 필요
  const overdueCount = useMemo(() =>
    planVisible.filter(r => {
      const d = r.payment.actualDate || r.payment.plannedDate || "";
      return r.payment.status !== "completed" && d && d < todayStr;
    }).length,
  [planVisible, todayStr]);

  // 오늘 위치로 자동 스크롤 (6개월 뷰 진입/갱신 시 1회)
  const todayRowRef = useRef<HTMLTableRowElement | null>(null);
  const didScrollRef = useRef(false);
  useEffect(() => { didScrollRef.current = false; }, [rangeMode, year, month, filterCategory, filterStatus, filterType, filterAccount, isSearchActive]);
  useEffect(() => {
    if (rangeMode === "6mo" && !isSearchActive && todayDividerIndex >= 0 && todayRowRef.current && !didScrollRef.current) {
      didScrollRef.current = true;
      todayRowRef.current.scrollIntoView({ block: "center", behavior: "auto" });
    }
  }, [rangeMode, isSearchActive, todayDividerIndex, visibleRows.length]);

  // Selectable payment rows (only payment rows, not completed)
  const selectablePaymentIds = useMemo(() =>
    visibleRows
      .filter(r => r.kind === "payment" && r.payment.status !== "completed")
      .map(r => (r as { kind: "payment"; payment: EnrichedPayment; estimatedBalance: number | null }).payment.id),
    [visibleRows]
  );

  const allSelected = selectablePaymentIds.length > 0 && selectablePaymentIds.every(id => selectedIds.has(id));
  const someSelected = selectedIds.size > 0;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectablePaymentIds));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totalCredit = bankTxs.reduce((s, t) => s + (t.creditAmount ?? 0), 0);
  const totalDebit = bankTxs.reduce((s, t) => s + (t.debitAmount ?? 0), 0);
  const plannedIncome = payments.filter(p => p.status !== "completed" && p.type === "income" && !matchedPaymentIds.has(p.id)).reduce((s, p) => s + (p.amount || 0), 0);
  const plannedExpense = payments.filter(p => p.status !== "completed" && p.type === "expense" && !matchedPaymentIds.has(p.id)).reduce((s, p) => s + (p.amount || 0), 0);

  const currentCashBalance = useMemo(() => {
    if (filterAccount === "all") {
      if (accountBalanceSummary == null) return null;
      return accountBalanceSummary.total;
    } else {
      const acctBalances = accountBalanceSummary?.balances ?? [];
      const entry = acctBalances.find(b => b.accountId === filterAccount);
      return entry?.balance ?? null;
    }
  }, [filterAccount, accountBalanceSummary]);

  // 잔액 추이 (필터와 무관하게 전체 흐름으로 계산 — 차트/최저잔고용)
  const balanceSeries = useMemo(() => {
    const opening = monthlyBalance?.openingBalance ?? null;
    type Item = { date: string; kind: "bank" | "pay"; accountId?: string; balance?: number | null; credit: number; debit: number };
    const items: Item[] = [];
    bankTxs.forEach(tx => items.push({
      date: tx.txDate || "", kind: "bank", accountId: tx.accountId,
      balance: tx.balance ?? null, credit: tx.creditAmount || 0, debit: tx.debitAmount || 0,
    }));
    payments.filter(p => p.status !== "completed" && !matchedPaymentIds.has(p.id)).forEach(p => items.push({
      date: p.actualDate || p.plannedDate || "", kind: "pay",
      credit: p.type === "income" ? (p.amount || 0) : 0, debit: p.type === "expense" ? (p.amount || 0) : 0,
    }));
    items.sort((a, b) => a.date.localeCompare(b.date));

    const byDate = new Map<string, number>();
    if (filterAccount !== "all") {
      let cursor: number | null = opening;
      for (const it of items) {
        if (it.kind === "bank") { if (it.balance != null) cursor = it.balance; }
        else if (cursor != null) cursor = cursor + it.credit - it.debit;
        if (cursor != null && it.date) byDate.set(it.date, cursor);
      }
    } else {
      const acct = new Map<string, number>();
      let cursor: number | null = opening;
      for (const it of items) {
        if (it.kind === "bank") {
          if (it.balance != null) { acct.set(it.accountId!, it.balance); cursor = Array.from(acct.values()).reduce((s, v) => s + v, 0); }
          else if (cursor != null) cursor = cursor + it.credit - it.debit;
        } else if (cursor != null) cursor = cursor + it.credit - it.debit;
        if (cursor != null && it.date) byDate.set(it.date, cursor);
      }
    }
    return Array.from(byDate.entries()).map(([date, bal]) => ({ date, bal })).sort((a, b) => a.date.localeCompare(b.date));
  }, [bankTxs, payments, matchedPaymentIds, monthlyBalance, filterAccount]);

  const minBalancePoint = useMemo(() => {
    if (balanceSeries.length === 0) return null;
    return balanceSeries.reduce((m, p) => (p.bal < m.bal ? p : m), balanceSeries[0]);
  }, [balanceSeries]);

  const isLoading = txLoading || paymentsLoading;

  const endMonthDate = new Date(year, month - 1 + (rangeMode === "6mo" ? 5 : 0), 1);
  const rangeLabel = isSearchActive
    ? "검색 결과"
    : rangeMode === "6mo"
      ? `${year}.${month} ~ ${endMonthDate.getFullYear()}.${endMonthDate.getMonth() + 1}`
      : `${year}년 ${month}월`;

  return (
    <div className="space-y-3" data-testid="cash-flow-tab">
      {!isSearchActive && overdueCount > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/20 px-4 py-2.5 flex-wrap" data-testid="cf-overdue-warning">
          <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
          <span className="text-sm font-medium text-red-700 dark:text-red-400">날짜가 지난 미확인 {overdueCount}건</span>
          <span className="text-xs text-red-600/80 dark:text-red-400/70 hidden sm:inline">실제 출금과 매칭하거나, 안 나갔으면 연체 확인이 필요합니다.</span>
          <Button
            size="sm" variant="outline"
            className="h-7 text-xs ml-auto border-red-300 text-red-700 hover:bg-red-100 dark:hover:bg-red-900/30"
            onClick={() => recurringMatchMutation.mutate()}
            disabled={recurringMatchMutation.isPending}
            data-testid="button-cf-recurring-match"
          >
            {recurringMatchMutation.isPending ? <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Link2 className="h-3.5 w-3.5 mr-1" />}
            정기 자동매칭
          </Button>
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 border rounded-lg p-0.5">
          <Button variant={rangeMode === "month" ? "default" : "ghost"} size="sm" className="h-7 text-xs" onClick={() => { clearSelection(); setRangeMode("month"); }} data-testid="button-cf-range-month">당월</Button>
          <Button variant={rangeMode === "6mo" ? "default" : "ghost"} size="sm" className="h-7 text-xs" onClick={() => { clearSelection(); setRangeMode("6mo"); }} data-testid="button-cf-range-6mo">6개월</Button>
        </div>
        <Button
          variant="ghost" size="icon"
          onClick={handlePrevMonth}
          disabled={isSearchActive}
          data-testid="button-cf-prev-month"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-semibold min-w-[120px] text-center" data-testid="text-cf-month">
          {isSearchActive
            ? <span className="text-muted-foreground font-normal">검색 결과</span>
            : <>{rangeLabel}{rangeMode === "6mo" && <span className="text-[10px] text-muted-foreground font-normal ml-1">(6개월)</span>}</>}
        </span>
        <Button
          variant="ghost" size="icon"
          onClick={handleNextMonth}
          disabled={isSearchActive}
          data-testid="button-cf-next-month"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>

        <Button
          variant="outline" size="sm" className="h-8 text-xs"
          onClick={() => projectMutation.mutate()}
          disabled={projectMutation.isPending}
          title="이번 달부터 6개월치 정기지출(급여·세금·대출 등)을 예정으로 자동 생성"
          data-testid="button-cf-project-recurring"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${projectMutation.isPending ? "animate-spin" : ""}`} />
          정기지출 반영
        </Button>

        <div className="h-5 w-px bg-border mx-1" />

        <Select value={filterAccount} onValueChange={handleFilterAccount}>
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
          <Button variant={filterType === "all" ? "default" : "ghost"} size="sm" className="h-7 text-xs" onClick={() => handleFilterType("all")} data-testid="filter-cf-all">전체</Button>
          <Button variant={filterType === "credit" ? "default" : "ghost"} size="sm" className="h-7 text-xs" onClick={() => handleFilterType("credit")} data-testid="filter-cf-credit">입금</Button>
          <Button variant={filterType === "debit" ? "default" : "ghost"} size="sm" className="h-7 text-xs" onClick={() => handleFilterType("debit")} data-testid="filter-cf-debit">출금</Button>
        </div>

        <div className="flex items-center gap-1 border rounded-lg p-0.5">
          <Button variant={filterStatus === "all" ? "default" : "ghost"} size="sm" className="h-7 text-xs" onClick={() => handleFilterStatus("all")} data-testid="filter-status-all">전체</Button>
          <Button variant={filterStatus === "matched" ? "default" : "ghost"} size="sm" className="h-7 text-xs text-green-700" onClick={() => handleFilterStatus("matched")} data-testid="filter-status-matched">
            <Link2 className="h-3 w-3 mr-1" />연결됨
          </Button>
          <Button variant={filterStatus === "unmatched" ? "default" : "ghost"} size="sm" className="h-7 text-xs text-orange-600" onClick={() => handleFilterStatus("unmatched")} data-testid="filter-status-unmatched">미연결</Button>
          <Button variant={filterStatus === "planned" ? "default" : "ghost"} size="sm" className="h-7 text-xs text-blue-600" onClick={() => handleFilterStatus("planned")} data-testid="filter-status-planned">
            <Clock className="h-3 w-3 mr-1" />예정
          </Button>
          <Button variant={filterStatus === "overdue" ? "default" : "ghost"} size="sm" className="h-7 text-xs text-red-600" onClick={() => handleFilterStatus("overdue")} data-testid="filter-status-overdue">
            <AlertTriangle className="h-3 w-3 mr-1" />연체
          </Button>
        </div>

        <Select value={filterCategory} onValueChange={v => handleFilterCategory(v as SimpleCashCategory | "all")}>
          <SelectTrigger className="w-28 h-8 text-xs" data-testid="select-cf-category">
            <SelectValue placeholder="전체 용도" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 용도</SelectItem>
            {SIMPLE_CASH_CATEGORIES.map(c => (
              <SelectItem key={c} value={c}>{SIMPLE_CAT_STYLE[c].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-1.5">
          <Button
            variant={showDetailColumns ? "secondary" : "ghost"}
            size="sm"
            className={`h-8 text-xs ${showDetailColumns ? "text-primary font-medium" : ""}`}
            onClick={() => setShowDetailColumns(v => !v)}
            data-testid="button-cf-detail-columns-toggle"
          >
            <Columns3 className="h-3.5 w-3.5 mr-1" />
            세부 보기
          </Button>
          <Button
            variant={showSearch || isSearchActive ? "secondary" : "ghost"}
            size="sm"
            className={`h-8 text-xs ${isSearchActive ? "text-primary font-medium" : ""}`}
            onClick={() => setShowSearch(v => !v)}
            data-testid="button-cf-search-toggle"
          >
            <Search className="h-3.5 w-3.5 mr-1" />
            검색
            {isSearchActive && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-primary inline-block" />}
          </Button>
          {isSearchActive && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
              onClick={resetSearch}
              data-testid="button-cf-search-reset"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button size="sm" className="h-8 text-xs" onClick={() => setShowAddDialog(true)} data-testid="button-cf-add-payment">
            <Plus className="h-3.5 w-3.5 mr-1" />추가
          </Button>
        </div>
      </div>

      {/* Search panel */}
      {showSearch && (
        <div className="border rounded-lg p-3 bg-muted/20 space-y-3" data-testid="cf-search-panel">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            검색 / 필터
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">업체명</Label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="업체명 또는 내용"
                  className="h-8 text-xs pl-7"
                  data-testid="input-cf-search-query"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">금액 범위</Label>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  value={searchMinAmount}
                  onChange={e => setSearchMinAmount(e.target.value)}
                  placeholder="최소"
                  className="h-8 text-xs"
                  data-testid="input-cf-search-min-amount"
                />
                <span className="text-muted-foreground text-xs">~</span>
                <Input
                  type="number"
                  value={searchMaxAmount}
                  onChange={e => setSearchMaxAmount(e.target.value)}
                  placeholder="최대"
                  className="h-8 text-xs"
                  data-testid="input-cf-search-max-amount"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">기간</Label>
              <div className="flex items-center gap-1">
                <Input
                  type="date"
                  value={searchDateFrom}
                  onChange={e => setSearchDateFrom(e.target.value)}
                  className="h-8 text-xs"
                  data-testid="input-cf-search-date-from"
                />
                <span className="text-muted-foreground text-xs">~</span>
                <Input
                  type="date"
                  value={searchDateTo}
                  onChange={e => setSearchDateTo(e.target.value)}
                  className="h-8 text-xs"
                  data-testid="input-cf-search-date-to"
                />
              </div>
            </div>
          </div>
          {isSearchActive && (
            <div className="flex items-center justify-between pt-1 border-t">
              <div className="text-xs text-muted-foreground">
                검색 조건이 적용됐습니다. 월 네비게이션이 비활성화됩니다.
              </div>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={resetSearch} data-testid="button-cf-search-clear">
                <X className="h-3 w-3 mr-1" />초기화
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="border-2 rounded-lg px-3 py-2 bg-green-50/50 dark:bg-green-900/10 border-green-200 dark:border-green-800">
          <div className="text-[10px] text-muted-foreground">
            {filterAccount === "all" && accounts.length > 1 ? "현재 잔액 (전계좌 합산)" : "현재 잔액"}
          </div>
          <div className="text-sm font-semibold text-green-700 dark:text-green-400" data-testid="text-cf-current-balance">
            {currentCashBalance != null ? currentCashBalance.toLocaleString() + "원" : "-"}
          </div>
        </div>
        <div className={`border-2 rounded-lg px-3 py-2 ${minBalancePoint && minBalancePoint.bal < 0 ? "bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-800" : minBalancePoint && minBalancePoint.bal < 10000000 ? "bg-amber-50 dark:bg-amber-900/15 border-amber-300 dark:border-amber-800" : "bg-muted/30 border-border"}`}>
          <div className="text-[10px] text-muted-foreground flex items-center gap-0.5">
            <TrendingDown className="h-2.5 w-2.5" />기간 최저 예상잔고
          </div>
          <div className={`text-sm font-semibold ${minBalancePoint && minBalancePoint.bal < 0 ? "text-red-600" : minBalancePoint && minBalancePoint.bal < 10000000 ? "text-amber-600" : ""}`} data-testid="text-cf-min-balance">
            {minBalancePoint ? minBalancePoint.bal.toLocaleString() + "원" : "-"}
          </div>
          {minBalancePoint && <div className="text-[9px] text-muted-foreground">{minBalancePoint.date}</div>}
        </div>
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

      {/* 예상 잔액 추이 차트 */}
      {!isSearchActive && balanceSeries.length >= 2 && (
        <div className="border rounded-lg p-3" data-testid="cf-balance-chart">
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <CalendarRange className="h-3.5 w-3.5" />예상 잔액 추이
            </div>
            {minBalancePoint && minBalancePoint.bal < 0 && (
              <div className="text-[10px] text-red-600 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />{minBalancePoint.date} 마이너스 예상
              </div>
            )}
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={balanceSeries} margin={{ top: 5, right: 8, left: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="balFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d: string) => (d || "").slice(5)} minTickGap={24} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 10 }} width={48} tickFormatter={(v: number) => `${Math.round(v / 10000)}만`} stroke="hsl(var(--muted-foreground))" />
              <RTooltip
                formatter={(v: number) => [v.toLocaleString() + "원", "예상잔액"]}
                contentStyle={{ fontSize: 11, borderRadius: 8 }}
              />
              <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeDasharray="3 3" />
              <Area type="monotone" dataKey="bal" stroke="hsl(var(--primary))" strokeWidth={1.5} fill="url(#balFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Floating bulk action toolbar */}
      {someSelected && (
        <div className="sticky top-2 z-20 flex items-center gap-3 bg-primary text-primary-foreground rounded-lg px-4 py-2.5 shadow-lg flex-wrap" data-testid="bulk-action-toolbar">
          <span className="text-sm font-medium">{selectedIds.size}건 선택됨</span>
          <div className="h-4 w-px bg-primary-foreground/30" />
          <CalendarDays className="h-4 w-4 opacity-70" />
          <Input
            type="date"
            value={bulkDate}
            onChange={e => setBulkDate(e.target.value)}
            className="h-7 w-36 text-xs bg-primary-foreground text-foreground border-0"
            data-testid="input-bulk-date"
          />
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-xs"
            disabled={!bulkDate || bulkDateMutation.isPending}
            onClick={() => {
              if (bulkDate) bulkDateMutation.mutate({ ids: Array.from(selectedIds), plannedDate: bulkDate });
            }}
            data-testid="button-bulk-date-apply"
          >
            {bulkDateMutation.isPending ? <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> : null}
            날짜 적용
          </Button>
          <div className="h-4 w-px bg-primary-foreground/30" />
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white border-0"
            disabled={bulkCompleteMutation.isPending}
            onClick={() => {
              if (confirm(`선택한 ${selectedIds.size}건을 완료 처리할까요?\n계산서가 연결된 항목은 계산서 작성일이 실제일로 설정됩니다.`)) {
                bulkCompleteMutation.mutate(Array.from(selectedIds));
              }
            }}
            data-testid="button-bulk-complete"
          >
            {bulkCompleteMutation.isPending
              ? <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
              : <CheckCircle2 className="h-3 w-3 mr-1" />}
            완료 처리
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-primary-foreground hover:bg-primary-foreground/20"
            onClick={() => { setSelectedIds(new Set()); setBulkDate(""); }}
            data-testid="button-bulk-cancel"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : visibleRows.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm border rounded-lg">
          <Search className="h-10 w-10 mx-auto mb-3 opacity-20" />
          {isSearchActive
            ? "검색 조건에 맞는 항목이 없습니다"
            : rangeMode === "6mo" ? "이 기간의 거래내역이 없습니다" : "이 월의 거래내역이 없습니다"
          }
          {isSearchActive ? (
            <div className="mt-2">
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={resetSearch} data-testid="button-cf-empty-reset">
                <X className="h-3 w-3 mr-1" />검색 초기화
              </Button>
            </div>
          ) : (
            <div className="mt-3 flex flex-col items-center gap-1">
              <p className="text-xs text-muted-foreground">자금계획을 추가하여 이 달의 수금·지출을 관리해보세요.</p>
              <Button size="sm" className="mt-1 h-8 text-xs" onClick={() => setShowAddDialog(true)} data-testid="button-cf-empty-add-payment">
                <Plus className="h-3.5 w-3.5 mr-1" />자금계획 추가
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden" data-testid="cashflow-table">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs">
              <tr>
                <th className="px-2 py-2 w-8">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleSelectAll}
                    aria-label="전체 선택"
                    data-testid="checkbox-select-all"
                  />
                </th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground w-24">날짜</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground w-6"></th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">내용</th>
                {showDetailColumns ? (
                  <>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground w-28">공급가</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground w-24">세액</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground w-28">합계</th>
                  </>
                ) : (
                  <>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground w-32">출금</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground w-32">입금</th>
                  </>
                )}
                <th className="text-right px-3 py-2 font-medium text-muted-foreground w-28">
                  잔액{filterAccount === "all" && accounts.length > 1 && <span className="text-[9px] ml-0.5">(합산)</span>}
                </th>
                <th className="text-center px-3 py-2 font-medium text-muted-foreground w-20">상태</th>
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {bankVisible.length > 0 && (
                <tr className="cursor-pointer bg-muted/40 hover:bg-muted/60 transition-colors" onClick={() => setShowActual(v => !v)} data-testid="cf-actual-expander">
                  <td colSpan={showDetailColumns ? 10 : 9} className="px-3 py-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {showActual ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      <span className="font-medium text-foreground">이전 실제 거래</span>
                      <span>{actualSummary.count}건</span>
                      <span className="ml-auto flex items-center gap-3">
                        <span className="text-blue-600">입금 +{actualSummary.credit.toLocaleString()}</span>
                        <span className="text-red-600">출금 -{actualSummary.debit.toLocaleString()}</span>
                      </span>
                    </div>
                  </td>
                </tr>
              )}
              {showActual && bankVisible.map((row) => {
                  const tx = row.tx;
                  const isMatched = tx.matchStatus === "manual" || tx.matchStatus === "auto";
                  const isIgnored = tx.matchStatus === "ignored";
                  const rowKey = `bank-${tx.id}`;
                  const isExpanded = expandedId === rowKey;
                  const linkedPay = bankLinkOf(tx);
                  const scat = scatOfBank(tx, linkedPay);
                  const isCredit = (tx.creditAmount || 0) > 0;
                  let mainText: string; let subText: string | null = null;
                  if (linkedPay) {
                    if (isCredit) { mainText = linkedPay.description || linkedPay.companyName || tx.counterparty || "-"; subText = linkedPay.projectCustomerName || null; }
                    else { mainText = linkedPay.companyName || tx.counterparty || "-"; subText = linkedPay.description || null; }
                  } else { mainText = tx.counterparty || tx.description || "-"; subText = (tx.counterparty && tx.description) ? tx.description : null; }
                  return (
                    <Fragment key={rowKey}>
                      <tr
                        className={`group hover:bg-muted/20 cursor-pointer transition-colors opacity-90 ${isMatched ? "border-l-2 border-l-slate-300 dark:border-l-slate-600" : ""}`}
                        onClick={() => setExpandedId(isExpanded ? null : rowKey)}
                        data-testid={`cf-bank-row-${tx.id}`}
                      >
                        <td className="px-2 py-2 w-8">
                          {/* bank rows not selectable */}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{tx.txDate}</td>
                        <td className="px-1 py-2 text-center">
                          <Landmark className="h-3 w-3 text-muted-foreground" />
                        </td>
                        <td className="px-3 py-2">
                          <div className="min-w-0 flex items-center gap-1.5 flex-wrap text-muted-foreground">
                            <span className="text-[10px] shrink-0">{SIMPLE_CAT_STYLE[scat].label}</span>
                            {linkedPay?.projectNumber && (
                              <span className="shrink-0 font-mono text-[10px]">{linkedPay.projectNumber}</span>
                            )}
                            {linkedPay?.purchaseOrderNumber && (
                              <span className="shrink-0 font-mono text-[10px]">{linkedPay.purchaseOrderNumber}</span>
                            )}
                            <span className="truncate text-xs">{mainText}</span>
                            {subText && <span className="text-[11px] truncate">· {subText}</span>}
                          </div>
                        </td>
                        {showDetailColumns ? (
                          <>
                            <td className="px-3 py-2 text-right tabular-nums text-xs text-muted-foreground">-</td>
                            <td className="px-3 py-2 text-right tabular-nums text-xs text-muted-foreground">-</td>
                            <td className="px-3 py-2 text-right tabular-nums text-xs">
                              {tx.debitAmount ? (
                                <span className="text-red-600 font-medium">{tx.debitAmount.toLocaleString()}</span>
                              ) : tx.creditAmount ? (
                                <span className="text-blue-600 font-medium">{tx.creditAmount.toLocaleString()}</span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2 text-right tabular-nums text-xs">
                              {tx.debitAmount ? <span className="text-red-600 font-medium">{tx.debitAmount.toLocaleString()}</span> : <span className="text-muted-foreground">-</span>}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-xs">
                              {tx.creditAmount ? <span className="text-blue-600 font-medium">{tx.creditAmount.toLocaleString()}</span> : <span className="text-muted-foreground">-</span>}
                            </td>
                          </>
                        )}
                        <td className="px-3 py-2 text-right tabular-nums text-xs text-muted-foreground">
                          {row.runningBalance != null ? row.runningBalance.toLocaleString() : "-"}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <div className="flex flex-col items-center gap-0.5">
                            <Badge variant="outline" className="text-slate-700 bg-slate-100 border-slate-300 dark:bg-slate-800 dark:text-slate-300 text-[10px]">
                              <Check className="h-2.5 w-2.5 mr-0.5" />실제
                            </Badge>
                            {isMatched ? (
                              <span className="text-[9px] text-green-600 flex items-center gap-0.5"><Link2 className="h-2 w-2" />연결</span>
                            ) : isIgnored ? (
                              <span className="text-[9px] text-muted-foreground">계획없음</span>
                            ) : (
                              <span className="text-[9px] text-orange-500">미연결</span>
                            )}
                          </div>
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
                          <td colSpan={showDetailColumns ? 10 : 9} className="px-4 py-2.5">
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
                })}
                {planVisible.map((row, idx) => {
                  const divider = idx === todayDividerIndex ? (
                    <tr ref={todayRowRef} className="bg-primary/10 border-y-2 border-primary/40" data-testid="cf-today-divider">
                      <td colSpan={showDetailColumns ? 10 : 9} className="px-3 py-1 text-[11px] font-semibold text-primary">
                        ── 오늘 ({todayStr}) ──
                      </td>
                    </tr>
                  ) : null;
                  const p = row.payment;
                  const rowKey = `payment-${p.id}`;
                  const today = new Date().toISOString().split("T")[0];
                  const isOverdue = p.status !== "completed" && p.plannedDate && p.plannedDate < today;
                  const date = p.actualDate || p.plannedDate || "";
                  const isSelectable = p.status !== "completed";
                  const isSelected = selectedIds.has(p.id);

                  // Supply/tax info from linked invoice
                  const hasInvoiceBreakdown = p.invoiceSupplyAmount != null && p.invoiceTaxAmount != null;
                  const pscat = scatOfPayment(p);
                  const pstyle = SIMPLE_CAT_STYLE[pscat];
                  const pIsIncome = p.type === "income";
                  let pMain: string; let pSub: string | null = null;
                  if (pIsIncome) { pMain = p.description || p.companyName || p.projectCustomerName || "내용 없음"; pSub = (p.projectCustomerName && p.projectCustomerName !== pMain) ? p.projectCustomerName : null; }
                  else { pMain = p.companyName || p.description || "내용 없음"; pSub = (p.description && p.description !== pMain) ? p.description : null; }

                  return (
                    <Fragment key={rowKey}>
                      {divider}
                      <tr
                      className={`group cursor-pointer transition-colors border-l-4 ${
                        isSelected ? "bg-primary/10 border-l-primary" :
                        isOverdue ? "bg-red-50/60 dark:bg-red-950/20 border-l-red-500" :
                        `${pstyle.bg} ${pstyle.bar}`
                      }`}
                      onClick={() => setSelectedPaymentId(p.id)}
                      data-testid={`cf-payment-row-${p.id}`}
                    >
                      <td
                        className="px-2 py-2 w-8"
                        onClick={e => { e.stopPropagation(); if (isSelectable) toggleSelect(p.id); }}
                      >
                        {isSelectable && (
                          <Checkbox
                            checked={isSelected}
                            aria-label="선택"
                            data-testid={`checkbox-payment-${p.id}`}
                          />
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground italic whitespace-nowrap">{date || "-"}</td>
                      <td className="px-1 py-2 text-center">
                        <ClipboardList className="h-3 w-3 text-muted-foreground/60" />
                      </td>
                      <td className="px-3 py-2">
                        <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                          {p.projectNumber && (
                            <span className="shrink-0 inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                              {p.projectNumber}
                            </span>
                          )}
                          {p.purchaseOrderNumber && (
                            <span className="shrink-0 inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-700">
                              {p.purchaseOrderNumber}
                            </span>
                          )}
                          <span className={`text-[10px] font-medium shrink-0 ${isOverdue ? "text-red-600" : pstyle.text}`}>{isOverdue ? "연체" : pstyle.label}</span>
                          <span className="text-xs truncate">{pMain}</span>
                          {pSub && <span className="text-[11px] text-muted-foreground truncate">· {pSub}</span>}
                          {p.invoiceNumber && <span className="text-[10px] text-muted-foreground/60 truncate">No.{p.invoiceNumber}</span>}
                        </div>
                      </td>
                      {showDetailColumns ? (
                        <>
                          <td className="px-3 py-2 text-right tabular-nums text-xs">
                            {hasInvoiceBreakdown ? (
                              <span className={p.type === "expense" ? "text-red-400 italic" : "text-blue-400 italic"}>
                                {p.invoiceSupplyAmount!.toLocaleString()}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-xs">
                            {hasInvoiceBreakdown ? (
                              <span className={p.type === "expense" ? "text-red-400 italic" : "text-blue-400 italic"}>
                                {p.invoiceTaxAmount!.toLocaleString()}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-xs">
                            {p.amount ? (
                              <span className={`font-medium italic ${p.type === "expense" ? "text-red-400" : "text-blue-400"}`}>
                                {p.amount.toLocaleString()}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2 text-right tabular-nums text-xs">
                            {p.type === "expense" && p.amount ? (
                              <div>
                                <div className="text-red-400 italic font-medium">{p.amount.toLocaleString()}</div>
                                {hasInvoiceBreakdown && (
                                  <div className="text-[10px] text-muted-foreground/70 space-x-1">
                                    <span>{p.invoiceSupplyAmount!.toLocaleString()}</span>
                                    <span>+{p.invoiceTaxAmount!.toLocaleString()}</span>
                                  </div>
                                )}
                              </div>
                            ) : <span className="text-muted-foreground">-</span>}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-xs">
                            {p.type === "income" && p.amount ? (
                              <div>
                                <div className="text-blue-400 italic font-medium">{p.amount.toLocaleString()}</div>
                                {hasInvoiceBreakdown && (
                                  <div className="text-[10px] text-muted-foreground/70 space-x-1">
                                    <span>{p.invoiceSupplyAmount!.toLocaleString()}</span>
                                    <span>+{p.invoiceTaxAmount!.toLocaleString()}</span>
                                  </div>
                                )}
                              </div>
                            ) : <span className="text-muted-foreground">-</span>}
                          </td>
                        </>
                      )}
                      <td className="px-3 py-2 text-right tabular-nums text-xs text-muted-foreground italic">
                        {row.estimatedBalance != null ? `~${row.estimatedBalance.toLocaleString()}` : "-"}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <PaymentStatusBadge payment={p} />
                      </td>
                      <td className="px-1">
                        {p.status === "completed" ? (
                          <div
                            className="flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={e => e.stopPropagation()}
                          >
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-[10px] px-1.5 text-muted-foreground hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
                              onClick={() => {
                                if (confirm("이 항목을 미완료 상태로 되돌릴까요?\n실제일과 실제금액이 초기화됩니다.")) {
                                  bulkUncompleteMutation.mutate([p.id]);
                                }
                              }}
                              disabled={bulkUncompleteMutation.isPending}
                              title="미완료로 되돌리기"
                              data-testid={`button-uncomplete-${p.id}`}
                            >
                              되돌리기
                            </Button>
                          </div>
                        ) : isOverdue ? (
                          <div className="flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                            <Button
                              variant="outline" size="sm"
                              className="h-6 text-[10px] px-2 text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-950/30"
                              onClick={() => setConfirmTarget(p)}
                              title="실제 출금에 연결하거나 완료 처리"
                              data-testid={`button-confirm-overdue-${p.id}`}
                            >
                              확인
                            </Button>
                          </div>
                        ) : p.plannedDate ? (
                          <div
                            className="flex flex-col items-center opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={e => e.stopPropagation()}
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-6 text-muted-foreground hover:text-primary"
                              onClick={() => shiftDateMutation.mutate({ id: p.id, delta: -1 })}
                              disabled={shiftDateMutation.isPending}
                              title="-1일"
                              data-testid={`button-date-up-${p.id}`}
                            >
                              <ArrowUp className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-6 text-muted-foreground hover:text-primary"
                              onClick={() => shiftDateMutation.mutate({ id: p.id, delta: 1 })}
                              disabled={shiftDateMutation.isPending}
                              title="+1일"
                              data-testid={`button-date-down-${p.id}`}
                            >
                              <ArrowDown className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                    </Fragment>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      {matchDialogTx && (
        <MatchDialog tx={matchDialogTx} onClose={() => setMatchDialogTx(null)} />
      )}

      {confirmTarget && (
        <ConfirmRecurringDialog payment={confirmTarget} onClose={() => setConfirmTarget(null)} />
      )}

      {selectedPaymentId && (
        <Dialog open onOpenChange={v => { if (!v) setSelectedPaymentId(null); }}>
          <PaymentDetailModal paymentId={selectedPaymentId} onClose={() => setSelectedPaymentId(null)} />
        </Dialog>
      )}

      {showAddDialog && (
        <AddPaymentDialog
          defaultYear={year}
          defaultMonth={month}
          onClose={() => setShowAddDialog(false)}
        />
      )}
    </div>
  );
}
