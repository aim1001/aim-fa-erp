import { useQuery, useMutation } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar, List, Plus, Check, Clock, AlertTriangle, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { useState, useMemo } from "react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Payment } from "@shared/schema";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

function formatAmount(amount: number | null | undefined) {
  if (!amount && amount !== 0) return "-";
  return amount.toLocaleString() + "원";
}

function getStatusInfo(payment: Payment) {
  if (payment.status === "completed" || payment.actualDate) {
    return { label: "완료", icon: Check, className: "text-green-600 bg-green-50" };
  }
  if (payment.plannedDate && payment.plannedDate < new Date().toISOString().split("T")[0]) {
    return { label: "연체", icon: AlertTriangle, className: "text-red-600 bg-red-50" };
  }
  return { label: "예정", icon: Clock, className: "text-blue-600 bg-blue-50" };
}

function PaymentDetailModal({ paymentId, onClose }: { paymentId: string; onClose: () => void }) {
  const { toast } = useToast();
  const { data: payment } = useQuery<Payment>({
    queryKey: ["/api/payments", paymentId],
    queryFn: async () => {
      const all = await (await fetch("/api/payments")).json();
      return all.find((p: Payment) => p.id === paymentId);
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
    updateMutation.mutate({ actualDate: today, actualAmount: payment?.amount || 0, status: "completed" });
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
      <div className="grid grid-cols-[100px_1fr] gap-y-2 gap-x-2 text-sm items-center">
        {renderField("거래처", "companyName", payment.companyName || "")}
        {renderField("설명", "description", payment.description || "")}
        {renderField("예정금액", "amount", String(payment.amount || ""), "number")}
        {renderField("예정일", "plannedDate", payment.plannedDate || "", "date")}
        {renderField("실제금액", "actualAmount", String(payment.actualAmount || ""), "number")}
        {renderField("실제일", "actualDate", payment.actualDate || "", "date")}
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
      {payment.status !== "completed" && !payment.actualDate && (
        <Button size="sm" className="mt-2" onClick={markCompleted} data-testid="button-mark-completed">
          <Check className="h-4 w-4 mr-1" />결제 완료 처리
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

function CalendarView({ payments, year, month, onSelectPayment }: {
  payments: Payment[];
  year: number;
  month: number;
  onSelectPayment: (id: string) => void;
}) {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const startDow = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const paymentsByDate = useMemo(() => {
    const map = new Map<number, Payment[]>();
    payments.forEach(p => {
      if (p.plannedDate) {
        const d = parseInt(p.plannedDate.substring(8, 10));
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
            const income = dayPayments.filter(p => p.type === "income").reduce((s, p) => s + (p.amount || 0), 0);
            const expense = dayPayments.filter(p => p.type === "expense").reduce((s, p) => s + (p.amount || 0), 0);
            return (
              <div key={di} className={`min-h-[80px] p-1 border-r last:border-r-0 ${day ? "bg-background" : "bg-muted/20"} ${di === 0 ? "text-red-500" : di === 6 ? "text-blue-500" : ""}`}>
                {day && (
                  <>
                    <div className="text-xs font-medium mb-1">{day}</div>
                    <div className="space-y-0.5">
                      {income > 0 && (
                        <div
                          className="text-[10px] bg-blue-50 text-blue-700 rounded px-1 truncate cursor-pointer hover:bg-blue-100"
                          onClick={() => { const p = dayPayments.find(p => p.type === "income"); if (p) onSelectPayment(p.id); }}
                          data-testid={`cal-income-${day}`}
                        >
                          +{income.toLocaleString()}
                        </div>
                      )}
                      {expense > 0 && (
                        <div
                          className="text-[10px] bg-red-50 text-red-700 rounded px-1 truncate cursor-pointer hover:bg-red-100"
                          onClick={() => { const p = dayPayments.find(p => p.type === "expense"); if (p) onSelectPayment(p.id); }}
                          data-testid={`cal-expense-${day}`}
                        >
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

export default function PaymentPlan() {
  const { toast } = useToast();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const { data: payments, isLoading } = useQuery<Payment[]>({
    queryKey: ["/api/payments", year, month],
    queryFn: async () => {
      const res = await fetch(`/api/payments?year=${year}&month=${month}`);
      return res.json();
    },
  });

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
    return [...payments].sort((a, b) => (a.plannedDate || "").localeCompare(b.plannedDate || ""));
  }, [payments]);

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

  const groupedByDate = useMemo(() => {
    const groups = new Map<string, Payment[]>();
    sorted.forEach(p => {
      const date = p.plannedDate || "미정";
      if (!groups.has(date)) groups.set(date, []);
      groups.get(date)!.push(p);
    });
    return groups;
  }, [sorted]);

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
            <Calendar className="h-4 w-4 mr-1" />캘린더
          </Button>
        </div>
      </div>

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

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12" />)}</div>
      ) : viewMode === "list" ? (
        sorted.length > 0 ? (
          <div className="space-y-4">
            {Array.from(groupedByDate.entries()).map(([date, items]) => (
              <div key={date}>
                <div className="text-xs font-medium text-muted-foreground mb-1 sticky top-0 bg-background py-1">
                  {date === "미정" ? "날짜 미정" : date}
                </div>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <tbody>
                      {items.map(p => {
                        const statusInfo = getStatusInfo(p);
                        return (
                          <tr
                            key={p.id}
                            className="border-b last:border-b-0 hover:bg-muted/30 cursor-pointer transition-colors"
                            onClick={() => setSelectedId(p.id)}
                            data-testid={`row-payment-${p.id}`}
                          >
                            <td className="py-2.5 px-3 w-16">
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${statusInfo.className}`}>
                                <statusInfo.icon className="h-3 w-3" />
                                {statusInfo.label}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 w-14">
                              <span className={`text-xs font-medium ${p.type === "income" ? "text-blue-600" : "text-red-600"}`}>
                                {p.type === "income" ? "입금" : "출금"}
                              </span>
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="font-medium">{p.companyName || "-"}</div>
                              {p.description && <div className="text-xs text-muted-foreground">{p.description}</div>}
                            </td>
                            <td className="py-2.5 px-3 text-right hidden md:table-cell">
                              <div className={`font-medium ${p.type === "income" ? "text-blue-600" : "text-red-600"}`}>
                                {p.type === "income" ? "+" : "-"}{formatAmount(p.amount)}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-right hidden lg:table-cell">
                              {p.actualAmount ? (
                                <div className="text-green-600 text-xs">
                                  실제: {formatAmount(p.actualAmount)}
                                </div>
                              ) : null}
                            </td>
                            <td className="py-2.5 px-3 text-right hidden lg:table-cell text-xs text-muted-foreground">
                              {p.splitTotal && p.splitTotal > 1 ? `${p.splitIndex}/${p.splitTotal}` : ""}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <Calendar className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>이 달에 등록된 결제 계획이 없습니다.</p>
          </div>
        )
      ) : (
        <CalendarView payments={sorted} year={year} month={month} onSelectPayment={setSelectedId} />
      )}

      <div className="text-xs text-muted-foreground">{sorted.length > 0 && `총 ${sorted.length}건`}</div>

      <Dialog open={!!selectedId} onOpenChange={open => { if (!open) setSelectedId(null); }}>
        {selectedId && <PaymentDetailModal paymentId={selectedId} onClose={() => setSelectedId(null)} />}
      </Dialog>

      <AddPaymentDialog open={showAdd} onOpenChange={setShowAdd} />
    </div>
  );
}
