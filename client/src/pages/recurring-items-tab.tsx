import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { RecurringExpense, MonthlyBalance } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Trash2, Check, RefreshCw,
  CreditCard, Building2, Receipt,
  Landmark, Home, Wallet, X, Power, PowerOff,
} from "lucide-react";

type RecurringForm = {
  category: string;
  companyName: string;
  description: string;
  amount: string;
  frequency: string;
  paymentDay: string;
  weekday: string;
  paymentMonth: string;
  startDate: string;
  endDate: string;
  mode: "period" | "installment";
  totalInstallments: string;
  startInstallment: string;
};

type RecurringPayload = {
  category: string;
  companyName: string | null;
  description: string | null;
  amount: number;
  frequency: string;
  paymentDay: number;
  isActive?: string;
  startDate: string | null;
  endDate: string | null;
  totalInstallments: number | null;
  startInstallment: number;
  weekday?: number;
  paymentMonth?: number;
};

const DEFAULT_FORM: RecurringForm = {
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
  mode: "period",
  totalInstallments: "",
  startInstallment: "1",
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

const WEEKDAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

function formatAmount(amount: number | null | undefined) {
  if (!amount && amount !== 0) return "-";
  return amount.toLocaleString() + "원";
}

function getCategoryIcon(category: string | null) {
  const found = EXPENSE_CATEGORIES.find(c => c.value === category);
  if (found) {
    const Icon = found.icon;
    return <Icon className="h-3 w-3" />;
  }
  return <Wallet className="h-3 w-3" />;
}

function getScheduleLabel(r: RecurringExpense) {
  const freq = r.frequency ?? "monthly";
  const dayLabel = r.paymentDay === 0 ? "월말" : `${r.paymentDay}일`;
  if (freq === "weekly") {
    const wd = r.weekday;
    return `매주 ${WEEKDAY_NAMES[wd != null && wd >= 0 && wd <= 6 ? wd : 1]}요일`;
  }
  if (freq === "yearly") {
    const pm = r.paymentMonth;
    return `매년 ${pm != null && pm >= 1 && pm <= 12 ? pm : 1}월 ${dayLabel}`;
  }
  return `매월 ${dayLabel}`;
}

function computeEndDate(startDate: string, totalInstallments: number, startInstallment: number) {
  if (!startDate) return "";
  const [sy, sm] = startDate.split("-").map(Number);
  const remainingMonths = totalInstallments - startInstallment;
  const endMonth = sm + remainingMonths;
  const ey = sy + Math.floor((endMonth - 1) / 12);
  const em = ((endMonth - 1) % 12) + 1;
  return `${ey}-${String(em).padStart(2, "0")}`;
}

function RecurringExpenseSection({ year, month }: { year: number; month: number }) {
  const { toast } = useToast();
  const { data: recurring, isLoading } = useQuery<RecurringExpense[]>({
    queryKey: ["/api/recurring-expenses"],
  });

  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<RecurringForm>(DEFAULT_FORM);
  const [form, setForm] = useState<RecurringForm>(DEFAULT_FORM);

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
      const payload: RecurringPayload = {
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
      if (form.frequency === "weekly") payload.weekday = parseInt(form.weekday) || 1;
      if (form.frequency === "yearly") payload.paymentMonth = parseInt(form.paymentMonth) || 1;
      const res = await apiRequest("POST", "/api/recurring-expenses", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recurring-expenses"] });
      setForm(DEFAULT_FORM);
      setShowAdd(false);
      toast({ title: "정기지출이 등록되었습니다" });
    },
    onError: (err: Error) => {
      toast({ title: "등록 실패", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: RecurringPayload }) => {
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
      frequency: r.frequency ?? "monthly",
      paymentDay: String(r.paymentDay),
      weekday: String(r.weekday ?? 1),
      paymentMonth: String(r.paymentMonth ?? 1),
      startDate: r.startDate || "",
      endDate: r.endDate || "",
      mode: r.totalInstallments ? "installment" : "period",
      totalInstallments: r.totalInstallments ? String(r.totalInstallments) : "",
      startInstallment: String(r.startInstallment ?? 1),
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
    const data: RecurringPayload = {
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
      paymentDay: 1,
    };
    if (editForm.frequency === "weekly") {
      data.weekday = parseInt(editForm.weekday) || 1;
      data.paymentDay = 1;
    } else {
      const dayVal = editForm.paymentDay === "0" ? 0 : parseInt(editForm.paymentDay);
      if (dayVal !== 0 && (!dayVal || dayVal < 1 || dayVal > 31)) { toast({ title: "결제일을 1~31 사이로 입력해주세요", variant: "destructive" }); return; }
      data.paymentDay = dayVal;
    }
    if (editForm.frequency === "yearly") data.paymentMonth = parseInt(editForm.paymentMonth) || 1;
    updateMutation.mutate({ id: editingId, data });
  };

  const freqLabel = (f: string) => f === "weekly" ? "주" : f === "yearly" ? "연" : "월";

  if (isLoading) return <Skeleton className="h-20" />;

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
                  {EXPENSE_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
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
                      {WEEKDAY_NAMES.map((name, i) => <SelectItem key={i} value={String(i)}>{name}요일</SelectItem>)}
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
                        {Array.from({ length: 31 }, (_, i) => <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}일</SelectItem>)}
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
                      {Array.from({ length: 31 }, (_, i) => <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}일</SelectItem>)}
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
                <Button variant={form.mode === "period" ? "default" : "ghost"} size="sm" className="h-6 text-[11px] px-2" onClick={() => setForm(p => ({ ...p, mode: "period" }))} data-testid="button-mode-period">기간 지정</Button>
                <Button variant={form.mode === "installment" ? "default" : "ghost"} size="sm" className="h-6 text-[11px] px-2" onClick={() => setForm(p => ({ ...p, mode: "installment" }))} data-testid="button-mode-installment">횟수 지정</Button>
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
                  <Input className="h-8 text-xs bg-muted/50" type="month" readOnly value={form.startDate && form.totalInstallments ? computeEndDate(form.startDate, parseInt(form.totalInstallments) || 1, parseInt(form.startInstallment) || 1) : ""} data-testid="input-recurring-end-auto" />
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
                            <Select value={editForm.category} onValueChange={val => setEditForm(p => ({ ...p, category: val }))}>
                              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {EXPENSE_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-[10px]">거래처</Label>
                            <Input className="h-7 text-xs" value={editForm.companyName} onChange={e => setEditForm(p => ({ ...p, companyName: e.target.value }))} />
                          </div>
                          <div>
                            <Label className="text-[10px]">설명</Label>
                            <Input className="h-7 text-xs" value={editForm.description} onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))} />
                          </div>
                          <div>
                            <Label className="text-[10px]">금액</Label>
                            <Input className="h-7 text-xs" type="number" value={editForm.amount} onChange={e => setEditForm(p => ({ ...p, amount: e.target.value }))} />
                          </div>
                          <div>
                            <Label className="text-[10px]">주기</Label>
                            <Select value={editForm.frequency} onValueChange={val => setEditForm(p => ({ ...p, frequency: val }))}>
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
                                <Select value={editForm.weekday} onValueChange={val => setEditForm(p => ({ ...p, weekday: val }))}>
                                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {WEEKDAY_NAMES.map((name, i) => <SelectItem key={i} value={String(i)}>{name}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </>
                            ) : editForm.frequency === "yearly" ? (
                              <div className="flex gap-1">
                                <div className="flex-1">
                                  <Label className="text-[10px]">월</Label>
                                  <Input className="h-7 text-xs" type="number" min="1" max="12" value={editForm.paymentMonth} onChange={e => setEditForm(p => ({ ...p, paymentMonth: e.target.value }))} />
                                </div>
                                <div className="flex-1">
                                  <Label className="text-[10px]">일</Label>
                                  <Select value={editForm.paymentDay} onValueChange={val => setEditForm(p => ({ ...p, paymentDay: val }))}>
                                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      {Array.from({ length: 31 }, (_, i) => <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}일</SelectItem>)}
                                      <SelectItem value="0">월말</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            ) : (
                              <>
                                <Label className="text-[10px]">결제일</Label>
                                <Select value={editForm.paymentDay} onValueChange={val => setEditForm(p => ({ ...p, paymentDay: val }))}>
                                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {Array.from({ length: 31 }, (_, i) => <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}일</SelectItem>)}
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
                                <Button variant={editForm.mode === "period" ? "default" : "ghost"} size="sm" className="h-5 text-[10px] px-1.5" onClick={() => setEditForm(p => ({ ...p, mode: "period" }))} data-testid="button-edit-mode-period">기간 지정</Button>
                                <Button variant={editForm.mode === "installment" ? "default" : "ghost"} size="sm" className="h-5 text-[10px] px-1.5" onClick={() => setEditForm(p => ({ ...p, mode: "installment" }))} data-testid="button-edit-mode-installment">횟수 지정</Button>
                              </div>
                            </div>
                            {editForm.mode === "period" ? (
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
                                <div>
                                  <Label className="text-[10px]">시작기간</Label>
                                  <Input className="h-7 text-xs" type="month" value={editForm.startDate} onChange={e => setEditForm(p => ({ ...p, startDate: e.target.value }))} />
                                </div>
                                <div>
                                  <Label className="text-[10px]">완료기간</Label>
                                  <Input className="h-7 text-xs" type="month" value={editForm.endDate} onChange={e => setEditForm(p => ({ ...p, endDate: e.target.value }))} />
                                </div>
                              </div>
                            ) : (
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
                                <div>
                                  <Label className="text-[10px]">시작기간 <span className="text-red-500">*</span></Label>
                                  <Input className="h-7 text-xs" type="month" value={editForm.startDate} onChange={e => setEditForm(p => ({ ...p, startDate: e.target.value }))} />
                                </div>
                                <div>
                                  <Label className="text-[10px]">총 횟수 <span className="text-red-500">*</span></Label>
                                  <Input className="h-7 text-xs" type="number" min="1" value={editForm.totalInstallments} onChange={e => setEditForm(p => ({ ...p, totalInstallments: e.target.value }))} />
                                </div>
                                <div>
                                  <Label className="text-[10px]">시작 회차</Label>
                                  <Input className="h-7 text-xs" type="number" min="1" value={editForm.startInstallment} onChange={e => setEditForm(p => ({ ...p, startInstallment: e.target.value }))} />
                                </div>
                                <div>
                                  <Label className="text-[10px]">완료기간 (자동)</Label>
                                  <Input className="h-7 text-xs bg-muted/50" type="month" readOnly value={editForm.startDate && editForm.totalInstallments ? computeEndDate(editForm.startDate, parseInt(editForm.totalInstallments) || 1, parseInt(editForm.startInstallment) || 1) : ""} />
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
                        variant="ghost" size="sm" className="h-6 px-1.5"
                        onClick={() => toggleMutation.mutate({ id: r.id, isActive: r.isActive === "true" ? "false" : "true" })}
                        data-testid={`button-toggle-recurring-${r.id}`}
                      >
                        {r.isActive === "true" ? <Power className="h-3 w-3 text-green-600" /> : <PowerOff className="h-3 w-3 text-muted-foreground" />}
                      </Button>
                    </td>
                    <td className="py-1.5 px-2">
                      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                        {getCategoryIcon(r.category)}{r.category}
                      </span>
                    </td>
                    <td className="py-1.5 px-2 text-xs font-medium">{r.companyName || "-"}</td>
                    <td className="py-1.5 px-2 text-xs text-muted-foreground">{r.description || "-"}</td>
                    <td className="py-1.5 px-2 text-right text-xs font-medium text-red-600">
                      {formatAmount(r.amount)}
                      <span className="text-[9px] text-muted-foreground ml-0.5">/{freqLabel(r.frequency ?? "monthly")}</span>
                    </td>
                    <td className="py-1.5 px-2 text-center text-xs">{getScheduleLabel(r)}</td>
                    <td className="py-1.5 px-2 text-center text-[10px] text-muted-foreground">
                      {r.totalInstallments ? (
                        <span>{r.totalInstallments}회{(r.startInstallment ?? 1) > 1 && ` (${r.startInstallment}회차부터)`}</span>
                      ) : r.startDate || r.endDate ? (
                        <span>{r.startDate || "~"} ~ {r.endDate || ""}</span>
                      ) : "-"}
                    </td>
                    <td className="py-1.5 px-2 text-center" onClick={e => e.stopPropagation()}>
                      <Button
                        variant="ghost" size="sm" className="h-6 px-1.5 text-red-500 hover:text-red-700"
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
              {formatAmount(recurring.filter(r => r.isActive === "true" && (r.frequency ?? "monthly") === "monthly").reduce((sum, r) => sum + r.amount, 0))}
            </span>
            {recurring.some(r => r.isActive === "true" && r.frequency === "weekly") && (
              <span className="ml-3">주간: <span className="font-medium text-red-600">{formatAmount(recurring.filter(r => r.isActive === "true" && r.frequency === "weekly").reduce((sum, r) => sum + r.amount, 0))}/주</span></span>
            )}
            {recurring.some(r => r.isActive === "true" && r.frequency === "yearly") && (
              <span className="ml-3">연간: <span className="font-medium text-red-600">{formatAmount(recurring.filter(r => r.isActive === "true" && r.frequency === "yearly").reduce((sum, r) => sum + r.amount, 0))}/년</span></span>
            )}
          </div>
        </div>
      ) : (
        <div className="text-center py-6 text-muted-foreground text-sm">등록된 정기지출이 없습니다.</div>
      )}
    </div>
  );
}

