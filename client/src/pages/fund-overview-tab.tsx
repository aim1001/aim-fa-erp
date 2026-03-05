import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Payment, RecurringExpense } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Trash2, Check, Clock, AlertTriangle,
  ChevronDown, ChevronUp, RefreshCw, CreditCard, Building2, Receipt,
  Landmark, Home, Wallet, X, Power, PowerOff,
} from "lucide-react";

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

const EXPENSE_CATEGORIES = [
  { value: "카드사용", label: "카드사용", icon: CreditCard },
  { value: "정기결제", label: "정기결제", icon: RefreshCw },
  { value: "세금납부", label: "세금납부", icon: Receipt },
  { value: "관리비", label: "관리비", icon: Building2 },
  { value: "임대료", label: "임대료", icon: Home },
  { value: "대출상환", label: "대출상환", icon: Landmark },
  { value: "기타", label: "기타", icon: Wallet },
];

function formatAmount(amount: number | null | undefined) {
  if (!amount && amount !== 0) return "-";
  return amount.toLocaleString() + "원";
}

function getStatusBadge(payment: Payment) {
  if (payment.status === "completed") {
    return <Badge variant="outline" className="text-green-600 bg-green-50 border-green-200 text-[10px]"><Check className="h-2.5 w-2.5 mr-0.5" />완료</Badge>;
  }
  if (payment.plannedDate && payment.plannedDate < new Date().toISOString().split("T")[0]) {
    return <Badge variant="outline" className="text-red-600 bg-red-50 border-red-200 text-[10px]"><AlertTriangle className="h-2.5 w-2.5 mr-0.5" />연체</Badge>;
  }
  return <Badge variant="outline" className="text-blue-600 bg-blue-50 border-blue-200 text-[10px]"><Clock className="h-2.5 w-2.5 mr-0.5" />예정</Badge>;
}

function getCategoryIcon(category: string | null) {
  const found = EXPENSE_CATEGORIES.find(c => c.value === category);
  if (found) {
    const Icon = found.icon;
    return <Icon className="h-3 w-3" />;
  }
  return <Wallet className="h-3 w-3" />;
}

function CollapsibleSection({ title, count, defaultOpen = true, children, headerRight }: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
  headerRight?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border rounded-lg">
      <div
        className="flex items-center justify-between px-4 py-2 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setOpen(!open)}
        data-testid={`section-toggle-${title}`}
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          <span className="font-medium text-sm">{title}</span>
          {count !== undefined && <Badge variant="secondary" className="text-[10px]">{count}</Badge>}
        </div>
        {headerRight && <div onClick={e => e.stopPropagation()}>{headerRight}</div>}
      </div>
      {open && <div className="p-4">{children}</div>}
    </div>
  );
}

