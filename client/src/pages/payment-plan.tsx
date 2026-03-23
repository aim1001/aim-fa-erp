import { useQuery, useMutation } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar as CalendarIcon, List, Plus, Check, Clock, AlertTriangle, ChevronLeft, ChevronRight, Trash2, X, Banknote, Split, Undo2, LayoutDashboard, ArrowUpDown, ArrowUp, ArrowDown, Filter, TrendingUp, Pencil, Lock } from "lucide-react";
import { useState, useMemo, useRef } from "react";
import { FundOverviewTab } from "./fund-overview-tab";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Payment, MonthlyBalance } from "@shared/schema";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ko } from "date-fns/locale";

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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

function parseDateString(dateStr: string): Date | undefined {
  if (!dateStr) return undefined;
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatAmount(amount: number | null | undefined) {
  if (!amount && amount !== 0) return "-";
  return amount.toLocaleString() + "원";
}

function getStatusInfo(payment: Payment) {
  if (payment.status === "completed") {
    return { label: "완료", icon: Check, className: "text-green-600 bg-green-50" };
  }
  if (payment.plannedDate && payment.plannedDate < new Date().toISOString().split("T")[0]) {
    return { label: "연체", icon: AlertTriangle, className: "text-red-600 bg-red-50" };
  }
  return { label: "예정", icon: Clock, className: "text-blue-600 bg-blue-50" };
}

function PaymentDetailModal({ paymentId, onClose }: { paymentId: string; onClose: () => void }) {
  const { toast } = useToast();
  const { data: payment } = useQuery<EnrichedPayment>({
    queryKey: ["/api/payments", paymentId],
    queryFn: async () => {
      const all = await (await fetch("/api/payments")).json();
      return all.find((p: EnrichedPayment) => p.id === paymentId);
    },
  });

  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const updateMutation = useMutation({
    mutationFn: async (patch: Record<string, any>) => {
      const res = await apiRequest("PATCH", `/api/payments/${paymentId}`, patch);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-invoices-with-payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices-with-payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    },
    onError: (err: Error) => {
      toast({ title: "저장 실패", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/payments/${paymentId}`);
    },
    onSuccess: () => {
      toast({ title: "삭제 완료" });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-invoices-with-payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices-with-payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      onClose();
    },
  });

  const handleSave = (field: string) => {
    if (!payment) return;
    const numFields = ["amount", "actualAmount"];
    const newVal = numFields.includes(field) ? (editValue ? parseInt(editValue) : null) : (editValue || null);
    updateMutation.mutate({ [field]: newVal });
    setEditing(null);
  };

  const markCompleted = () => {
    const today = new Date().toISOString().split("T")[0];
    updateMutation.mutate({ actualDate: today, actualAmount: payment?.amount || 0, status: "completed", plannedDate: null });
  };

  const undoCompleted = () => {
    updateMutation.mutate({ status: "planned", actualDate: null, actualAmount: null });
  };

  const renderField = (label: string, field: string, value: string, inputType = "text") => (
    <>
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      {editing === field ? (
        <Input
          autoFocus
          type={inputType}
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={() => handleSave(field)}
          onKeyDown={e => { if (e.key === "Enter") handleSave(field); if (e.key === "Escape") setEditing(null); }}
          className="h-7 text-sm"
          data-testid={`input-edit-payment-${field}`}
        />
      ) : (
        <span
          className="cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5 text-sm"
          onClick={() => { setEditing(field); setEditValue(value); }}
          data-testid={`text-editable-payment-${field}`}
        >
          {value || "-"}
        </span>
      )}
    </>
  );

  if (!payment) {
    return (
      <DialogContent className="max-w-lg">
        <div className="p-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-48 mt-4" /></div>
      </DialogContent>
    );
  }

  const statusInfo = getStatusInfo(payment);

  return (
    <DialogContent className="max-w-lg" data-testid="modal-payment-detail">
      <DialogHeader>
        <div className="flex items-center justify-between pr-8">
          <DialogTitle className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${statusInfo.className}`}>
              <statusInfo.icon className="h-3 w-3" />
              {statusInfo.label}
            </span>
            <span className={payment.type === "income" ? "text-blue-600" : "text-red-600"}>
              {payment.type === "income" ? "입금" : "출금"}
            </span>
          </DialogTitle>
          <Button variant="destructive" size="sm" onClick={() => { if (confirm("삭제하시겠습니까?")) deleteMutation.mutate(); }} data-testid="button-delete-payment">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </DialogHeader>
      {(payment.invoiceItem || payment.invoiceNumber || payment.invoiceTotalAmount) && (
        <div className="border rounded-md p-3 bg-muted/30 space-y-1.5" data-testid="section-invoice-info">
          {payment.invoiceItem && (
            <div className="text-sm font-medium truncate" data-testid="text-invoice-item">{payment.invoiceItem}</div>
          )}
          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
            {payment.invoiceNumber && <span>No. {payment.invoiceNumber}</span>}
            {payment.invoiceIssueDate && <span>발급일 {payment.invoiceIssueDate}</span>}
          </div>
          {payment.invoiceTotalAmount != null && (
            <div className="flex items-center gap-4 text-xs mt-1">
              <span>전체금액 <span className="font-medium text-foreground">{(payment.invoiceTotalAmount || 0).toLocaleString()}원</span></span>
              <span>지급완료 <span className="font-medium text-green-600 dark:text-green-400">{(payment.invoicePaidAmount || 0).toLocaleString()}원</span></span>
              <span>잔액 <span className={`font-medium ${payment.invoiceRemainingAmount > 0 ? "text-orange-600 dark:text-orange-400" : "text-green-600 dark:text-green-400"}`}>{(payment.invoiceRemainingAmount || 0).toLocaleString()}원</span></span>
            </div>
          )}
        </div>
      )}
      {payment.projectNumber && (
        <div className="text-xs text-muted-foreground">
          프로젝트: <span className="font-mono font-medium text-foreground">{payment.projectNumber}</span>
          {payment.projectCustomerName && <span className="ml-1">{payment.projectCustomerName}</span>}
        </div>
      )}
      <div className="grid grid-cols-[100px_1fr] gap-y-2 gap-x-2 text-sm items-center">
        {renderField("거래처", "companyName", payment.companyName || "")}
        {renderField("설명", "description", payment.description || "")}
        {renderField("예정금액", "amount", String(payment.amount || ""), "number")}
        {renderField("예정일", "plannedDate", payment.plannedDate || "", "date")}
        {payment.status === "completed" && (
          <>
            {renderField("실제금액", "actualAmount", String(payment.actualAmount || ""), "number")}
            {renderField("실제일", "actualDate", payment.actualDate || "", "date")}
          </>
        )}
        <span className="text-muted-foreground text-xs font-medium">결제방법</span>
        <span className="text-sm">
          {payment.paymentMethod === "end_of_next_month" ? "익월말" :
           payment.paymentMethod === "end_of_month" ? "월말" :
           payment.paymentMethod === "specific_date" ? "일자지정" : payment.paymentMethod || "-"}
        </span>
        {payment.splitTotal && payment.splitTotal > 1 && (
          <>
            <span className="text-muted-foreground text-xs font-medium">분할</span>
            <span className="text-sm">{payment.splitIndex}/{payment.splitTotal}회</span>
          </>
        )}
      </div>
      {payment.status !== "completed" ? (
        <Button size="sm" className="mt-2" onClick={markCompleted} data-testid="button-mark-completed">
          <Check className="h-4 w-4 mr-1" />결제 완료 처리
        </Button>
      ) : (
        <Button size="sm" variant="outline" className="mt-2 text-orange-600 border-orange-300" onClick={undoCompleted} data-testid="button-undo-completed">
          <Undo2 className="h-4 w-4 mr-1" />완료 취소
        </Button>
      )}
    </DialogContent>
  );
}

function AddPaymentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    type: "expense",
    companyName: "",
    description: "",
    amount: "",
    paymentMethod: "end_of_next_month",
    plannedDate: "",
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const data = {
        type: form.type,
        companyName: form.companyName || null,
        description: form.description || null,
        amount: form.amount ? parseInt(form.amount) : null,
        paymentMethod: form.paymentMethod,
        plannedDate: form.plannedDate || null,
        status: "planned",
      };
      const res = await apiRequest("POST", "/api/payments", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-invoices-with-payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices-with-payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      onOpenChange(false);
      setForm({ type: "expense", companyName: "", description: "", amount: "", paymentMethod: "end_of_next_month", plannedDate: "" });
      toast({ title: "결제 계획이 등록되었습니다" });
    },
    onError: (err: Error) => {
      toast({ title: "등록 실패", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>결제 계획 추가</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>유형</Label>
              <Select value={form.type} onValueChange={val => setForm(p => ({ ...p, type: val }))}>
                <SelectTrigger data-testid="select-payment-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="income">입금 (매출)</SelectItem>
                  <SelectItem value="expense">출금 (매입)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>결제방법</Label>
              <Select value={form.paymentMethod} onValueChange={val => setForm(p => ({ ...p, paymentMethod: val }))}>
                <SelectTrigger data-testid="select-payment-method"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="end_of_next_month">익월말</SelectItem>
                  <SelectItem value="end_of_month">월말</SelectItem>
                  <SelectItem value="specific_date">일자지정</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>거래처</Label><Input value={form.companyName} onChange={e => setForm(p => ({ ...p, companyName: e.target.value }))} data-testid="input-payment-company" /></div>
          <div><Label>설명</Label><Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} data-testid="input-payment-desc" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>금액</Label><Input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} data-testid="input-payment-amount" /></div>
            <div><Label>예정일</Label><Input type="date" value={form.plannedDate} onChange={e => setForm(p => ({ ...p, plannedDate: e.target.value }))} data-testid="input-payment-date" /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>취소</Button>
          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} data-testid="button-confirm-add-payment">등록</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CalendarDayPill({ items, type, total, onSelectPayment, day }: {
  items: EnrichedPayment[];
  type: "income" | "expense";
  total: number;
  onSelectPayment: (id: string) => void;
  day: number;
}) {
  const [open, setOpen] = useState(false);
  const isIncome = type === "income";
  const baseClass = isIncome
    ? "text-[10px] bg-blue-50 text-blue-700 rounded px-1 truncate cursor-pointer hover:bg-blue-100"
    : "text-[10px] bg-red-50 text-red-700 rounded px-1 truncate cursor-pointer hover:bg-red-100";
  const prefix = isIncome ? "+" : "-";

  if (items.length === 1) {
    return (
      <div
        className={baseClass}
        onClick={() => onSelectPayment(items[0].id)}
        data-testid={`cal-${type}-${day}`}
      >
        {prefix}{total.toLocaleString()}
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className={baseClass} data-testid={`cal-${type}-${day}`}>
          {prefix}{total.toLocaleString()} ({items.length}건)
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start" side="right">
        <div className="text-xs font-medium mb-2 text-muted-foreground">
          {day}일 {isIncome ? "입금" : "출금"} {items.length}건
        </div>
        <div className="space-y-1">
          {items.map(p => (
            <div
              key={p.id}
              className="text-xs rounded px-2 py-1.5 cursor-pointer hover:bg-muted flex items-center justify-between gap-2"
              onClick={() => { setOpen(false); onSelectPayment(p.id); }}
              data-testid={`cal-${type}-item-${p.id}`}
            >
              <span className="truncate text-muted-foreground">{p.projectCustomerName || p.companyName || "—"}</span>
              <span className={`font-medium shrink-0 ${isIncome ? "text-blue-700" : "text-red-700"}`}>
                {prefix}{(p.amount || 0).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CalendarView({ payments, year, month, onSelectPayment }: {
  payments: EnrichedPayment[];
  year: number;
  month: number;
  onSelectPayment: (id: string) => void;
}) {
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
    <div className="border rounded-lg overflow-hidden" data-testid="calendar-view">
      <div className="grid grid-cols-7 bg-muted/50">
        {dayNames.map(d => (
          <div key={d} className="text-center text-xs font-medium py-2 border-b">{d}</div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 border-b last:border-b-0">
          {week.map((day, di) => {
            const dayPayments = day ? paymentsByDate.get(day) || [] : [];
            const incomeItems = dayPayments.filter(p => p.type === "income");
            const expenseItems = dayPayments.filter(p => p.type === "expense");
            const incomeTotal = incomeItems.reduce((s, p) => s + (p.amount || 0), 0);
            const expenseTotal = expenseItems.reduce((s, p) => s + (p.amount || 0), 0);
            return (
              <div key={di} className={`min-h-[80px] p-1 border-r last:border-r-0 ${day ? "bg-background" : "bg-muted/20"} ${di === 0 ? "text-red-500" : di === 6 ? "text-blue-500" : ""}`}>
                {day && (
                  <>
                    <div className="text-xs font-medium mb-1">{day}</div>
                    <div className="space-y-0.5">
                      {incomeItems.length > 0 && (
                        <CalendarDayPill
                          items={incomeItems}
                          type="income"
                          total={incomeTotal}
                          onSelectPayment={onSelectPayment}
                          day={day}
                        />
                      )}
                      {expenseItems.length > 0 && (
                        <CalendarDayPill
                          items={expenseItems}
                          type="expense"
                          total={expenseTotal}
                          onSelectPayment={onSelectPayment}
                          day={day}
                        />
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

function TimelineView({
  payments,
  openingBalance,
  onSelectPayment,
  onSaveBalance,
  isSavingBalance,
}: {
  payments: EnrichedPayment[];
  openingBalance: number;
  onSelectPayment: (id: string) => void;
  onSaveBalance: (value: number) => void;
  isSavingBalance?: boolean;
}) {
  const { toast } = useToast();
  const [balanceMode, setBalanceMode] = useState<"actual" | "expected">("expected");
  const [editingBalance, setEditingBalance] = useState(false);
  const [balanceInput, setBalanceInput] = useState("");

  const today = new Date().toISOString().split("T")[0];
  const [quickType, setQuickType] = useState<"income" | "expense">("expense");
  const [quickCompany, setQuickCompany] = useState("");
  const [quickDescription, setQuickDescription] = useState("");
  const [quickAmount, setQuickAmount] = useState("");
  const [quickDate, setQuickDate] = useState(today);
  const quickCompanyRef = useRef<HTMLInputElement>(null);

  const resetQuick = () => {
    setQuickCompany("");
    setQuickDescription("");
    setQuickAmount("");
    setQuickDate(today);
  };

  const addMutation = useMutation({
    mutationFn: async (payload: { type: string; companyName: string | null; description: string | null; amount: number | null; plannedDate: string | null }) => {
      const res = await apiRequest("POST", "/api/payments", {
        ...payload,
        status: "planned",
        paymentMethod: "specific_date",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      resetQuick();
      setTimeout(() => quickCompanyRef.current?.focus(), 50);
      toast({ title: "추가되었습니다" });
    },
    onError: (err: Error) => {
      toast({ title: "추가 실패", description: err.message, variant: "destructive" });
    },
  });

  const submitQuick = () => {
    const amt = parseInt(quickAmount);
    if (!quickAmount || isNaN(amt) || amt <= 0 || addMutation.isPending) return;
    addMutation.mutate({
      type: quickType,
      companyName: quickCompany || null,
      description: quickDescription || null,
      amount: amt,
      plannedDate: quickDate || null,
    });
  };

  const handleQuickKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); submitQuick(); }
    if (e.key === "Escape") { resetQuick(); }
  };

  // Inline draft row state
  const [isAddingRow, setIsAddingRow] = useState(false);
  const [rowType, setRowType] = useState<"income" | "expense">("expense");
  const [rowCompany, setRowCompany] = useState("");
  const [rowDescription, setRowDescription] = useState("");
  const [rowAmount, setRowAmount] = useState("");
  const [rowDate, setRowDate] = useState(today);
  const rowCompanyRef = useRef<HTMLInputElement>(null);

  const resetRow = () => {
    setIsAddingRow(false);
    setRowCompany("");
    setRowDescription("");
    setRowAmount("");
    setRowDate(today);
    setRowType("expense");
  };

  const rowMutation = useMutation({
    mutationFn: async (payload: { type: string; companyName: string | null; description: string | null; amount: number | null; plannedDate: string | null }) => {
      const res = await apiRequest("POST", "/api/payments", {
        ...payload,
        status: "planned",
        paymentMethod: "specific_date",
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      resetRow();
      toast({ title: "추가되었습니다" });
    },
    onError: (err: Error) => {
      toast({ title: "추가 실패", description: err.message, variant: "destructive" });
    },
  });

  const submitRow = () => {
    const amt = parseInt(rowAmount);
    if (!rowAmount || isNaN(amt) || amt <= 0 || rowMutation.isPending) return;
    rowMutation.mutate({
      type: rowType,
      companyName: rowCompany || null,
      description: rowDescription || null,
      amount: amt,
      plannedDate: rowDate || null,
    });
  };

  const handleRowKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); submitRow(); }
    if (e.key === "Escape") { resetRow(); }
  };

  const openDraftRow = () => {
    setIsAddingRow(true);
    setTimeout(() => rowCompanyRef.current?.focus(), 30);
  };

  // Inline cell editing state
  type EditField = "date" | "company" | "description" | "amount";
  const [editingCell, setEditingCell] = useState<{ id: string; field: EditField } | null>(null);
  const [editValue, setEditValue] = useState("");

  const patchMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const res = await apiRequest("PATCH", `/api/payments/${id}`, patch);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "저장 실패" }));
        throw new Error(err.message || "저장 실패");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      setEditingCell(null);
    },
    onError: (err: Error) => {
      toast({ title: "저장 실패", description: err.message, variant: "destructive" });
      setEditingCell(null);
    },
  });

  const startEdit = (id: string, field: EditField, currentValue: string) => {
    setEditingCell({ id, field });
    setEditValue(currentValue);
  };

  const commitEdit = (payment: EnrichedPayment) => {
    if (!editingCell) return;
    const { id, field } = editingCell;
    const isCompleted = payment.status === "completed";
    let patch: Record<string, unknown> = {};
    if (field === "date") {
      patch = isCompleted ? { actualDate: editValue || null } : { plannedDate: editValue || null };
    } else if (field === "amount") {
      const val = parseInt(editValue);
      if (isNaN(val) || val <= 0) { setEditingCell(null); return; }
      patch = isCompleted ? { actualAmount: val, amount: val } : { amount: val };
    } else if (field === "company") {
      patch = { companyName: editValue || null };
    } else if (field === "description") {
      patch = { description: editValue || null };
    }
    const currentDate = isCompleted ? (payment.actualDate || payment.plannedDate || "") : (payment.plannedDate || "");
    const currentAmt = isCompleted ? (payment.actualAmount ?? payment.amount ?? 0) : (payment.amount ?? 0);
    const currentCompany = payment.companyName || "";
    const currentDesc = payment.description || "";
    const unchanged =
      (field === "date" && editValue === currentDate) ||
      (field === "amount" && editValue === String(currentAmt)) ||
      (field === "company" && editValue === currentCompany) ||
      (field === "description" && editValue === currentDesc);
    if (unchanged) { setEditingCell(null); return; }
    patchMutation.mutate({ id, patch });
  };

  const cancelEdit = () => setEditingCell(null);

  const PLANNED_FIELD_ORDER: EditField[] = ["date", "company", "description", "amount"];
  const COMPLETED_FIELD_ORDER: EditField[] = ["date", "amount"];

  const handleCellKey = (e: React.KeyboardEvent, payment: EnrichedPayment) => {
    if (e.key === "Enter") { e.preventDefault(); commitEdit(payment); }
    if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
    if (e.key === "Tab" && editingCell) {
      e.preventDefault();
      const direction = e.shiftKey ? -1 : 1;
      const currentField = editingCell.field;
      const isCompleted = payment.status === "completed";
      const order = isCompleted ? COMPLETED_FIELD_ORDER : PLANNED_FIELD_ORDER;
      const idx = order.indexOf(currentField);
      const nextField = order[idx + direction];
      commitEdit(payment);
      if (nextField) {
        const editDate = isCompleted ? (payment.actualDate || payment.plannedDate || "") : (payment.plannedDate || "");
        const editAmt = isCompleted ? String(payment.actualAmount ?? payment.amount ?? 0) : String(payment.amount ?? 0);
        const map: Record<EditField, string> = {
          date: editDate,
          company: payment.companyName || "",
          description: payment.description || "",
          amount: editAmt,
        };
        startEdit(payment.id, nextField, map[nextField]);
      }
    }
  };

  const commitBalance = () => {
    const val = parseInt(balanceInput);
    if (!isNaN(val)) onSaveBalance(val);
    setEditingBalance(false);
  };

  const rows = useMemo(() => {
    const sorted = [...payments].sort((a, b) => {
      const da = (a.status === "completed" ? (a.actualDate || a.plannedDate) : a.plannedDate) || "9999-99-99";
      const db = (b.status === "completed" ? (b.actualDate || b.plannedDate) : b.plannedDate) || "9999-99-99";
      return da.localeCompare(db);
    });

    let running = openingBalance;
    return sorted.map(p => {
      const isCompleted = p.status === "completed";
      const isOverdue = !isCompleted && p.plannedDate && p.plannedDate < new Date().toISOString().split("T")[0];
      const dateStr = isCompleted ? (p.actualDate || p.plannedDate) : p.plannedDate;
      const amt = isCompleted ? (p.actualAmount || p.amount || 0) : (p.amount || 0);

      const affectsBalance = balanceMode === "expected" || isCompleted;

      const prevRunning = running;
      if (affectsBalance) {
        if (p.type === "income") running += amt;
        else running -= amt;
      }

      return { payment: p, isCompleted, isOverdue, dateStr, amt, balance: running, prevBalance: prevRunning, affectsBalance };
    });
  }, [payments, openingBalance, balanceMode]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">기초잔액</span>
          {editingBalance ? (
            <div className="flex items-center gap-1">
              <Input
                type="number"
                className="h-7 w-36 text-sm font-semibold"
                value={balanceInput}
                autoFocus
                onChange={e => setBalanceInput(e.target.value)}
                onBlur={commitBalance}
                onKeyDown={e => {
                  if (e.key === "Enter") commitBalance();
                  if (e.key === "Escape") setEditingBalance(false);
                }}
                data-testid="input-opening-balance-inline"
              />
              {isSavingBalance && <span className="text-xs text-muted-foreground">저장중...</span>}
            </div>
          ) : (
            <button
              className="flex items-center gap-1 text-sm font-semibold text-foreground hover:text-primary transition-colors group"
              onClick={() => { setBalanceInput(String(openingBalance)); setEditingBalance(true); }}
              data-testid="button-edit-opening-balance"
            >
              <span>{openingBalance.toLocaleString()}원</span>
              <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1 border rounded-lg p-0.5">
          <Button
            variant={balanceMode === "expected" ? "default" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setBalanceMode("expected")}
            data-testid="button-balance-expected"
          >
            예상잔액
          </Button>
          <Button
            variant={balanceMode === "actual" ? "default" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setBalanceMode("actual")}
            data-testid="button-balance-actual"
          >
            실제잔액
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-1.5 p-2 bg-muted/20 border border-dashed rounded-lg" data-testid="quick-input-bar">
        <div className="flex items-center border rounded p-0.5 shrink-0">
          <button
            className={`text-[10px] font-medium px-2 py-0.5 rounded transition-colors ${quickType === "income" ? "bg-blue-600 text-white" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => setQuickType("income")}
            data-testid="quick-toggle-income"
          >입금</button>
          <button
            className={`text-[10px] font-medium px-2 py-0.5 rounded transition-colors ${quickType === "expense" ? "bg-red-600 text-white" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => setQuickType("expense")}
            data-testid="quick-toggle-expense"
          >출금</button>
        </div>
        <Input
          ref={quickCompanyRef}
          className="h-7 text-xs flex-1 min-w-[80px] max-w-[140px]"
          placeholder="거래처"
          value={quickCompany}
          onChange={e => setQuickCompany(e.target.value)}
          onKeyDown={handleQuickKey}
          data-testid="quick-input-company"
        />
        <Input
          className="h-7 text-xs flex-1 min-w-[80px] max-w-[140px]"
          placeholder="내용"
          value={quickDescription}
          onChange={e => setQuickDescription(e.target.value)}
          onKeyDown={handleQuickKey}
          data-testid="quick-input-description"
        />
        <Input
          type="number"
          className="h-7 text-xs w-28 shrink-0"
          placeholder="금액"
          value={quickAmount}
          onChange={e => setQuickAmount(e.target.value)}
          onKeyDown={handleQuickKey}
          data-testid="quick-input-amount"
        />
        <Input
          type="date"
          className="h-7 text-xs w-32 shrink-0"
          value={quickDate}
          onChange={e => setQuickDate(e.target.value)}
          onKeyDown={handleQuickKey}
          data-testid="quick-input-date"
        />
        <Button
          size="sm"
          className="h-7 text-xs px-3 shrink-0"
          onClick={submitQuick}
          disabled={!quickAmount || addMutation.isPending}
          data-testid="quick-input-submit"
        >
          {addMutation.isPending ? "추가중..." : "추가"}
        </Button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left py-1.5 px-2 font-medium text-xs w-20">날짜</th>
              <th className="text-left py-1.5 px-2 font-medium text-xs w-12">구분</th>
              <th className="text-left py-1.5 px-2 font-medium text-xs">거래처 / 내용</th>
              <th className="text-right py-1.5 px-2 font-medium text-xs text-blue-600 w-28">입금</th>
              <th className="text-right py-1.5 px-2 font-medium text-xs text-red-600 w-28">출금</th>
              <th className="text-right py-1.5 px-2 font-medium text-xs w-32">잔액</th>
              <th className="text-left py-1.5 px-2 font-medium text-xs w-16">상태</th>
            </tr>
          </thead>
          <tbody>
            {isAddingRow && (
              <tr className="border-b bg-blue-50/40 dark:bg-blue-950/20" data-testid="draft-row">
                <td className="py-1 px-1">
                  <input
                    type="date"
                    className="w-full h-6 text-xs border rounded px-1 bg-background"
                    value={rowDate}
                    onChange={e => setRowDate(e.target.value)}
                    onKeyDown={handleRowKey}
                    data-testid="draft-row-date"
                  />
                </td>
                <td className="py-1 px-1">
                  <div className="flex items-center border rounded overflow-hidden">
                    <button
                      className={`text-[9px] px-1 py-0.5 ${rowType === "income" ? "bg-blue-600 text-white" : "text-muted-foreground"}`}
                      onClick={() => setRowType("income")}
                      data-testid="draft-row-toggle-income"
                    >입</button>
                    <button
                      className={`text-[9px] px-1 py-0.5 ${rowType === "expense" ? "bg-red-600 text-white" : "text-muted-foreground"}`}
                      onClick={() => setRowType("expense")}
                      data-testid="draft-row-toggle-expense"
                    >출</button>
                  </div>
                </td>
                <td className="py-1 px-1">
                  <input
                    ref={rowCompanyRef}
                    type="text"
                    className="w-full h-6 text-xs border rounded px-1 bg-background mb-0.5"
                    placeholder="거래처"
                    value={rowCompany}
                    onChange={e => setRowCompany(e.target.value)}
                    onKeyDown={handleRowKey}
                    data-testid="draft-row-company"
                  />
                  <input
                    type="text"
                    className="w-full h-5 text-[10px] border rounded px-1 bg-background"
                    placeholder="내용"
                    value={rowDescription}
                    onChange={e => setRowDescription(e.target.value)}
                    onKeyDown={handleRowKey}
                    data-testid="draft-row-description"
                  />
                </td>
                <td className="py-1 px-1" colSpan={2}>
                  <input
                    type="number"
                    className="w-full h-6 text-xs border rounded px-1 bg-background text-right"
                    placeholder="금액"
                    value={rowAmount}
                    onChange={e => setRowAmount(e.target.value)}
                    onKeyDown={handleRowKey}
                    data-testid="draft-row-amount"
                  />
                </td>
                <td className="py-1 px-1" colSpan={2}>
                  <div className="flex items-center gap-1">
                    <button
                      className="text-[10px] px-2 py-0.5 bg-primary text-primary-foreground rounded disabled:opacity-50"
                      onClick={submitRow}
                      disabled={!rowAmount || rowMutation.isPending}
                      data-testid="draft-row-save"
                    >
                      {rowMutation.isPending ? "저장중" : "저장"}
                    </button>
                    <button
                      className="text-[10px] px-2 py-0.5 border rounded text-muted-foreground hover:text-foreground"
                      onClick={resetRow}
                      data-testid="draft-row-cancel"
                    >취소</button>
                  </div>
                </td>
              </tr>
            )}
            {rows.length === 0 && !isAddingRow && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-muted-foreground">
                  <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-xs">이 달에 등록된 자금 계획이 없습니다.</p>
                </td>
              </tr>
            )}
              {rows.map(({ payment: p, isCompleted, isOverdue, dateStr, amt, balance, prevBalance, affectsBalance }) => {
                const isIncome = p.type === "income";
                const rowBg = isCompleted ? "" : "bg-muted/10";
                const displayBalance = affectsBalance ? balance : prevBalance;
                const balanceNeg = displayBalance < 0;

                let statusLabel = "예정";
                let statusClass = "text-slate-500 bg-slate-50 dark:bg-slate-800/40";
                if (isCompleted) {
                  statusLabel = "완료";
                  statusClass = "text-green-700 bg-green-50 dark:bg-green-900/30";
                } else if (isOverdue) {
                  statusLabel = "연체";
                  statusClass = "text-orange-700 bg-orange-50 dark:bg-orange-900/30";
                }

                const displayDate = dateStr
                  ? `${parseInt(dateStr.substring(5, 7))}/${parseInt(dateStr.substring(8, 10))}`
                  : "-";
                const isToday = dateStr === today;

                const isLinked = !!(p.projectId || (p as any).invoiceId);
                const editingDate = editingCell?.id === p.id && editingCell.field === "date";
                const editingCompany = editingCell?.id === p.id && editingCell.field === "company";
                const editingDesc = editingCell?.id === p.id && editingCell.field === "description";
                const editingAmt = editingCell?.id === p.id && editingCell.field === "amount";
                const editDate = isCompleted ? (p.actualDate || p.plannedDate || "") : (p.plannedDate || "");
                const editAmt = isCompleted ? String(p.actualAmount ?? p.amount ?? 0) : String(p.amount ?? 0);
                const canEditCompany = !isCompleted && !isLinked;
                const canEditAmount = !isLinked;

                return (
                  <tr
                    key={p.id}
                    className={`border-b last:border-b-0 hover:bg-muted/30 cursor-pointer transition-colors ${rowBg} ${editingCell?.id === p.id ? "ring-1 ring-primary/20 bg-primary/5" : ""}`}
                    onClick={() => { if (!editingCell) onSelectPayment(p.id); }}
                    data-testid={`timeline-row-${p.id}`}
                  >
                    <td
                      className="py-1 px-2 cursor-text"
                      onClick={e => { e.stopPropagation(); startEdit(p.id, "date", editDate); }}
                      data-testid={`cell-date-${p.id}`}
                    >
                      {editingDate ? (
                        <input
                          type="date"
                          autoFocus
                          className="w-full h-6 text-xs border rounded px-1 bg-background"
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onBlur={() => commitEdit(p)}
                          onKeyDown={e => handleCellKey(e, p)}
                          data-testid={`input-date-${p.id}`}
                        />
                      ) : (
                        <span className={`text-xs font-mono group flex items-center gap-0.5 ${isToday ? "font-bold text-primary" : "text-muted-foreground"}`}>
                          {displayDate}
                          {isToday && <span className="text-[9px] text-primary">오늘</span>}
                          <Pencil className="h-2.5 w-2.5 opacity-0 group-hover:opacity-40 transition-opacity shrink-0" />
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 px-2" onClick={e => e.stopPropagation()}>
                      <span
                        className={`text-[10px] font-medium px-1.5 py-0.5 rounded cursor-pointer ${isIncome ? "text-blue-700 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-400" : "text-red-700 bg-red-50 dark:bg-red-900/30 dark:text-red-400"}`}
                        onClick={() => onSelectPayment(p.id)}
                      >
                        {isIncome ? "입금" : "출금"}
                      </span>
                    </td>
                    <td
                      className={`py-1 px-2 ${canEditCompany ? "cursor-text" : ""}`}
                      onClick={e => {
                        e.stopPropagation();
                        if (canEditCompany) startEdit(p.id, "company", p.companyName || "");
                        else onSelectPayment(p.id);
                      }}
                      data-testid={`cell-company-${p.id}`}
                    >
                      {editingCompany ? (
                        <div className="flex flex-col gap-0.5">
                          <input
                            type="text"
                            autoFocus
                            className="w-full h-6 text-xs border rounded px-1 bg-background"
                            placeholder="거래처"
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={() => commitEdit(p)}
                            onKeyDown={e => {
                              if (e.key === "Enter") { e.preventDefault(); setEditingCell({ id: p.id, field: "description" }); setEditValue(p.description || ""); }
                              else handleCellKey(e, p);
                            }}
                            data-testid={`input-company-${p.id}`}
                          />
                        </div>
                      ) : editingDesc ? (
                        <div className="flex flex-col gap-0.5">
                          <div className={`text-xs font-medium truncate max-w-[200px] ${isCompleted ? "text-foreground" : "text-muted-foreground"}`}>{p.companyName || "-"}</div>
                          <input
                            type="text"
                            autoFocus
                            className="w-full h-5 text-[10px] border rounded px-1 bg-background"
                            placeholder="내용"
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={() => commitEdit(p)}
                            onKeyDown={e => handleCellKey(e, p)}
                            data-testid={`input-description-${p.id}`}
                          />
                        </div>
                      ) : (
                        <div className="group">
                          <div className={`text-xs font-medium truncate max-w-[200px] flex items-center gap-0.5 ${isCompleted ? "text-foreground" : "text-muted-foreground"}`}>
                            {p.companyName || "-"}
                            {isLinked ? (
                              <Lock className="h-2.5 w-2.5 opacity-30 shrink-0" />
                            ) : !isCompleted ? (
                              <Pencil className="h-2.5 w-2.5 opacity-0 group-hover:opacity-40 transition-opacity shrink-0" />
                            ) : null}
                          </div>
                          {(p.description || canEditCompany) && (
                            <div
                              className={`text-[10px] text-muted-foreground truncate max-w-[200px] flex items-center gap-0.5 ${canEditCompany ? "cursor-text" : ""}`}
                              onClick={e => { if (canEditCompany) { e.stopPropagation(); startEdit(p.id, "description", p.description || ""); } }}
                              data-testid={`cell-description-${p.id}`}
                            >
                              {p.description || <span className="opacity-30 italic">내용</span>}
                              {canEditCompany && <Pencil className="h-2 w-2 opacity-0 group-hover:opacity-30 transition-opacity shrink-0" />}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td
                      className={`py-1 px-2 text-right ${canEditAmount && isIncome ? "cursor-text" : ""}`}
                      onClick={e => {
                        e.stopPropagation();
                        if (canEditAmount && isIncome) startEdit(p.id, "amount", editAmt);
                        else if (!isIncome) {} // no-op for expense row income cell
                        else onSelectPayment(p.id);
                      }}
                      data-testid={`cell-income-${p.id}`}
                    >
                      {isIncome ? (
                        editingAmt ? (
                          <input
                            type="number"
                            autoFocus
                            className="w-full h-6 text-xs border rounded px-1 bg-background text-right"
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={() => commitEdit(p)}
                            onKeyDown={e => handleCellKey(e, p)}
                            data-testid={`input-amount-${p.id}`}
                          />
                        ) : (
                          <span className={`text-xs font-bold text-blue-600 dark:text-blue-400 ${!isCompleted ? "opacity-60" : ""} group flex items-center justify-end gap-0.5`}>
                            {isLinked && <Lock className="h-2.5 w-2.5 opacity-30" />}
                            {amt.toLocaleString()}
                          </span>
                        )
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </td>
                    <td
                      className={`py-1 px-2 text-right ${canEditAmount && !isIncome ? "cursor-text" : ""}`}
                      onClick={e => {
                        e.stopPropagation();
                        if (canEditAmount && !isIncome) startEdit(p.id, "amount", editAmt);
                        else if (isIncome) {} // no-op
                        else onSelectPayment(p.id);
                      }}
                      data-testid={`cell-expense-${p.id}`}
                    >
                      {!isIncome ? (
                        editingAmt ? (
                          <input
                            type="number"
                            autoFocus
                            className="w-full h-6 text-xs border rounded px-1 bg-background text-right"
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={() => commitEdit(p)}
                            onKeyDown={e => handleCellKey(e, p)}
                            data-testid={`input-amount-${p.id}`}
                          />
                        ) : (
                          <span className={`text-xs font-bold text-red-600 dark:text-red-400 ${!isCompleted ? "opacity-60" : ""} flex items-center justify-end gap-0.5`}>
                            {isLinked && <Lock className="h-2.5 w-2.5 opacity-30" />}
                            {amt.toLocaleString()}
                          </span>
                        )
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="py-1.5 px-2 text-right" onClick={e => { e.stopPropagation(); onSelectPayment(p.id); }}>
                      <span className={`text-xs font-bold ${balanceNeg ? "text-red-600 dark:text-red-400" : affectsBalance ? "text-foreground" : "text-muted-foreground/50"}`}>
                        {balanceNeg ? "▼ " : ""}{displayBalance.toLocaleString()}
                      </span>
                    </td>
                    <td className="py-1.5 px-2" onClick={e => { e.stopPropagation(); onSelectPayment(p.id); }}>
                      <span className={`inline-flex text-[10px] font-medium px-1.5 py-0.5 rounded ${statusClass}`}>
                        {statusLabel}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {!isAddingRow && (
                <tr>
                  <td colSpan={7} className="py-1.5 px-2 border-t">
                    <button
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                      onClick={openDraftRow}
                      data-testid="button-add-row"
                    >
                      <Plus className="h-3 w-3" />
                      행 추가
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
    </div>
  );
}

export default function PaymentPlan() {
  const { toast } = useToast();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [viewMode, setViewMode] = useState<"list" | "calendar" | "fund" | "timeline">("timeline");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [fundPassword, setFundPassword] = useState("");
  const [passwordError, setPasswordError] = useState(false);
  const [fundAuthenticated, setFundAuthenticated] = useState(false);

  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "completed">("pending");
  const [typeFilter, setTypeFilter] = useState<"all" | "income" | "expense">("all");
  const [sortKey, setSortKey] = useState<"status" | "type" | "plannedDate" | "invoiceIssueDate" | "companyName">("plannedDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const { data: monthlyBalance } = useQuery<MonthlyBalance | null>({
    queryKey: ["/api/monthly-balances", year, month],
    queryFn: async () => {
      const res = await fetch(`/api/monthly-balances?year=${year}&month=${month}`);
      return res.json();
    },
  });

  const saveBalance = useMutation({
    mutationFn: async (openingBalance: number) => {
      const res = await apiRequest("POST", "/api/monthly-balances", { year, month, openingBalance });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/monthly-balances"] });
      toast({ title: "기초잔액이 저장되었습니다" });
    },
    onError: (err: Error) => {
      toast({ title: "저장 실패", description: err.message, variant: "destructive" });
    },
  });

  const openingBalance = monthlyBalance?.openingBalance ?? 0;

  const { data: payments, isLoading } = useQuery<EnrichedPayment[]>({
    queryKey: ["/api/payments", year, month],
    queryFn: async () => {
      const res = await fetch(`/api/payments?year=${year}&month=${month}`);
      return res.json();
    },
  });

  const inlineUpdate = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, any> }) => {
      const res = await apiRequest("PATCH", `/api/payments/${id}`, patch);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-invoices-with-payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices-with-payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    },
    onError: (err: Error) => {
      toast({ title: "저장 실패", description: err.message, variant: "destructive" });
    },
  });

  const createPayment = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("POST", "/api/payments", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-invoices-with-payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices-with-payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "잔액 결제 건이 생성되었습니다" });
    },
  });

  const handleInlineDateChange = (paymentId: string, date: Date | null) => {
    inlineUpdate.mutate({ id: paymentId, patch: { plannedDate: date ? formatDateStr(date) : null } });
  };

  const handleFullPayment = (p: EnrichedPayment) => {
    const today = formatDateStr(new Date());
    inlineUpdate.mutate({ id: p.id, patch: { actualAmount: p.amount || 0, actualDate: today, plannedDate: null, status: "completed" } });
  };

  const handleUndoPayment = (p: EnrichedPayment) => {
    inlineUpdate.mutate({ id: p.id, patch: { status: "planned", actualDate: null, actualAmount: null } });
  };

  const [partialAmount, setPartialAmount] = useState("");
  const [partialPaymentId, setPartialPaymentId] = useState<string | null>(null);
  const [remainderDate, setRemainderDate] = useState<Date | undefined>(undefined);
  const [showRemainderPicker, setShowRemainderPicker] = useState(false);
  const [remainderInfo, setRemainderInfo] = useState<{ payment: EnrichedPayment; paidAmount: number } | null>(null);

  const handlePartialPayment = (p: EnrichedPayment, amountStr: string) => {
    const paid = parseInt(amountStr);
    if (!paid || paid <= 0) return;
    const today = formatDateStr(new Date());
    const remaining = (p.amount || 0) - paid;
    inlineUpdate.mutate({ id: p.id, patch: { actualAmount: paid, actualDate: today, plannedDate: null, status: "completed", amount: paid } });
    if (remaining > 0) {
      setRemainderInfo({ payment: p, paidAmount: paid });
      setShowRemainderPicker(true);
    }
    setPartialPaymentId(null);
    setPartialAmount("");
  };

  const handleCreateRemainder = (date: Date) => {
    if (!remainderInfo) return;
    const { payment: p, paidAmount } = remainderInfo;
    const remaining = (p.amount || 0) - paidAmount;
    createPayment.mutate({
      type: p.type,
      companyName: p.companyName,
      description: p.description ? `${p.description} (잔액)` : "잔액",
      amount: remaining,
      plannedDate: formatDateStr(date),
      paymentMethod: p.paymentMethod,
      status: "planned",
      salesInvoiceId: p.salesInvoiceId,
      purchaseInvoiceId: p.purchaseInvoiceId,
    });
    setShowRemainderPicker(false);
    setRemainderInfo(null);
    setRemainderDate(undefined);
  };

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };

  const sorted = useMemo(() => {
    if (!payments) return [];
    let filtered = [...payments];

    if (statusFilter === "pending") {
      filtered = filtered.filter(p => p.status !== "completed");
    } else if (statusFilter === "completed") {
      filtered = filtered.filter(p => p.status === "completed");
    }

    if (typeFilter !== "all") {
      filtered = filtered.filter(p => p.type === typeFilter);
    }

    filtered.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "status": {
          const statusOrder = (p: Payment) => p.status === "completed" ? 2 : (p.plannedDate && p.plannedDate < new Date().toISOString().split("T")[0] ? 0 : 1);
          cmp = statusOrder(a) - statusOrder(b);
          break;
        }
        case "type":
          cmp = (a.type || "").localeCompare(b.type || "");
          break;
        case "plannedDate":
          cmp = (a.plannedDate || "9999").localeCompare(b.plannedDate || "9999");
          break;
        case "invoiceIssueDate":
          cmp = ((a as EnrichedPayment).invoiceIssueDate || "9999").localeCompare((b as EnrichedPayment).invoiceIssueDate || "9999");
          break;
        case "companyName":
          cmp = (a.companyName || "").localeCompare(b.companyName || "");
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return filtered;
  }, [payments, statusFilter, typeFilter, sortKey, sortDir]);

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
    <div className="p-6 space-y-4 overflow-auto h-full">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-semibold" data-testid="text-payment-plan-title">자금계획</h1>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setShowAdd(true)} data-testid="button-add-payment">
            <Plus className="h-4 w-4 mr-1" />추가
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={prevMonth} data-testid="button-prev-month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-lg font-semibold min-w-[120px] text-center" data-testid="text-current-month">
            {year}년 {month}월
          </span>
          <Button variant="ghost" size="icon" onClick={nextMonth} data-testid="button-next-month">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-1 border rounded-lg p-0.5">
          {viewMode !== "fund" && (
            <>
              <Button
                variant={viewMode === "timeline" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("timeline")}
                data-testid="button-view-timeline"
              >
                <TrendingUp className="h-4 w-4 mr-1" />타임라인
              </Button>
              <Button
                variant={viewMode === "list" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("list")}
                data-testid="button-view-list"
              >
                <List className="h-4 w-4 mr-1" />리스트
              </Button>
              <Button
                variant={viewMode === "calendar" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("calendar")}
                data-testid="button-view-calendar"
              >
                <CalendarIcon className="h-4 w-4 mr-1" />캘린더
              </Button>
            </>
          )}
          <Button
            variant={viewMode === "fund" ? "default" : "ghost"}
            size="sm"
            onClick={() => {
              if (viewMode === "fund") { setViewMode("timeline"); }
              else if (fundAuthenticated) { setViewMode("fund"); }
              else { setShowPasswordDialog(true); setFundPassword(""); setPasswordError(false); }
            }}
            data-testid="button-view-fund"
          >
            <LayoutDashboard className="h-4 w-4 mr-1" />{viewMode === "fund" ? "자금계획으로" : "자금현황"}
          </Button>
        </div>
      </div>

      {viewMode !== "fund" && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="border rounded-lg p-3 bg-blue-50/50">
            <div className="text-xs text-muted-foreground">예정 입금</div>
            <div className="text-lg font-semibold text-blue-600" data-testid="text-planned-income">{formatAmount(totals.plannedIncome)}</div>
          </div>
          <div className="border rounded-lg p-3 bg-red-50/50">
            <div className="text-xs text-muted-foreground">예정 출금</div>
            <div className="text-lg font-semibold text-red-600" data-testid="text-planned-expense">{formatAmount(totals.plannedExpense)}</div>
          </div>
          <div className="border rounded-lg p-3 bg-blue-50/50">
            <div className="text-xs text-muted-foreground">실제 입금</div>
            <div className="text-lg font-semibold text-blue-600" data-testid="text-actual-income">{formatAmount(totals.actualIncome)}</div>
          </div>
          <div className="border rounded-lg p-3 bg-red-50/50">
            <div className="text-xs text-muted-foreground">실제 출금</div>
            <div className="text-lg font-semibold text-red-600" data-testid="text-actual-expense">{formatAmount(totals.actualExpense)}</div>
          </div>
        </div>
      )}

      {viewMode === "list" && (
        <div className="flex items-center gap-2 flex-wrap" data-testid="section-payment-filters">
          <div className="flex items-center gap-1 border rounded-lg p-0.5">
            <Button
              variant={statusFilter === "pending" ? "default" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setStatusFilter("pending")}
              data-testid="filter-status-pending"
            >
              <Clock className="h-3 w-3 mr-1" />예정
            </Button>
            <Button
              variant={statusFilter === "completed" ? "default" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setStatusFilter("completed")}
              data-testid="filter-status-completed"
            >
              <Check className="h-3 w-3 mr-1" />완료
            </Button>
            <Button
              variant={statusFilter === "all" ? "default" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setStatusFilter("all")}
              data-testid="filter-status-all"
            >
              전체
            </Button>
          </div>
          <div className="flex items-center gap-1 border rounded-lg p-0.5">
            <Button
              variant={typeFilter === "all" ? "default" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setTypeFilter("all")}
              data-testid="filter-type-all"
            >
              전체
            </Button>
            <Button
              variant={typeFilter === "income" ? "default" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setTypeFilter("income")}
              data-testid="filter-type-income"
            >
              입금
            </Button>
            <Button
              variant={typeFilter === "expense" ? "default" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setTypeFilter("expense")}
              data-testid="filter-type-expense"
            >
              출금
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12" />)}</div>
      ) : viewMode === "timeline" ? (
        <TimelineView
          payments={payments || []}
          openingBalance={openingBalance}
          onSelectPayment={setSelectedId}
          onSaveBalance={v => saveBalance.mutate(v)}
          isSavingBalance={saveBalance.isPending}
        />
      ) : viewMode === "list" ? (
        sorted.length > 0 ? (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left py-1.5 px-2 font-medium text-xs w-20 cursor-pointer select-none hover:bg-muted/80" onClick={() => toggleSort("status")} data-testid="sort-status">
                    <span className="inline-flex items-center gap-0.5">상태{sortKey === "status" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />}</span>
                  </th>
                  <th className="text-left py-1.5 px-2 font-medium text-xs w-12 cursor-pointer select-none hover:bg-muted/80" onClick={() => toggleSort("type")} data-testid="sort-type">
                    <span className="inline-flex items-center gap-0.5">구분{sortKey === "type" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />}</span>
                  </th>
                  <th className="text-left py-1.5 px-2 font-medium text-xs cursor-pointer select-none hover:bg-muted/80" onClick={() => toggleSort("plannedDate")} data-testid="sort-planned-date">
                    <span className="inline-flex items-center gap-0.5">예정일{sortKey === "plannedDate" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />}</span>
                  </th>
                  <th className="text-left py-1.5 px-2 font-medium text-xs hidden md:table-cell cursor-pointer select-none hover:bg-muted/80" onClick={() => toggleSort("invoiceIssueDate")} data-testid="sort-invoice-date">
                    <span className="inline-flex items-center gap-0.5">계산서일{sortKey === "invoiceIssueDate" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />}</span>
                  </th>
                  <th className="text-left py-1.5 px-2 font-medium text-xs hidden lg:table-cell">프로젝트</th>
                  <th className="text-left py-1.5 px-2 font-medium text-xs cursor-pointer select-none hover:bg-muted/80" onClick={() => toggleSort("companyName")} data-testid="sort-company">
                    <span className="inline-flex items-center gap-0.5">거래처{sortKey === "companyName" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />}</span>
                  </th>
                  <th className="text-right py-1.5 px-2 font-medium text-xs">예정금액</th>
                  <th className="text-right py-1.5 px-2 font-medium text-xs hidden md:table-cell">실제금액</th>
                  <th className="text-center py-1.5 px-2 font-medium text-xs hidden lg:table-cell w-14">분할</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(p => {
                  const statusInfo = getStatusInfo(p);
                  const isCompleted = p.status === "completed";
                  return (
                    <tr
                      key={p.id}
                      className={`border-b last:border-b-0 hover:bg-muted/30 cursor-pointer transition-colors ${isCompleted ? "opacity-50" : ""}`}
                      onClick={() => setSelectedId(p.id)}
                      data-testid={`row-payment-${p.id}`}
                    >
                      <td className="py-1.5 px-2">
                        <span className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${statusInfo.className}`}>
                          <statusInfo.icon className="h-2.5 w-2.5" />
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="py-1.5 px-2">
                        <span className={`text-[10px] font-medium px-1 py-0.5 rounded ${p.type === "income" ? "text-blue-700 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-400" : "text-red-700 bg-red-50 dark:bg-red-900/30 dark:text-red-400"}`}>
                          {p.type === "income" ? "입금" : "출금"}
                        </span>
                      </td>
                      <td className="py-1.5 px-2" onClick={e => e.stopPropagation()}>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs h-6 px-1.5 font-normal border-dashed border justify-start"
                              data-testid={`button-date-${p.id}`}
                            >
                              <CalendarIcon className="mr-1 h-3 w-3 text-muted-foreground" />
                              {isCompleted ? (p.actualDate || "완료") : (p.plannedDate || "날짜 선택")}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={(p.actualDate || p.plannedDate) ? parseDateString(p.actualDate || p.plannedDate!) : undefined}
                              onSelect={(date) => {
                                if (date) handleInlineDateChange(p.id, date);
                              }}
                              locale={ko}
                            />
                            {(p.plannedDate || p.actualDate) && (
                              <div className="p-2 border-t">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="w-full text-xs"
                                  onClick={() => handleInlineDateChange(p.id, null)}
                                  data-testid={`button-clear-date-${p.id}`}
                                >
                                  <X className="mr-1 h-3 w-3" />날짜 지우기
                                </Button>
                              </div>
                            )}
                          </PopoverContent>
                        </Popover>
                      </td>
                      <td className="py-1.5 px-2 text-xs text-muted-foreground hidden md:table-cell">{p.invoiceIssueDate || "-"}</td>
                      <td className="py-1.5 px-2 hidden lg:table-cell">
                        {p.projectNumber ? (
                          <div>
                            <div className="text-xs font-mono text-muted-foreground">{p.projectNumber}</div>
                            {p.projectCustomerName && <div className="text-[10px] text-muted-foreground truncate max-w-[120px]">{p.projectCustomerName}</div>}
                          </div>
                        ) : <span className="text-xs text-muted-foreground">-</span>}
                      </td>
                      <td className="py-1.5 px-2">
                        <div className="text-xs font-medium truncate max-w-[160px]">{p.companyName || "-"}</div>
                        {p.description && <div className="text-[10px] text-muted-foreground truncate max-w-[160px]">{p.description}</div>}
                      </td>
                      <td className="py-1.5 px-2 text-right" onClick={e => e.stopPropagation()}>
                        {isCompleted ? (
                          <div className="flex items-center justify-end gap-1">
                            <span className={`text-xs font-medium ${p.type === "income" ? "text-blue-600" : "text-red-600"}`}>
                              {(p.actualAmount || p.amount || 0).toLocaleString()}
                            </span>
                            <Button variant="ghost" size="sm" className="h-6 px-1 text-orange-500" onClick={() => handleUndoPayment(p)} data-testid={`button-undo-${p.id}`} title="완료 취소">
                              <Undo2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <Popover open={partialPaymentId === p.id} onOpenChange={open => { if (!open) { setPartialPaymentId(null); setPartialAmount(""); } }}>
                            <PopoverTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className={`text-xs h-6 px-1.5 font-medium border-dashed border ${p.type === "income" ? "text-blue-600 hover:text-blue-700 hover:bg-blue-50" : "text-red-600 hover:text-red-700 hover:bg-red-50"}`}
                                onClick={() => setPartialPaymentId(p.id)}
                                data-testid={`button-amount-${p.id}`}
                              >
                                <Banknote className="mr-1 h-3 w-3" />
                                {(p.amount || 0).toLocaleString()}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-56 p-3" align="end">
                              <div className="space-y-2">
                                <div className="text-xs font-medium text-muted-foreground">{p.type === "income" ? "입금" : "출금"} 처리</div>
                                <Button
                                  size="sm"
                                  className="w-full text-xs"
                                  onClick={() => { handleFullPayment(p); setPartialPaymentId(null); }}
                                  data-testid={`button-full-payment-${p.id}`}
                                >
                                  <Check className="mr-1 h-3 w-3" />
                                  전체 {p.type === "income" ? "입금" : "출금"} ({(p.amount || 0).toLocaleString()}원)
                                </Button>
                                <div className="border-t pt-2">
                                  <div className="text-[10px] text-muted-foreground mb-1">분할 {p.type === "income" ? "입금" : "출금"}</div>
                                  <div className="flex gap-1">
                                    <Input
                                      type="number"
                                      placeholder="금액 입력"
                                      value={partialAmount}
                                      onChange={e => setPartialAmount(e.target.value)}
                                      className="h-7 text-xs flex-1"
                                      onKeyDown={e => { if (e.key === "Enter") handlePartialPayment(p, partialAmount); }}
                                      data-testid={`input-partial-amount-${p.id}`}
                                    />
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs px-2"
                                      disabled={!partialAmount || parseInt(partialAmount) <= 0}
                                      onClick={() => handlePartialPayment(p, partialAmount)}
                                      data-testid={`button-partial-confirm-${p.id}`}
                                    >
                                      확인
                                    </Button>
                                  </div>
                                  {partialAmount && parseInt(partialAmount) > 0 && parseInt(partialAmount) < (p.amount || 0) && (
                                    <div className="text-[10px] text-orange-600 mt-1">
                                      잔액: {((p.amount || 0) - parseInt(partialAmount)).toLocaleString()}원 → 다음 결제 건 생성
                                    </div>
                                  )}
                                </div>
                              </div>
                            </PopoverContent>
                          </Popover>
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-right hidden md:table-cell">
                        {p.actualAmount ? (
                          <span className="text-xs text-green-600 dark:text-green-400">{(p.actualAmount || 0).toLocaleString()}</span>
                        ) : <span className="text-xs text-muted-foreground">-</span>}
                      </td>
                      <td className="py-1.5 px-2 text-center hidden lg:table-cell text-[10px] text-muted-foreground">
                        {p.splitTotal && p.splitTotal > 1 ? `${p.splitIndex}/${p.splitTotal}` : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <CalendarIcon className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>{(statusFilter !== "all" || typeFilter !== "all") ? "필터 조건에 맞는 항목이 없습니다." : "이 달에 등록된 결제 계획이 없습니다."}</p>
          </div>
        )
      ) : viewMode === "calendar" ? (
        <CalendarView payments={sorted} year={year} month={month} onSelectPayment={setSelectedId} />
      ) : (
        <FundOverviewTab year={year} month={month} />
      )}

      {viewMode !== "fund" && payments && (
        <div className="text-xs text-muted-foreground">
          {viewMode === "timeline"
            ? `총 ${payments.length}건`
            : sorted.length === payments.length
              ? `총 ${sorted.length}건`
              : `${sorted.length}건 / 총 ${payments.length}건`}
        </div>
      )}

      <Dialog open={!!selectedId} onOpenChange={open => { if (!open) setSelectedId(null); }}>
        {selectedId && <PaymentDetailModal paymentId={selectedId} onClose={() => setSelectedId(null)} />}
      </Dialog>

      <AddPaymentDialog open={showAdd} onOpenChange={setShowAdd} />
      <Dialog open={showPasswordDialog} onOpenChange={open => { if (!open) setShowPasswordDialog(false); }}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle>비밀번호 입력</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input
              type="password"
              placeholder="비밀번호를 입력하세요"
              value={fundPassword}
              onChange={e => { setFundPassword(e.target.value); setPasswordError(false); }}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  if (fundPassword === "6937") { setShowPasswordDialog(false); setFundAuthenticated(true); setViewMode("fund"); }
                  else setPasswordError(true);
                }
              }}
              autoFocus
              data-testid="input-fund-password"
            />
            {passwordError && <p className="text-xs text-red-500">비밀번호가 올바르지 않습니다.</p>}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowPasswordDialog(false)}>취소</Button>
            <Button onClick={() => { if (fundPassword === "6937") { setShowPasswordDialog(false); setFundAuthenticated(true); setViewMode("fund"); } else setPasswordError(true); }} data-testid="button-confirm-fund-password">확인</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRemainderPicker} onOpenChange={open => { if (!open) { setShowRemainderPicker(false); setRemainderInfo(null); setRemainderDate(undefined); } }}>
        <DialogContent className="max-w-sm" data-testid="modal-remainder-date">
          <DialogHeader>
            <DialogTitle>잔액 결제 일정</DialogTitle>
          </DialogHeader>
          {remainderInfo && (
            <div className="space-y-3">
              <div className="text-sm">
                <span className="text-muted-foreground">잔액: </span>
                <span className="font-medium text-orange-600">
                  {((remainderInfo.payment.amount || 0) - remainderInfo.paidAmount).toLocaleString()}원
                </span>
              </div>
              <div className="text-xs text-muted-foreground">잔액을 언제 처리할지 날짜를 선택하세요.</div>
              <Calendar
                mode="single"
                selected={remainderDate}
                onSelect={setRemainderDate}
                locale={ko}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  disabled={!remainderDate}
                  onClick={() => { if (remainderDate) handleCreateRemainder(remainderDate); }}
                  data-testid="button-create-remainder"
                >
                  <Check className="mr-1 h-3 w-3" />결제 건 생성
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setShowRemainderPicker(false); setRemainderInfo(null); setRemainderDate(undefined); }}
                  data-testid="button-skip-remainder"
                >
                  건너뛰기
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