function MonthlyBalanceSection({ year, month }: { year: number; month: number }) {
  const { toast } = useToast();
  const [editingBalance, setEditingBalance] = useState(false);
  const [balanceInput, setBalanceInput] = useState("");

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
      setEditingBalance(false);
      toast({ title: "기초잔액이 저장되었습니다" });
    },
    onError: (err: Error) => {
      toast({ title: "저장 실패", description: err.message, variant: "destructive" });
    },
  });

  const openingBalance = monthlyBalance?.openingBalance ?? null;

  return (
    <div className="border rounded-lg p-4 bg-muted/20">
      <div className="text-xs font-medium text-muted-foreground mb-3">월초 잔액 수기 입력</div>
      <div className="text-xs text-muted-foreground mb-3">
        {year}년 {month}월 초 실제 잔액을 입력하면 자금흐름 탭의 예상 잔액 계산에 사용됩니다.
      </div>
      <div className="flex items-center gap-3">
        {editingBalance ? (
          <>
            <Input
              type="number"
              className="h-8 w-48 text-sm"
              value={balanceInput}
              onChange={e => setBalanceInput(e.target.value)}
              placeholder="금액 입력"
              autoFocus
              data-testid="input-opening-balance"
            />
            <Button
              size="sm"
              onClick={() => { const v = parseInt(balanceInput); if (!isNaN(v)) saveBalance.mutate(v); }}
              disabled={saveBalance.isPending || !balanceInput}
              data-testid="button-save-opening-balance"
            >
              저장
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditingBalance(false)}>취소</Button>
          </>
        ) : (
          <>
            <span className="text-sm font-medium" data-testid="text-opening-balance">
              {openingBalance != null ? `${openingBalance.toLocaleString()}원` : "미입력"}
            </span>
            <Button
              size="sm" variant="outline"
              onClick={() => { setBalanceInput(openingBalance != null ? String(openingBalance) : ""); setEditingBalance(true); }}
              data-testid="button-edit-opening-balance"
            >
              {openingBalance != null ? "수정" : "입력"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export function RecurringItemsTab({ year, month }: { year: number; month: number }) {
  return (
    <div className="space-y-6" data-testid="recurring-items-tab">
      <div>
        <div className="text-sm font-medium mb-3">정기 지출 항목</div>
        <RecurringExpenseSection year={year} month={month} />
      </div>
      <MonthlyBalanceSection year={year} month={month} />
    </div>
  );
}