function PaymentTable({ payments, type }: { payments: EnrichedPayment[]; type: "income" | "expense" }) {
  if (payments.length === 0) {
    return <div className="text-center py-6 text-muted-foreground text-sm">등록된 항목이 없습니다.</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/20">
            <th className="text-left py-1.5 px-2 font-medium text-xs w-16">상태</th>
            {type === "expense" && <th className="text-left py-1.5 px-2 font-medium text-xs w-20">분류</th>}
            <th className="text-left py-1.5 px-2 font-medium text-xs">예정일</th>
            <th className="text-left py-1.5 px-2 font-medium text-xs">거래처</th>
            <th className="text-left py-1.5 px-2 font-medium text-xs">설명</th>
            <th className="text-right py-1.5 px-2 font-medium text-xs">예정금액</th>
            <th className="text-right py-1.5 px-2 font-medium text-xs">실제금액</th>
          </tr>
        </thead>
        <tbody>
          {payments.map(p => (
            <tr key={p.id} className="border-b last:border-b-0 hover:bg-muted/20" data-testid={`fund-row-${p.id}`}>
              <td className="py-1.5 px-2">{getStatusBadge(p)}</td>
              {type === "expense" && (
                <td className="py-1.5 px-2">
                  <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                    {getCategoryIcon(p.category)}
                    {p.category || "매입"}
                  </span>
                </td>
              )}
              <td className="py-1.5 px-2 text-xs">{p.status === "completed" ? p.actualDate || "-" : p.plannedDate || "-"}</td>
              <td className="py-1.5 px-2 text-xs font-medium truncate max-w-[140px]">{p.companyName || "-"}</td>
              <td className="py-1.5 px-2 text-xs text-muted-foreground truncate max-w-[180px]">{p.description || "-"}</td>
              <td className={`py-1.5 px-2 text-right text-xs font-medium ${type === "income" ? "text-blue-600" : "text-red-600"}`}>
                {formatAmount(p.amount)}
              </td>
              <td className="py-1.5 px-2 text-right text-xs">
                {p.actualAmount ? <span className="text-green-600">{formatAmount(p.actualAmount)}</span> : <span className="text-muted-foreground">-</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AddExpenseForm({ year, month, onSuccess }: { year: number; month: number; onSuccess: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    category: "카드사용",
    companyName: "",
    description: "",
    amount: "",
    plannedDate: `${year}-${String(month).padStart(2, "0")}-`,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const amt = parseInt(form.amount);
      if (!amt || amt <= 0) throw new Error("금액을 입력해주세요");
      const data = {
        type: "expense",
        category: form.category,
        companyName: form.companyName || null,
        description: form.description || null,
        amount: amt,
        plannedDate: form.plannedDate || null,
        status: "planned",
      };
      const res = await apiRequest("POST", "/api/payments", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      setForm({ category: "카드사용", companyName: "", description: "", amount: "", plannedDate: `${year}-${String(month).padStart(2, "0")}-` });
      onSuccess();
      toast({ title: "경비가 등록되었습니다" });
    },
    onError: (err: Error) => {
      toast({ title: "등록 실패", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div>
          <Label className="text-xs">분류</Label>
          <Select value={form.category} onValueChange={val => setForm(p => ({ ...p, category: val }))}>
            <SelectTrigger className="h-8 text-xs" data-testid="select-expense-category"><SelectValue /></SelectTrigger>
            <SelectContent>
              {EXPENSE_CATEGORIES.map(c => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">거래처</Label>
          <Input className="h-8 text-xs" value={form.companyName} onChange={e => setForm(p => ({ ...p, companyName: e.target.value }))} data-testid="input-expense-company" />
        </div>
        <div>
          <Label className="text-xs">설명</Label>
          <Input className="h-8 text-xs" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} data-testid="input-expense-desc" />
        </div>
        <div>
          <Label className="text-xs">금액</Label>
          <Input className="h-8 text-xs" type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} data-testid="input-expense-amount" />
        </div>
        <div>
          <Label className="text-xs">예정일</Label>
          <Input className="h-8 text-xs" type="date" value={form.plannedDate} onChange={e => setForm(p => ({ ...p, plannedDate: e.target.value }))} data-testid="input-expense-date" />
        </div>
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.amount} data-testid="button-add-expense">
          <Plus className="h-3.5 w-3.5 mr-1" />경비 등록
        </Button>
      </div>
    </div>
  );
}

function RecurringExpenseSection({ year, month }: { year: number; month: number }) {
  const { toast } = useToast();
  const { data: recurring, isLoading } = useQuery<RecurringExpense[]>({
    queryKey: ["/api/recurring-expenses"],
  });

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    category: "정기결제",
    companyName: "",
    description: "",
    amount: "",
    paymentDay: "25",
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const amt = parseInt(form.amount);
      const day = parseInt(form.paymentDay);
      if (!amt || amt <= 0) throw new Error("금액을 입력해주세요");
      if (!day || day < 1 || day > 31) throw new Error("결제일을 1~31 사이로 입력해주세요");
      const res = await apiRequest("POST", "/api/recurring-expenses", {
        category: form.category,
        companyName: form.companyName || null,
        description: form.description || null,
        amount: amt,
        paymentDay: day,
        isActive: "true",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recurring-expenses"] });
      setForm({ category: "정기결제", companyName: "", description: "", amount: "", paymentDay: "25" });
      setShowAdd(false);
      toast({ title: "정기지출이 등록되었습니다" });
    },
    onError: (err: Error) => {
      toast({ title: "등록 실패", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/recurring-expenses/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recurring-expenses"] });
      toast({ title: "삭제되었습니다" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: string }) => {
      const res = await apiRequest("PATCH", `/api/recurring-expenses/${id}`, { isActive });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recurring-expenses"] });
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/recurring-expenses/generate?year=${year}&month=${month}`, {});
      return res.json();
    },
    onSuccess: (data: { created: number; total: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      if (data.created > 0) {
        toast({ title: `${data.created}건의 정기지출이 생성되었습니다` });
      } else {
        toast({ title: "이미 모든 정기지출이 생성되어 있습니다" });
      }
    },
    onError: (err: Error) => {
      toast({ title: "생성 실패", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) return <Skeleton className="h-20" />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">매월 반복되는 고정 지출을 등록하고, 한 번에 해당 월에 생성할 수 있습니다.</div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowAdd(!showAdd)} data-testid="button-toggle-add-recurring">
            {showAdd ? <X className="h-3.5 w-3.5 mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
            {showAdd ? "취소" : "추가"}
          </Button>
          <Button
            size="sm"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending || !recurring?.length}
            data-testid="button-generate-recurring"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${generateMutation.isPending ? "animate-spin" : ""}`} />
            {year}년 {month}월 생성
          </Button>
        </div>
      </div>

      {showAdd && (
        <div className="border rounded-lg p-3 bg-muted/20 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <Label className="text-xs">분류</Label>
              <Select value={form.category} onValueChange={val => setForm(p => ({ ...p, category: val }))}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-recurring-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">거래처</Label>
              <Input className="h-8 text-xs" value={form.companyName} onChange={e => setForm(p => ({ ...p, companyName: e.target.value }))} data-testid="input-recurring-company" />
            </div>
            <div>
              <Label className="text-xs">설명</Label>
              <Input className="h-8 text-xs" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} data-testid="input-recurring-desc" />
            </div>
            <div>
              <Label className="text-xs">월 금액</Label>
              <Input className="h-8 text-xs" type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} data-testid="input-recurring-amount" />
            </div>
            <div>
              <Label className="text-xs">결제일 (매월)</Label>
              <Input className="h-8 text-xs" type="number" min="1" max="31" value={form.paymentDay} onChange={e => setForm(p => ({ ...p, paymentDay: e.target.value }))} data-testid="input-recurring-day" />
            </div>
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.amount || !form.paymentDay} data-testid="button-save-recurring">
              <Plus className="h-3.5 w-3.5 mr-1" />등록
            </Button>
          </div>
        </div>
      )}

      {recurring && recurring.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/20">
                <th className="text-left py-1.5 px-2 font-medium text-xs w-16">상태</th>
                <th className="text-left py-1.5 px-2 font-medium text-xs w-20">분류</th>
                <th className="text-left py-1.5 px-2 font-medium text-xs">거래처</th>
                <th className="text-left py-1.5 px-2 font-medium text-xs">설명</th>
                <th className="text-right py-1.5 px-2 font-medium text-xs">월 금액</th>
                <th className="text-center py-1.5 px-2 font-medium text-xs w-16">결제일</th>
                <th className="text-center py-1.5 px-2 font-medium text-xs w-16">관리</th>
              </tr>
            </thead>
            <tbody>
              {recurring.map(r => (
                <tr key={r.id} className={`border-b last:border-b-0 hover:bg-muted/20 ${r.isActive !== "true" ? "opacity-50" : ""}`} data-testid={`recurring-row-${r.id}`}>
                  <td className="py-1.5 px-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1.5"
                      onClick={() => toggleMutation.mutate({ id: r.id, isActive: r.isActive === "true" ? "false" : "true" })}
                      data-testid={`button-toggle-recurring-${r.id}`}
                    >
                      {r.isActive === "true" ? (
                        <Power className="h-3 w-3 text-green-600" />
                      ) : (
                        <PowerOff className="h-3 w-3 text-muted-foreground" />
                      )}
                    </Button>
                  </td>
                  <td className="py-1.5 px-2">
                    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                      {getCategoryIcon(r.category)}
                      {r.category}
                    </span>
                  </td>
                  <td className="py-1.5 px-2 text-xs font-medium">{r.companyName || "-"}</td>
                  <td className="py-1.5 px-2 text-xs text-muted-foreground">{r.description || "-"}</td>
                  <td className="py-1.5 px-2 text-right text-xs font-medium text-red-600">{formatAmount(r.amount)}</td>
                  <td className="py-1.5 px-2 text-center text-xs">매월 {r.paymentDay}일</td>
                  <td className="py-1.5 px-2 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1.5 text-red-500 hover:text-red-700"
                      onClick={() => deleteMutation.mutate(r.id)}
                      data-testid={`button-delete-recurring-${r.id}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 px-2 text-xs text-muted-foreground">
            월 고정지출 합계: <span className="font-medium text-red-600">
              {formatAmount(recurring.filter(r => r.isActive === "true").reduce((sum, r) => sum + r.amount, 0))}
            </span>
          </div>
        </div>
      ) : (
        <div className="text-center py-6 text-muted-foreground text-sm">등록된 정기지출이 없습니다.</div>
      )}
    </div>
  );
}

export function FundOverviewTab({ year, month }: { year: number; month: number }) {
  const { data: payments, isLoading } = useQuery<EnrichedPayment[]>({
    queryKey: ["/api/payments", year, month],
    queryFn: async () => {
      const res = await fetch(`/api/payments?year=${year}&month=${month}`);
      return res.json();
    },
  });

  const { incomePayments, expensePayments, totals } = useMemo(() => {
    if (!payments) return { incomePayments: [], expensePayments: [], totals: { plannedIncome: 0, plannedExpense: 0, actualIncome: 0, actualExpense: 0 } };
    const income = payments.filter(p => p.type === "income").sort((a, b) => (a.plannedDate || "").localeCompare(b.plannedDate || ""));
    const expense = payments.filter(p => p.type === "expense").sort((a, b) => (a.plannedDate || "").localeCompare(b.plannedDate || ""));
    let plannedIncome = 0, plannedExpense = 0, actualIncome = 0, actualExpense = 0;
    payments.forEach(p => {
      if (p.type === "income") {
        plannedIncome += p.amount || 0;
        actualIncome += p.actualAmount || 0;
      } else {
        plannedExpense += p.amount || 0;
        actualExpense += p.actualAmount || 0;
      }
    });
    return { incomePayments: income, expensePayments: expense, totals: { plannedIncome, plannedExpense, actualIncome, actualExpense } };
  }, [payments]);

  return (
    <div className="space-y-4" data-testid="fund-overview-tab">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="border rounded-lg p-3 bg-blue-50/50 dark:bg-blue-900/20">
          <div className="text-[10px] text-muted-foreground">예정 입금</div>
          <div className="text-base font-semibold text-blue-600" data-testid="text-fund-planned-income">{formatAmount(totals.plannedIncome)}</div>
        </div>
        <div className="border rounded-lg p-3 bg-red-50/50 dark:bg-red-900/20">
          <div className="text-[10px] text-muted-foreground">예정 출금</div>
          <div className="text-base font-semibold text-red-600" data-testid="text-fund-planned-expense">{formatAmount(totals.plannedExpense)}</div>
        </div>
        <div className="border rounded-lg p-3 bg-blue-50/50 dark:bg-blue-900/20">
          <div className="text-[10px] text-muted-foreground">실제 입금</div>
          <div className="text-base font-semibold text-blue-600" data-testid="text-fund-actual-income">{formatAmount(totals.actualIncome)}</div>
        </div>
        <div className="border rounded-lg p-3 bg-red-50/50 dark:bg-red-900/20">
          <div className="text-[10px] text-muted-foreground">실제 출금</div>
          <div className="text-base font-semibold text-red-600" data-testid="text-fund-actual-expense">{formatAmount(totals.actualExpense)}</div>
        </div>
        <div className="border rounded-lg p-3 bg-emerald-50/50 dark:bg-emerald-900/20">
          <div className="text-[10px] text-muted-foreground">예정 잔액</div>
          <div className={`text-base font-semibold ${(totals.plannedIncome - totals.plannedExpense) >= 0 ? "text-emerald-600" : "text-red-600"}`} data-testid="text-fund-balance">
            {formatAmount(totals.plannedIncome - totals.plannedExpense)}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20" />)}</div>
      ) : (
        <>
          <CollapsibleSection title="매출 (입금)" count={incomePayments.length}>
            <PaymentTable payments={incomePayments} type="income" />
          </CollapsibleSection>

          <CollapsibleSection title="매입 (출금)" count={expensePayments.length}>
            <PaymentTable payments={expensePayments} type="expense" />
          </CollapsibleSection>

          <CollapsibleSection title="경비 직접 입력" defaultOpen={false}>
            <AddExpenseForm year={year} month={month} onSuccess={() => {}} />
          </CollapsibleSection>

          <CollapsibleSection title="월 정기 예정금액" defaultOpen={false}>
            <RecurringExpenseSection year={year} month={month} />
          </CollapsibleSection>
        </>
      )}
    </div>
  );
}
