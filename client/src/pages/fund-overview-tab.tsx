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
  List, Calendar as CalendarIcon, Download, FileSpreadsheet, Loader2,
  Filter, ArrowUpDown, ArrowUp, ArrowDown,
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

function getPaymentStatus(p: Payment): "completed" | "overdue" | "planned" {
  if (p.status === "completed") return "completed";
  if (p.plannedDate && p.plannedDate < new Date().toISOString().split("T")[0]) return "overdue";
  return "planned";
}

function UnifiedPaymentTable({ payments }: { payments: EnrichedPayment[] }) {
  const [statusFilter, setStatusFilter] = useState<"all" | "planned" | "completed" | "overdue">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "income" | "expense">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortField, setSortField] = useState<"date" | "amount" | null>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const toggleSort = (field: "date" | "amount") => {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const filtered = useMemo(() => {
    let list = [...payments];

    if (statusFilter !== "all") {
      list = list.filter(p => getPaymentStatus(p) === statusFilter);
    }
    if (typeFilter !== "all") {
      list = list.filter(p => p.type === typeFilter);
    }
    if (dateFrom) {
      list = list.filter(p => {
        const d = p.status === "completed" ? (p.actualDate || p.plannedDate) : p.plannedDate;
        return d && d >= dateFrom;
      });
    }
    if (dateTo) {
      list = list.filter(p => {
        const d = p.status === "completed" ? (p.actualDate || p.plannedDate) : p.plannedDate;
        return d && d <= dateTo;
      });
    }

    if (sortField) {
      const dir = sortDir === "asc" ? 1 : -1;
      list.sort((a, b) => {
        if (sortField === "date") {
          const da = (a.status === "completed" ? (a.actualDate || a.plannedDate) : a.plannedDate) || "";
          const db = (b.status === "completed" ? (b.actualDate || b.plannedDate) : b.plannedDate) || "";
          return da.localeCompare(db) * dir;
        }
        if (sortField === "amount") {
          return ((a.amount || 0) - (b.amount || 0)) * dir;
        }
        return 0;
      });
    }

    return list;
  }, [payments, statusFilter, typeFilter, dateFrom, dateTo, sortField, sortDir]);

  const statusCounts = useMemo(() => {
    let planned = 0, completed = 0, overdue = 0;
    payments.forEach(p => {
      const s = getPaymentStatus(p);
      if (s === "planned") planned++;
      else if (s === "completed") completed++;
      else overdue++;
    });
    return { all: payments.length, planned, completed, overdue };
  }, [payments]);

  const hasActiveFilters = statusFilter !== "all" || typeFilter !== "all" || dateFrom || dateTo;

  const clearFilters = () => {
    setStatusFilter("all");
    setTypeFilter("all");
    setDateFrom("");
    setDateTo("");
  };

  const SortIcon = ({ field }: { field: "date" | "amount" }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <div className="flex items-center gap-0.5 border rounded-md p-0.5">
          {(["all", "planned", "overdue", "completed"] as const).map(s => (
            <Button
              key={s}
              variant={statusFilter === s ? "default" : "ghost"}
              size="sm"
              className="h-6 text-[11px] px-2"
              onClick={() => setStatusFilter(s)}
              data-testid={`filter-status-${s}`}
            >
              {s === "all" ? `전체 (${statusCounts.all})` :
               s === "planned" ? `예정 (${statusCounts.planned})` :
               s === "overdue" ? `연체 (${statusCounts.overdue})` :
               `완료 (${statusCounts.completed})`}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-0.5 border rounded-md p-0.5">
          {(["all", "income", "expense"] as const).map(t => (
            <Button
              key={t}
              variant={typeFilter === t ? "default" : "ghost"}
              size="sm"
              className="h-6 text-[11px] px-2"
              onClick={() => setTypeFilter(t)}
              data-testid={`filter-type-${t}`}
            >
              {t === "all" ? "전체" : t === "income" ? "입금" : "출금"}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Input
            type="date"
            className="h-6 text-[11px] w-[120px] px-1"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            data-testid="filter-date-from"
          />
          <span className="text-xs text-muted-foreground">~</span>
          <Input
            type="date"
            className="h-6 text-[11px] w-[120px] px-1"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            data-testid="filter-date-to"
          />
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" className="h-6 text-[11px] px-2 text-muted-foreground" onClick={clearFilters} data-testid="filter-clear">
            <X className="h-3 w-3 mr-1" />초기화
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground text-sm">
          {hasActiveFilters ? "필터 조건에 맞는 항목이 없습니다." : "등록된 항목이 없습니다."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/20">
                <th className="text-left py-1.5 px-2 font-medium text-xs w-16">상태</th>
                <th className="text-left py-1.5 px-2 font-medium text-xs w-14">구분</th>
                <th className="text-left py-1.5 px-2 font-medium text-xs w-20">분류</th>
                <th className="text-left py-1.5 px-2 font-medium text-xs cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("date")} data-testid="sort-date">
                  <span className="inline-flex items-center gap-1">일자 <SortIcon field="date" /></span>
                </th>
                <th className="text-left py-1.5 px-2 font-medium text-xs">거래처</th>
                <th className="text-left py-1.5 px-2 font-medium text-xs">설명</th>
                <th className="text-right py-1.5 px-2 font-medium text-xs cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("amount")} data-testid="sort-amount">
                  <span className="inline-flex items-center gap-1 justify-end">예정금액 <SortIcon field="amount" /></span>
                </th>
                <th className="text-right py-1.5 px-2 font-medium text-xs">실제금액</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const isCompleted = p.status === "completed";
                const rowClass = isCompleted
                  ? "border-b last:border-b-0 bg-muted/20 opacity-60"
                  : "border-b last:border-b-0 hover:bg-muted/20";
                return (
                  <tr key={p.id} className={rowClass} data-testid={`fund-row-${p.id}`}>
                    <td className="py-1.5 px-2">{getStatusBadge(p)}</td>
                    <td className="py-1.5 px-2">
                      <Badge variant="outline" className={`text-[10px] ${p.type === "income" ? "text-blue-600 border-blue-200 bg-blue-50/50" : "text-red-600 border-red-200 bg-red-50/50"}`}>
                        {p.type === "income" ? "입금" : "출금"}
                      </Badge>
                    </td>
                    <td className="py-1.5 px-2">
                      {p.type === "expense" ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                          {getCategoryIcon(p.category)}
                          {p.category || "매입"}
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">매출</span>
                      )}
                    </td>
                    <td className="py-1.5 px-2 text-xs">{isCompleted ? p.actualDate || p.plannedDate || "-" : p.plannedDate || "-"}</td>
                    <td className="py-1.5 px-2 text-xs font-medium truncate max-w-[140px]">{p.companyName || "-"}</td>
                    <td className="py-1.5 px-2 text-xs text-muted-foreground truncate max-w-[180px]">{p.description || "-"}</td>
                    <td className={`py-1.5 px-2 text-right text-xs font-medium ${p.type === "income" ? "text-blue-600" : "text-red-600"}`}>
                      {formatAmount(p.amount)}
                    </td>
                    <td className="py-1.5 px-2 text-right text-xs">
                      {p.actualAmount ? <span className="text-green-600">{formatAmount(p.actualAmount)}</span> : <span className="text-muted-foreground">-</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="text-right text-[10px] text-muted-foreground">
        {hasActiveFilters ? `${filtered.length}건 / 전체 ${payments.length}건` : `${payments.length}건`}
      </div>
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

const WEEKDAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

function getScheduleLabel(r: RecurringExpense) {
  const freq = (r as any).frequency || "monthly";
  const dayLabel = r.paymentDay === 0 ? "월말" : `${r.paymentDay}일`;
  if (freq === "weekly") {
    const wd = (r as any).weekday;
    return `매주 ${WEEKDAY_NAMES[wd != null && wd >= 0 && wd <= 6 ? wd : 1]}요일`;
  }
  if (freq === "yearly") {
    const pm = (r as any).paymentMonth;
    return `매년 ${pm >= 1 && pm <= 12 ? pm : 1}월 ${dayLabel}`;
  }
  return `매월 ${dayLabel}`;
}

function RecurringExpenseSection({ year, month }: { year: number; month: number }) {
  const { toast } = useToast();
  const { data: recurring, isLoading } = useQuery<RecurringExpense[]>({
    queryKey: ["/api/recurring-expenses"],
  });

  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [form, setForm] = useState({
    category: "정기결제",
    companyName: "",
    description: "",
    amount: "",
    frequency: "monthly",
    paymentDay: "25",
    weekday: "1",
    paymentMonth: "1",
    startDate: "",
    endDate: "",
    mode: "period" as "period" | "installment",
    totalInstallments: "",
    startInstallment: "1",
  });

  const computeEndDate = (startDate: string, totalInstallments: number, startInstallment: number) => {
    if (!startDate) return "";
    const [sy, sm] = startDate.split("-").map(Number);
    const remainingMonths = totalInstallments - startInstallment;
    const endMonth = sm + remainingMonths;
    const ey = sy + Math.floor((endMonth - 1) / 12);
    const em = ((endMonth - 1) % 12) + 1;
    return `${ey}-${String(em).padStart(2, "0")}`;
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const amt = parseInt(form.amount);
      if (!amt || amt <= 0) throw new Error("금액을 입력해주세요");
      const dayVal = form.paymentDay === "0" ? 0 : parseInt(form.paymentDay);
      if (form.frequency !== "weekly" && dayVal !== 0 && (!dayVal || dayVal < 1 || dayVal > 31)) throw new Error("결제일을 1~31 사이로 입력해주세요");
      if (form.mode === "installment") {
        const ti = parseInt(form.totalInstallments);
        if (!ti || ti < 1) throw new Error("총 횟수를 입력해주세요");
        if (!form.startDate) throw new Error("시작일을 입력해주세요");
        const si = parseInt(form.startInstallment) || 1;
        if (si > ti) throw new Error("시작 회차는 총 횟수보다 클 수 없습니다");
      }
      const payload: any = {
        category: form.category,
        companyName: form.companyName || null,
        description: form.description || null,
        amount: amt,
        frequency: form.frequency,
        paymentDay: form.frequency === "weekly" ? 1 : dayVal,
        isActive: "true",
        startDate: form.startDate || null,
        endDate: form.mode === "installment"
          ? computeEndDate(form.startDate, parseInt(form.totalInstallments) || 1, parseInt(form.startInstallment) || 1)
          : (form.endDate || null),
        totalInstallments: form.mode === "installment" ? (parseInt(form.totalInstallments) || null) : null,
        startInstallment: form.mode === "installment" ? (parseInt(form.startInstallment) || 1) : 1,
      };
      if (form.frequency === "weekly") {
        payload.weekday = parseInt(form.weekday) || 1;
      }
      if (form.frequency === "yearly") {
        payload.paymentMonth = parseInt(form.paymentMonth) || 1;
      }
      const res = await apiRequest("POST", "/api/recurring-expenses", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recurring-expenses"] });
      setForm({ category: "정기결제", companyName: "", description: "", amount: "", frequency: "monthly", paymentDay: "25", weekday: "1", paymentMonth: "1", startDate: "", endDate: "", mode: "period", totalInstallments: "", startInstallment: "1" });
      setShowAdd(false);
      toast({ title: "정기지출이 등록되었습니다" });
    },
    onError: (err: Error) => {
      toast({ title: "등록 실패", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/recurring-expenses/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recurring-expenses"] });
      setEditingId(null);
      toast({ title: "수정되었습니다" });
    },
    onError: (err: Error) => {
      toast({ title: "수정 실패", description: err.message, variant: "destructive" });
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

  const startEdit = (r: RecurringExpense) => {
    setEditingId(r.id);
    setEditForm({
      category: r.category,
      companyName: r.companyName || "",
      description: r.description || "",
      amount: String(r.amount),
      frequency: (r as any).frequency || "monthly",
      paymentDay: String(r.paymentDay),
      weekday: String((r as any).weekday ?? 1),
      paymentMonth: String((r as any).paymentMonth ?? 1),
      startDate: r.startDate || "",
      endDate: r.endDate || "",
      mode: (r as any).totalInstallments ? "installment" : "period",
      totalInstallments: (r as any).totalInstallments ? String((r as any).totalInstallments) : "",
      startInstallment: String((r as any).startInstallment ?? 1),
    });
  };

  const saveEdit = () => {
    if (!editingId) return;
    const amt = parseInt(editForm.amount);
    if (!amt || amt <= 0) { toast({ title: "금액을 입력해주세요", variant: "destructive" }); return; }
    if (editForm.mode === "installment") {
      const ti = parseInt(editForm.totalInstallments);
      if (!ti || ti < 1) { toast({ title: "총 횟수를 입력해주세요", variant: "destructive" }); return; }
      if (!editForm.startDate) { toast({ title: "시작일을 입력해주세요", variant: "destructive" }); return; }
      const si = parseInt(editForm.startInstallment) || 1;
      if (si > ti) { toast({ title: "시작 회차는 총 횟수보다 클 수 없습니다", variant: "destructive" }); return; }
    }
    const data: any = {
      category: editForm.category,
      companyName: editForm.companyName || null,
      description: editForm.description || null,
      amount: amt,
      frequency: editForm.frequency,
      startDate: editForm.startDate || null,
      endDate: editForm.mode === "installment"
        ? computeEndDate(editForm.startDate, parseInt(editForm.totalInstallments) || 1, parseInt(editForm.startInstallment) || 1)
        : (editForm.endDate || null),
      totalInstallments: editForm.mode === "installment" ? (parseInt(editForm.totalInstallments) || null) : null,
      startInstallment: editForm.mode === "installment" ? (parseInt(editForm.startInstallment) || 1) : 1,
    };
    if (editForm.frequency === "weekly") {
      data.weekday = parseInt(editForm.weekday) || 1;
      data.paymentDay = 1;
    } else {
      const dayVal = editForm.paymentDay === "0" ? 0 : parseInt(editForm.paymentDay);
      if (dayVal !== 0 && (!dayVal || dayVal < 1 || dayVal > 31)) { toast({ title: "결제일을 1~31 사이로 입력해주세요", variant: "destructive" }); return; }
      data.paymentDay = dayVal;
    }
    if (editForm.frequency === "yearly") {
      data.paymentMonth = parseInt(editForm.paymentMonth) || 1;
    }
    updateMutation.mutate({ id: editingId, data });
  };

  if (isLoading) return <Skeleton className="h-20" />;

  const freqLabel = (f: string) => f === "weekly" ? "주" : f === "yearly" ? "연" : "월";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">주간/월간/연간 반복되는 고정 지출을 등록하고, 해당 월에 일괄 생성할 수 있습니다.</div>
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
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
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
              <Label className="text-xs">금액</Label>
              <Input className="h-8 text-xs" type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} data-testid="input-recurring-amount" />
            </div>
            <div>
              <Label className="text-xs">주기</Label>
              <Select value={form.frequency} onValueChange={val => setForm(p => ({ ...p, frequency: val }))}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-recurring-frequency"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">매주</SelectItem>
                  <SelectItem value="monthly">매월</SelectItem>
                  <SelectItem value="yearly">매년</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              {form.frequency === "weekly" ? (
                <>
                  <Label className="text-xs">요일</Label>
                  <Select value={form.weekday} onValueChange={val => setForm(p => ({ ...p, weekday: val }))}>
                    <SelectTrigger className="h-8 text-xs" data-testid="select-recurring-weekday"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {WEEKDAY_NAMES.map((name, i) => (
                        <SelectItem key={i} value={String(i)}>{name}요일</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              ) : form.frequency === "yearly" ? (
                <div className="flex gap-1">
                  <div className="flex-1">
                    <Label className="text-xs">월</Label>
                    <Input className="h-8 text-xs" type="number" min="1" max="12" value={form.paymentMonth} onChange={e => setForm(p => ({ ...p, paymentMonth: e.target.value }))} data-testid="input-recurring-month" />
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs">일</Label>
                    <Select value={form.paymentDay} onValueChange={val => setForm(p => ({ ...p, paymentDay: val }))}>
                      <SelectTrigger className="h-8 text-xs" data-testid="select-recurring-day"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 31 }, (_, i) => (
                          <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}일</SelectItem>
                        ))}
                        <SelectItem value="0">월말</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : (
                <>
                  <Label className="text-xs">결제일</Label>
                  <Select value={form.paymentDay} onValueChange={val => setForm(p => ({ ...p, paymentDay: val }))}>
                    <SelectTrigger className="h-8 text-xs" data-testid="select-recurring-day"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 31 }, (_, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}일</SelectItem>
                      ))}
                      <SelectItem value="0">월말</SelectItem>
                    </SelectContent>
                  </Select>
                </>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label className="text-xs">방식</Label>
              <div className="flex items-center gap-0.5 border rounded-md p-0.5">
                <Button
                  variant={form.mode === "period" ? "default" : "ghost"}
                  size="sm"
                  className="h-6 text-[11px] px-2"
                  onClick={() => setForm(p => ({ ...p, mode: "period" }))}
                  data-testid="button-mode-period"
                >
                  기간 지정
                </Button>
                <Button
                  variant={form.mode === "installment" ? "default" : "ghost"}
                  size="sm"
                  className="h-6 text-[11px] px-2"
                  onClick={() => setForm(p => ({ ...p, mode: "installment" }))}
                  data-testid="button-mode-installment"
                >
                  횟수 지정
                </Button>
              </div>
            </div>
            {form.mode === "period" ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">시작기간</Label>
                  <Input className="h-8 text-xs" type="month" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} data-testid="input-recurring-start" />
                </div>
                <div>
                  <Label className="text-xs">완료기간</Label>
                  <Input className="h-8 text-xs" type="month" value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))} data-testid="input-recurring-end" />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <Label className="text-xs">시작기간 <span className="text-red-500">*</span></Label>
                  <Input className="h-8 text-xs" type="month" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} data-testid="input-recurring-start-installment" />
                </div>
                <div>
                  <Label className="text-xs">총 횟수 <span className="text-red-500">*</span></Label>
                  <Input className="h-8 text-xs" type="number" min="1" value={form.totalInstallments} onChange={e => setForm(p => ({ ...p, totalInstallments: e.target.value }))} placeholder="예: 12" data-testid="input-recurring-total-installments" />
                </div>
                <div>
                  <Label className="text-xs">시작 회차</Label>
                  <Input className="h-8 text-xs" type="number" min="1" value={form.startInstallment} onChange={e => setForm(p => ({ ...p, startInstallment: e.target.value }))} data-testid="input-recurring-start-installment-num" />
                </div>
                <div>
                  <Label className="text-xs">완료기간 (자동)</Label>
                  <Input
                    className="h-8 text-xs bg-muted/50"
                    type="month"
                    readOnly
                    value={form.startDate && form.totalInstallments ? computeEndDate(form.startDate, parseInt(form.totalInstallments) || 1, parseInt(form.startInstallment) || 1) : ""}
                    data-testid="input-recurring-end-auto"
                  />
                </div>
              </div>
            )}
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.amount} data-testid="button-save-recurring">
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
                <th className="text-right py-1.5 px-2 font-medium text-xs">금액</th>
                <th className="text-center py-1.5 px-2 font-medium text-xs w-28">주기/결제일</th>
                <th className="text-center py-1.5 px-2 font-medium text-xs w-28">기간</th>
                <th className="text-center py-1.5 px-2 font-medium text-xs w-20">관리</th>
              </tr>
            </thead>
            <tbody>
              {recurring.map(r => {
                const isEditing = editingId === r.id;
                if (isEditing) {
                  return (
                    <tr key={r.id} className="border-b bg-muted/10" data-testid={`recurring-row-edit-${r.id}`}>
                      <td className="py-1.5 px-2" colSpan={8}>
                        <div className="grid grid-cols-2 md:grid-cols-7 gap-2 items-end">
                          <div>
                            <Label className="text-[10px]">분류</Label>
                            <Select value={editForm.category} onValueChange={val => setEditForm((p: any) => ({ ...p, category: val }))}>
                              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {EXPENSE_CATEGORIES.map(c => (
                                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-[10px]">거래처</Label>
                            <Input className="h-7 text-xs" value={editForm.companyName} onChange={e => setEditForm((p: any) => ({ ...p, companyName: e.target.value }))} />
                          </div>
                          <div>
                            <Label className="text-[10px]">설명</Label>
                            <Input className="h-7 text-xs" value={editForm.description} onChange={e => setEditForm((p: any) => ({ ...p, description: e.target.value }))} />
                          </div>
                          <div>
                            <Label className="text-[10px]">금액</Label>
                            <Input className="h-7 text-xs" type="number" value={editForm.amount} onChange={e => setEditForm((p: any) => ({ ...p, amount: e.target.value }))} />
                          </div>
                          <div>
                            <Label className="text-[10px]">주기</Label>
                            <Select value={editForm.frequency} onValueChange={val => setEditForm((p: any) => ({ ...p, frequency: val }))}>
                              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="weekly">매주</SelectItem>
                                <SelectItem value="monthly">매월</SelectItem>
                                <SelectItem value="yearly">매년</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            {editForm.frequency === "weekly" ? (
                              <>
                                <Label className="text-[10px]">요일</Label>
                                <Select value={editForm.weekday} onValueChange={val => setEditForm((p: any) => ({ ...p, weekday: val }))}>
                                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {WEEKDAY_NAMES.map((name, i) => (
                                      <SelectItem key={i} value={String(i)}>{name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </>
                            ) : editForm.frequency === "yearly" ? (
                              <div className="flex gap-1">
                                <div className="flex-1">
                                  <Label className="text-[10px]">월</Label>
                                  <Input className="h-7 text-xs" type="number" min="1" max="12" value={editForm.paymentMonth} onChange={e => setEditForm((p: any) => ({ ...p, paymentMonth: e.target.value }))} />
                                </div>
                                <div className="flex-1">
                                  <Label className="text-[10px]">일</Label>
                                  <Select value={editForm.paymentDay} onValueChange={val => setEditForm((p: any) => ({ ...p, paymentDay: val }))}>
                                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      {Array.from({ length: 31 }, (_, i) => (
                                        <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}일</SelectItem>
                                      ))}
                                      <SelectItem value="0">월말</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            ) : (
                              <>
                                <Label className="text-[10px]">결제일</Label>
                                <Select value={editForm.paymentDay} onValueChange={val => setEditForm((p: any) => ({ ...p, paymentDay: val }))}>
                                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {Array.from({ length: 31 }, (_, i) => (
                                      <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}일</SelectItem>
                                    ))}
                                    <SelectItem value="0">월말</SelectItem>
                                  </SelectContent>
                                </Select>
                              </>
                            )}
                          </div>
                          <div className="col-span-2 md:col-span-7 space-y-2">
                            <div className="flex items-center gap-2">
                              <Label className="text-[10px]">방식</Label>
                              <div className="flex items-center gap-0.5 border rounded-md p-0.5">
                                <Button
                                  variant={editForm.mode === "period" ? "default" : "ghost"}
                                  size="sm"
                                  className="h-5 text-[10px] px-1.5"
                                  onClick={() => setEditForm((p: any) => ({ ...p, mode: "period" }))}
                                  data-testid="button-edit-mode-period"
                                >
                                  기간 지정
                                </Button>
                                <Button
                                  variant={editForm.mode === "installment" ? "default" : "ghost"}
                                  size="sm"
                                  className="h-5 text-[10px] px-1.5"
                                  onClick={() => setEditForm((p: any) => ({ ...p, mode: "installment" }))}
                                  data-testid="button-edit-mode-installment"
                                >
                                  횟수 지정
                                </Button>
                              </div>
                            </div>
                            {editForm.mode === "period" ? (
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
                                <div>
                                  <Label className="text-[10px]">시작기간</Label>
                                  <Input className="h-7 text-xs" type="month" value={editForm.startDate} onChange={e => setEditForm((p: any) => ({ ...p, startDate: e.target.value }))} />
                                </div>
                                <div>
                                  <Label className="text-[10px]">완료기간</Label>
                                  <Input className="h-7 text-xs" type="month" value={editForm.endDate} onChange={e => setEditForm((p: any) => ({ ...p, endDate: e.target.value }))} />
                                </div>
                              </div>
                            ) : (
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
                                <div>
                                  <Label className="text-[10px]">시작기간 <span className="text-red-500">*</span></Label>
                                  <Input className="h-7 text-xs" type="month" value={editForm.startDate} onChange={e => setEditForm((p: any) => ({ ...p, startDate: e.target.value }))} />
                                </div>
                                <div>
                                  <Label className="text-[10px]">총 횟수 <span className="text-red-500">*</span></Label>
                                  <Input className="h-7 text-xs" type="number" min="1" value={editForm.totalInstallments} onChange={e => setEditForm((p: any) => ({ ...p, totalInstallments: e.target.value }))} />
                                </div>
                                <div>
                                  <Label className="text-[10px]">시작 회차</Label>
                                  <Input className="h-7 text-xs" type="number" min="1" value={editForm.startInstallment} onChange={e => setEditForm((p: any) => ({ ...p, startInstallment: e.target.value }))} />
                                </div>
                                <div>
                                  <Label className="text-[10px]">완료기간 (자동)</Label>
                                  <Input
                                    className="h-7 text-xs bg-muted/50"
                                    type="month"
                                    readOnly
                                    value={editForm.startDate && editForm.totalInstallments ? computeEndDate(editForm.startDate, parseInt(editForm.totalInstallments) || 1, parseInt(editForm.startInstallment) || 1) : ""}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <Button size="sm" className="h-7 px-2 text-xs" onClick={saveEdit} disabled={updateMutation.isPending} data-testid="button-save-edit-recurring">
                              <Check className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditingId(null)} data-testid="button-cancel-edit-recurring">
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr
                    key={r.id}
                    className={`border-b last:border-b-0 hover:bg-muted/20 cursor-pointer ${r.isActive !== "true" ? "opacity-50" : ""}`}
                    onClick={() => startEdit(r)}
                    data-testid={`recurring-row-${r.id}`}
                  >
                    <td className="py-1.5 px-2" onClick={e => e.stopPropagation()}>
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
                    <td className="py-1.5 px-2 text-right text-xs font-medium text-red-600">
                      {formatAmount(r.amount)}
                      <span className="text-[9px] text-muted-foreground ml-0.5">/{freqLabel((r as any).frequency || "monthly")}</span>
                    </td>
                    <td className="py-1.5 px-2 text-center text-xs">{getScheduleLabel(r)}</td>
                    <td className="py-1.5 px-2 text-center text-[10px] text-muted-foreground">
                      {(r as any).totalInstallments ? (
                        <span>
                          {(r as any).totalInstallments}회
                          {(r as any).startInstallment > 1 && ` (${(r as any).startInstallment}회차부터)`}
                        </span>
                      ) : r.startDate || r.endDate ? (
                        <span>{r.startDate || "~"} ~ {r.endDate || ""}</span>
                      ) : "-"}
                    </td>
                    <td className="py-1.5 px-2 text-center" onClick={e => e.stopPropagation()}>
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
                );
              })}
            </tbody>
          </table>
          <div className="mt-2 px-2 text-xs text-muted-foreground">
            월 고정지출 합계: <span className="font-medium text-red-600">
              {formatAmount(recurring.filter(r => r.isActive === "true" && ((r as any).frequency || "monthly") === "monthly").reduce((sum, r) => sum + r.amount, 0))}
            </span>
            {recurring.some(r => r.isActive === "true" && (r as any).frequency === "weekly") && (
              <span className="ml-3">주간: <span className="font-medium text-red-600">
                {formatAmount(recurring.filter(r => r.isActive === "true" && (r as any).frequency === "weekly").reduce((sum, r) => sum + r.amount, 0))}/주
              </span></span>
            )}
            {recurring.some(r => r.isActive === "true" && (r as any).frequency === "yearly") && (
              <span className="ml-3">연간: <span className="font-medium text-red-600">
                {formatAmount(recurring.filter(r => r.isActive === "true" && (r as any).frequency === "yearly").reduce((sum, r) => sum + r.amount, 0))}/년
              </span></span>
            )}
          </div>
        </div>
      ) : (
        <div className="text-center py-6 text-muted-foreground text-sm">등록된 정기지출이 없습니다.</div>
      )}
    </div>
  );
}

function FundCalendarView({ payments, year, month }: { payments: EnrichedPayment[]; year: number; month: number }) {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const startDow = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const paymentsByDate = useMemo(() => {
    const map = new Map<number, EnrichedPayment[]>();
    payments.forEach(p => {
      const dateStr = p.actualDate || p.plannedDate;
      if (dateStr) {
        const d = parseInt(dateStr.substring(8, 10));
        if (!map.has(d)) map.set(d, []);
        map.get(d)!.push(p);
      }
    });
    return map;
  }, [payments]);

  const weeks: (number | null)[][] = [];
  let currentWeek: (number | null)[] = Array(startDow).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    currentWeek.push(d);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) currentWeek.push(null);
    weeks.push(currentWeek);
  }

  const dayNames = ["일", "월", "화", "수", "목", "금", "토"];

  return (
    <div className="border rounded-lg overflow-hidden" data-testid="fund-calendar-view">
      <div className="grid grid-cols-7 bg-muted/50">
        {dayNames.map(d => (
          <div key={d} className="text-center text-xs font-medium py-2 border-b">{d}</div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 border-b last:border-b-0">
          {week.map((day, di) => {
            const dayPayments = day ? paymentsByDate.get(day) || [] : [];
            const income = dayPayments.filter(p => p.type === "income").reduce((s, p) => s + (p.amount || 0), 0);
            const expense = dayPayments.filter(p => p.type === "expense").reduce((s, p) => s + (p.amount || 0), 0);
            return (
              <div key={di} className={`min-h-[80px] p-1 border-r last:border-r-0 ${day ? "bg-background" : "bg-muted/20"} ${di === 0 ? "text-red-500" : di === 6 ? "text-blue-500" : ""}`}>
                {day && (
                  <>
                    <div className="text-xs font-medium mb-1">{day}</div>
                    <div className="space-y-0.5">
                      {income > 0 && (
                        <div className="text-[10px] bg-blue-50 text-blue-700 rounded px-1 truncate" data-testid={`fund-cal-income-${day}`}>
                          +{income.toLocaleString()}
                        </div>
                      )}
                      {expense > 0 && (
                        <div className="text-[10px] bg-red-50 text-red-700 rounded px-1 truncate" data-testid={`fund-cal-expense-${day}`}>
                          -{expense.toLocaleString()}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function OneDriveImportSection({ year, month }: { year: number; month: number }) {
  const { toast } = useToast();
  const [selectedFileId, setSelectedFileId] = useState<string>("");
  const [selectedFileName, setSelectedFileName] = useState<string>("");

  const { data: files, isLoading: filesLoading } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/bank-statements", year],
    queryFn: async () => {
      const res = await fetch(`/api/bank-statements?year=${year}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFileId) throw new Error("파일을 선택해주세요");
      const res = await apiRequest("POST", "/api/bank-statements/import", {
        fileId: selectedFileId,
        fileName: selectedFileName,
        year,
        month,
      });
      return res.json();
    },
    onSuccess: (data: { created: number; total: number; skipped: number; fileName: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      const msg = data.skipped > 0
        ? `${data.fileName}에서 ${data.created}건 가져왔습니다 (${data.skipped}건 중복 건너뜀)`
        : `${data.fileName}에서 ${data.created}건 가져왔습니다`;
      toast({ title: msg });
      setSelectedFileId("");
      setSelectedFileName("");
    },
    onError: (err: Error) => {
      toast({ title: "가져오기 실패", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        OneDrive의 <span className="font-mono bg-muted px-1 rounded">4.경영지원/database/{year}/</span> 폴더에서 은행 거래내역 엑셀 파일을 가져옵니다.
      </div>
      {filesLoading ? (
        <Skeleton className="h-10" />
      ) : files && files.length > 0 ? (
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Label className="text-xs">엑셀 파일 선택</Label>
            <Select
              value={selectedFileId}
              onValueChange={(val) => {
                setSelectedFileId(val);
                const f = files.find(f => f.id === val);
                setSelectedFileName(f?.name || "");
              }}
            >
              <SelectTrigger className="h-8 text-xs" data-testid="select-bank-file">
                <SelectValue placeholder="파일을 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {files.map(f => (
                  <SelectItem key={f.id} value={f.id}>
                    <span className="inline-flex items-center gap-1">
                      <FileSpreadsheet className="h-3 w-3" />
                      {f.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            onClick={() => importMutation.mutate()}
            disabled={importMutation.isPending || !selectedFileId}
            data-testid="button-import-bank"
          >
            {importMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5 mr-1" />
            )}
            가져오기
          </Button>
        </div>
      ) : (
        <div className="text-center py-4 text-muted-foreground text-sm">
          해당 연도 폴더에 엑셀 파일이 없습니다.
        </div>
      )}
    </div>
  );
}

export function FundOverviewTab({ year, month }: { year: number; month: number }) {
  const [fundViewMode, setFundViewMode] = useState<"list" | "calendar">("list");

  const { data: payments, isLoading } = useQuery<EnrichedPayment[]>({
    queryKey: ["/api/payments", year, month],
    queryFn: async () => {
      const res = await fetch(`/api/payments?year=${year}&month=${month}`);
      return res.json();
    },
  });

  const totals = useMemo(() => {
    if (!payments) return { plannedIncome: 0, plannedExpense: 0, actualIncome: 0, actualExpense: 0 };
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
    return { plannedIncome, plannedExpense, actualIncome, actualExpense };
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

      <div className="flex justify-end">
        <div className="flex items-center gap-1 border rounded-lg p-0.5">
          <Button
            variant={fundViewMode === "list" ? "default" : "ghost"}
            size="sm"
            onClick={() => setFundViewMode("list")}
            data-testid="button-fund-view-list"
          >
            <List className="h-4 w-4 mr-1" />리스트
          </Button>
          <Button
            variant={fundViewMode === "calendar" ? "default" : "ghost"}
            size="sm"
            onClick={() => setFundViewMode("calendar")}
            data-testid="button-fund-view-calendar"
          >
            <CalendarIcon className="h-4 w-4 mr-1" />캘린더
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20" />)}</div>
      ) : fundViewMode === "calendar" ? (
        <FundCalendarView payments={payments || []} year={year} month={month} />
      ) : (
        <>
          <div className="border rounded-lg p-4">
            <UnifiedPaymentTable payments={payments || []} />
          </div>

          <CollapsibleSection title="경비 직접 입력" defaultOpen={false}>
            <AddExpenseForm year={year} month={month} onSuccess={() => {}} />
          </CollapsibleSection>

          <CollapsibleSection title="월 정기 예정금액" defaultOpen={false}>
            <RecurringExpenseSection year={year} month={month} />
          </CollapsibleSection>

          <CollapsibleSection title="OneDrive 은행거래 가져오기" defaultOpen={false}>
            <OneDriveImportSection year={year} month={month} />
          </CollapsibleSection>
        </>
      )}
    </div>
  );
}
