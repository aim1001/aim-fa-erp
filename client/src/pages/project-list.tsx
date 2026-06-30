import { useQuery, useMutation } from "@tanstack/react-query";
import { PhoneLink } from "@/components/contact-links";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RefreshCw, FolderOpen, ExternalLink, X, Plus, ReceiptText, Wallet, Settings, FileText, CalendarClock, CalendarDays, Check, Pencil, Trash2, Banknote, AlertTriangle, Undo2, Link2, Unlink, Search, Building2, Users, Package, Loader2, ListTodo } from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { useSearch, useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Project, SalesInvoice, PurchaseInvoice, Payment, Customer, ProjectItem } from "@shared/schema";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type EnrichedProject = Project & {
  salesTotal: number;
  salesSupplyTotal: number;
  purchaseTotal: number;
  profit: number;
  paidIncome: number;
  paidExpense: number;
  pendingPayments: number;
  salesCount: number;
  purchaseCount: number;
  inquiryNumber: string | null;
};

import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";

type ProjectDetail = Project & {
  salesInvoices: SalesInvoice[];
  purchaseInvoices: PurchaseInvoice[];
  payments: Payment[];
  customer: Customer | null;
};

function fmt(n: number) {
  if (!n) return "-";
  return n.toLocaleString();
}

const TIMING_OPTIONS = [
  { value: "end_of_next_month", label: "익월말" },
  { value: "two_weeks", label: "2주이내" },
  { value: "end_of_month", label: "월말" },
  { value: "specific_days", label: "일자지정" },
  { value: "within_days", label: "N일이내" },
];

function timingLabel(t: string | null) {
  return TIMING_OPTIONS.find(o => o.value === t)?.label || "-";
}

function ProjectDescriptionField({ project }: { project: ProjectDetail }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(project.description || "");

  useEffect(() => { setValue(project.description || ""); }, [project.description]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/projects/${project.id}`, { description: value });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setEditing(false);
      toast({ title: "내용 저장 완료" });
    },
    onError: (err: Error) => toast({ title: "저장 실패", description: err.message, variant: "destructive" }),
  });

  if (editing) {
    return (
      <div className="flex items-start gap-2">
        <Input
          autoFocus
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") saveMutation.mutate(); if (e.key === "Escape") { setEditing(false); setValue(project.description || ""); } }}
          className="h-8 text-sm flex-1"
          placeholder="내용 입력..."
        />
        <Button size="sm" className="h-8 text-xs" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>저장</Button>
        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setEditing(false); setValue(project.description || ""); }}>취소</Button>
      </div>
    );
  }

  return (
    <div
      className="group flex items-center gap-2 cursor-pointer"
      onClick={() => setEditing(true)}
      title="클릭하여 내용 수정"
    >
      <span className="text-sm text-muted-foreground flex-1">
        {project.description || <span className="text-muted-foreground/40 italic">내용 없음 — 클릭하여 입력</span>}
      </span>
      <Pencil className="h-3 w-3 text-muted-foreground/40 opacity-0 group-hover:opacity-100 shrink-0" />
    </div>
  );
}

function fmtComma(n: number | string): string {
  const num = typeof n === "string" ? parseInt(n.replace(/,/g, ""), 10) : n;
  if (!num && num !== 0) return "";
  return num.toLocaleString();
}

function CommaInput({ value, onChange, className, ...props }: { value: number; onChange: (v: number) => void; className?: string; [key: string]: any }) {
  const [display, setDisplay] = useState(value ? fmtComma(value) : "");

  useEffect(() => {
    setDisplay(value ? fmtComma(value) : "");
  }, [value]);

  return (
    <Input
      type="text"
      inputMode="numeric"
      className={className}
      value={display}
      onChange={e => {
        const raw = e.target.value.replace(/[^0-9]/g, "");
        const num = parseInt(raw, 10) || 0;
        setDisplay(raw ? fmtComma(num) : "");
        onChange(num);
      }}
      {...props}
    />
  );
}

function CollectionConditionsEditor({ project, onSave }: { project: ProjectDetail; onSave: () => void }) {
  const { toast } = useToast();
  const initTotal = project.totalAmount ?? 0;
  const derive = (amt: number | null | undefined, ratio: number | null | undefined, def: number) =>
    amt ?? Math.round(initTotal * (ratio ?? def) / 100);
  const [totalAmount, setTotalAmountRaw] = useState(initTotal);
  const [depositRatio, setDepositRatio] = useState(project.depositRatio ?? 50);
  const [depositAmount, setDepositAmount] = useState(derive(project.depositAmount, project.depositRatio, 50));
  const [depositTimingType, setDepositTimingType] = useState(project.depositTimingType || "end_of_next_month");
  const [depositTimingDays, setDepositTimingDays] = useState(project.depositTimingDays ?? 0);
  const [midRatio, setMidRatio] = useState(project.midRatio ?? 0);
  const [midAmount, setMidAmount] = useState(derive(project.midAmount, project.midRatio, 0));
  const [midTimingType, setMidTimingType] = useState(project.midTimingType || "end_of_next_month");
  const [midTimingDays, setMidTimingDays] = useState(project.midTimingDays ?? 0);
  const [midAfterDelivery, setMidAfterDelivery] = useState(project.midAfterDelivery === "true");
  const [finalRatio, setFinalRatio] = useState(project.finalRatio ?? 50);
  const [finalAmount, setFinalAmount] = useState(derive(project.finalAmount, project.finalRatio, 50));
  const [finalTimingType, setFinalTimingType] = useState(project.finalTimingType || "end_of_next_month");
  const [finalTimingDays, setFinalTimingDays] = useState(project.finalTimingDays ?? 0);
  const [finalAfterDelivery, setFinalAfterDelivery] = useState(project.finalAfterDelivery === "true");
  const [invoicePlan, setInvoicePlan] = useState(project.invoicePlan || "split");
  const [deliveryDate, setDeliveryDate] = useState(project.deliveryDate || "");

  // 총액 변경 시 각 단계 금액을 현재 비율로 재계산
  const setTotalAmount = (v: number) => {
    setTotalAmountRaw(v);
    setDepositAmount(Math.round(v * depositRatio / 100));
    setMidAmount(Math.round(v * midRatio / 100));
    setFinalAmount(Math.round(v * finalRatio / 100));
  };
  // %↔금액 양방향: 한쪽을 바꾸면 다른 쪽을 자동 환산
  const onRatioChange = (setRatio: (n: number) => void, setAmount: (n: number) => void, v: number) => {
    setRatio(v);
    setAmount(totalAmount > 0 ? Math.round(totalAmount * v / 100) : 0);
  };
  const onAmountChange = (setRatio: (n: number) => void, setAmount: (n: number) => void, v: number) => {
    setAmount(v);
    setRatio(totalAmount > 0 ? Math.round(v / totalAmount * 100) : 0);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/projects/${project.id}`, {
        totalAmount, depositRatio, depositAmount, depositTimingType, depositTimingDays,
        midRatio, midAmount, midTimingType, midTimingDays, midAfterDelivery: midAfterDelivery ? "true" : "false",
        finalRatio, finalAmount, finalTimingType, finalTimingDays, finalAfterDelivery: finalAfterDelivery ? "true" : "false",
        invoicePlan, deliveryDate: deliveryDate || null,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      const r = data?.regen;
      const desc = r?.error
        ? `재생성 경고: ${r.error}`
        : r
          ? `수금계획 ${r.collection?.created ?? 0}건·계산서 ${r.invoice?.created ?? 0}건 갱신${(r.collection?.skipped || r.invoice?.skipped) ? " (완료/발행건 보존)" : ""}`
          : undefined;
      toast({ title: "계약조건 저장 완료", description: desc });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices-with-payments"] });
      onSave();
    },
    onError: (err: Error) => toast({ title: "저장 실패", description: err.message, variant: "destructive" }),
  });

  const amountSum = depositAmount + midAmount + finalAmount;
  const amountMismatch = totalAmount > 0 && Math.abs(amountSum - totalAmount) > 1;
  const canSave = totalAmount > 0 && amountSum > 0;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px]">공급가액 (VAT별도)</Label>
            <CommaInput className="h-8 text-xs" value={totalAmount} onChange={setTotalAmount} data-testid="input-total-amount" />
          </div>
          <div>
            <Label className="text-[10px]">납품예정일</Label>
            <Input type="date" className="h-8 text-xs" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} data-testid="input-delivery-date" />
          </div>
        </div>
        {totalAmount > 0 && (
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground px-1">
            <span>공급가액: {fmtComma(totalAmount)}원</span>
            <span>VAT(10%): {fmtComma(Math.round(totalAmount * 0.1))}원</span>
            <span className="font-medium text-foreground">합계: {fmtComma(Math.round(totalAmount * 1.1))}원</span>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {[
          { label: "계약금", ratio: depositRatio, setRatio: setDepositRatio, amount: depositAmount, setAmount: setDepositAmount, timing: depositTimingType, setTiming: setDepositTimingType, days: depositTimingDays, setDays: setDepositTimingDays, after: false, setAfter: () => {}, showAfter: false },
          { label: "중도금", ratio: midRatio, setRatio: setMidRatio, amount: midAmount, setAmount: setMidAmount, timing: midTimingType, setTiming: setMidTimingType, days: midTimingDays, setDays: setMidTimingDays, after: midAfterDelivery, setAfter: setMidAfterDelivery, showAfter: true },
          { label: "잔금", ratio: finalRatio, setRatio: setFinalRatio, amount: finalAmount, setAmount: setFinalAmount, timing: finalTimingType, setTiming: setFinalTimingType, days: finalTimingDays, setDays: setFinalTimingDays, after: finalAfterDelivery, setAfter: setFinalAfterDelivery, showAfter: true },
        ].map(stage => (
          <div key={stage.label} className="border rounded p-2 bg-muted/20">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium w-10">{stage.label}</span>
              <div className="flex items-center gap-1">
                <Input type="number" className="h-7 w-14 text-xs" value={stage.ratio} onChange={e => onRatioChange(stage.setRatio, stage.setAmount, Number(e.target.value))} data-testid={`input-${stage.label}-ratio`} />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
              <div className="flex items-center gap-1">
                <CommaInput className="h-7 w-28 text-xs" value={stage.amount} onChange={v => onAmountChange(stage.setRatio, stage.setAmount, v)} data-testid={`input-${stage.label}-amount`} />
                <span className="text-xs text-muted-foreground">원</span>
              </div>
              {stage.amount > 0 && (
                <span className="text-[10px] text-muted-foreground">VAT포함 {fmtComma(Math.round(stage.amount * 1.1))}원</span>
              )}
              <Select value={stage.timing} onValueChange={stage.setTiming}>
                <SelectTrigger className="h-7 w-24 text-xs" data-testid={`select-${stage.label}-timing`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMING_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {stage.timing === "specific_days" && (
                <div className="flex items-center gap-1">
                  <Input type="number" className="h-7 w-14 text-xs" value={stage.days} onChange={e => stage.setDays(Number(e.target.value))} data-testid={`input-${stage.label}-days`} />
                  <span className="text-[10px] text-muted-foreground">일</span>
                </div>
              )}
              {stage.timing === "within_days" && (
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">{stage.showAfter && stage.after ? "납품후" : "계약후"}</span>
                  <Input type="number" className="h-7 w-14 text-xs" value={stage.days} onChange={e => stage.setDays(Number(e.target.value))} data-testid={`input-${stage.label}-within-days`} />
                  <span className="text-[10px] text-muted-foreground">일 이내</span>
                </div>
              )}
              {stage.showAfter && (
                <div className="flex items-center gap-1">
                  <Switch checked={stage.after} onCheckedChange={stage.setAfter} className="scale-75" data-testid={`switch-${stage.label}-after`} />
                  <span className="text-[10px] text-muted-foreground">납품후</span>
                </div>
              )}
            </div>
          </div>
        ))}
        {amountMismatch && (
          <div className="text-[10px] text-amber-600">
            단계 합계 {fmtComma(amountSum)}원 / 총액 {fmtComma(totalAmount)}원 · 차액 {fmtComma(totalAmount - amountSum)}원
            <span className="text-muted-foreground"> — 의도된 분할(추가 발행 예정 등)이면 그대로 저장 가능합니다</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Label className="text-[10px]">계산서 발행</Label>
        <Select value={invoicePlan} onValueChange={setInvoicePlan}>
          <SelectTrigger className="h-7 w-28 text-xs" data-testid="select-invoice-plan">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="split">분할 발행</SelectItem>
            <SelectItem value="bulk">일괄 발행</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button size="sm" className="w-full h-8 text-xs" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !canSave} data-testid="button-save-conditions">
        <Check className="h-3 w-3 mr-1" />{saveMutation.isPending ? "저장·재생성중..." : "계약조건 저장 (수금계획·계산서 자동 갱신)"}
      </Button>
    </div>
  );
}

function ProjectItemsTab({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const { data: items, isLoading } = useQuery<ProjectItem[]>({
    queryKey: ["/api/projects", projectId, "items"],
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<Partial<ProjectItem>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [newItem, setNewItem] = useState({ itemCode: "", itemName: "", spec: "", quantity: 1, costPrice: 0, unitPrice: 0 });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "items"] });
  };

  const addMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/items`, data);
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      setShowAdd(false);
      setNewItem({ itemCode: "", itemName: "", spec: "", quantity: 1, costPrice: 0, unitPrice: 0 });
    },
    onError: (err: Error) => toast({ title: "추가 실패", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, any> }) => {
      const res = await apiRequest("PATCH", `/api/project-items/${id}`, data);
      return res.json();
    },
    onSuccess: () => { invalidate(); setEditingId(null); },
    onError: (err: Error) => toast({ title: "수정 실패", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/project-items/${id}`);
    },
    onSuccess: invalidate,
    onError: (err: Error) => toast({ title: "삭제 실패", description: err.message, variant: "destructive" }),
  });

  if (isLoading) return <Skeleton className="h-32" />;

  const list = items || [];
  const totalSales = list.reduce((s, i) => s + (i.amount || 0), 0);
  const totalCost = list.reduce((s, i) => s + ((i.costPrice || 0) * (i.quantity || 1)), 0);
  const margin = totalSales - totalCost;
  const marginRate = totalSales > 0 ? Math.round((margin / totalSales) * 100) : 0;

  const startEdit = (item: ProjectItem) => {
    setEditingId(item.id);
    setEditRow({ quantity: item.quantity, costPrice: item.costPrice, unitPrice: item.unitPrice, itemName: item.itemName, spec: item.spec, itemCode: item.itemCode });
  };

  const saveEdit = (id: string) => {
    const qty = editRow.quantity || 1;
    const up = editRow.unitPrice || 0;
    updateMutation.mutate({ id, data: { ...editRow, amount: qty * up } });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium flex items-center gap-1"><Package className="h-3 w-3" />프로젝트 품목 ({list.length})</span>
        <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => setShowAdd(!showAdd)} data-testid="button-add-item">
          <Plus className="h-3 w-3 mr-0.5" />품목 추가
        </Button>
      </div>

      {showAdd && (
        <div className="border rounded p-2 space-y-1.5 bg-muted/30">
          <div className="grid grid-cols-6 gap-1.5">
            <Input placeholder="품목코드" className="h-7 text-xs" value={newItem.itemCode} onChange={e => setNewItem({ ...newItem, itemCode: e.target.value })} data-testid="input-new-item-code" />
            <Input placeholder="품목명 *" className="h-7 text-xs col-span-2" value={newItem.itemName} onChange={e => setNewItem({ ...newItem, itemName: e.target.value })} data-testid="input-new-item-name" />
            <Input placeholder="사양" className="h-7 text-xs" value={newItem.spec} onChange={e => setNewItem({ ...newItem, spec: e.target.value })} data-testid="input-new-item-spec" />
            <Input placeholder="수량" type="number" className="h-7 text-xs" value={newItem.quantity} onChange={e => setNewItem({ ...newItem, quantity: parseInt(e.target.value) || 1 })} data-testid="input-new-item-qty" />
            <Input placeholder="판매단가" type="number" className="h-7 text-xs" value={newItem.unitPrice} onChange={e => setNewItem({ ...newItem, unitPrice: parseInt(e.target.value) || 0 })} data-testid="input-new-item-price" />
          </div>
          <div className="grid grid-cols-6 gap-1.5">
            <Input placeholder="원가" type="number" className="h-7 text-xs" value={newItem.costPrice} onChange={e => setNewItem({ ...newItem, costPrice: parseInt(e.target.value) || 0 })} data-testid="input-new-item-cost" />
            <div className="col-span-3" />
            <Button size="sm" className="h-7 text-xs col-span-2" onClick={() => addMutation.mutate({ ...newItem, amount: newItem.quantity * newItem.unitPrice, sortOrder: list.length })} disabled={!newItem.itemName || addMutation.isPending} data-testid="button-confirm-add-item">
              {addMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "추가"}
            </Button>
          </div>
        </div>
      )}

      {list.length > 0 ? (
        <div className="border rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground">
                <th className="text-left px-2 py-1.5 font-medium w-16">코드</th>
                <th className="text-left px-2 py-1.5 font-medium">품목명</th>
                <th className="text-left px-2 py-1.5 font-medium w-24">사양</th>
                <th className="text-right px-2 py-1.5 font-medium w-12">수량</th>
                <th className="text-right px-2 py-1.5 font-medium w-20">원가</th>
                <th className="text-right px-2 py-1.5 font-medium w-20">단가</th>
                <th className="text-right px-2 py-1.5 font-medium w-24">금액</th>
                <th className="w-16" />
              </tr>
            </thead>
            <tbody>
              {list.map(item => (
                <tr key={item.id} className="border-t hover:bg-muted/20" data-testid={`row-item-${item.id}`}>
                  {editingId === item.id ? (
                    <>
                      <td className="px-1 py-1"><Input className="h-6 text-xs" value={editRow.itemCode || ""} onChange={e => setEditRow({ ...editRow, itemCode: e.target.value })} /></td>
                      <td className="px-1 py-1"><Input className="h-6 text-xs" value={editRow.itemName || ""} onChange={e => setEditRow({ ...editRow, itemName: e.target.value })} /></td>
                      <td className="px-1 py-1"><Input className="h-6 text-xs" value={editRow.spec || ""} onChange={e => setEditRow({ ...editRow, spec: e.target.value })} /></td>
                      <td className="px-1 py-1"><Input type="number" className="h-6 text-xs text-right" value={editRow.quantity || 1} onChange={e => setEditRow({ ...editRow, quantity: parseInt(e.target.value) || 1 })} /></td>
                      <td className="px-1 py-1"><Input type="number" className="h-6 text-xs text-right" value={editRow.costPrice || 0} onChange={e => setEditRow({ ...editRow, costPrice: parseInt(e.target.value) || 0 })} /></td>
                      <td className="px-1 py-1"><Input type="number" className="h-6 text-xs text-right" value={editRow.unitPrice || 0} onChange={e => setEditRow({ ...editRow, unitPrice: parseInt(e.target.value) || 0 })} /></td>
                      <td className="text-right px-2 py-1 font-medium">{((editRow.quantity || 1) * (editRow.unitPrice || 0)).toLocaleString()}</td>
                      <td className="px-1 py-1">
                        <div className="flex gap-0.5">
                          <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => saveEdit(item.id)} disabled={updateMutation.isPending} data-testid={`button-save-item-${item.id}`}><Check className="h-3 w-3" /></Button>
                          <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => setEditingId(null)} data-testid={`button-cancel-item-${item.id}`}><X className="h-3 w-3" /></Button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-2 py-1.5 text-muted-foreground">{item.itemCode || "-"}</td>
                      <td className="px-2 py-1.5 font-medium">{item.itemName}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{item.spec || "-"}</td>
                      <td className="text-right px-2 py-1.5">{item.quantity}</td>
                      <td className="text-right px-2 py-1.5 text-muted-foreground">{(item.costPrice || 0).toLocaleString()}</td>
                      <td className="text-right px-2 py-1.5">{(item.unitPrice || 0).toLocaleString()}</td>
                      <td className="text-right px-2 py-1.5 font-medium">{(item.amount || 0).toLocaleString()}</td>
                      <td className="px-1 py-1.5">
                        <div className="flex gap-0.5">
                          <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => startEdit(item)} data-testid={`button-edit-item-${item.id}`}><Pencil className="h-3 w-3" /></Button>
                          <Button size="icon" variant="ghost" className="h-5 w-5 text-red-500 hover:text-red-700" onClick={() => { if (confirm("삭제하시겠습니까?")) deleteMutation.mutate(item.id); }} data-testid={`button-delete-item-${item.id}`}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t bg-muted/30 px-2 py-1.5 flex items-center justify-between text-xs">
            <div className="flex gap-4">
              <span>매출합계: <span className="font-semibold text-blue-600">{totalSales.toLocaleString()}원</span></span>
              <span>원가합계: <span className="font-semibold text-red-600">{totalCost.toLocaleString()}원</span></span>
            </div>
            <span>마진: <span className={`font-semibold ${margin >= 0 ? "text-green-600" : "text-orange-600"}`}>{margin.toLocaleString()}원 ({marginRate}%)</span></span>
          </div>
        </div>
      ) : (
        <div className="text-center text-muted-foreground text-xs py-6 border rounded">
          등록된 품목이 없습니다
        </div>
      )}
    </div>
  );
}

export function ProjectDetailModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { toast } = useToast();
  const { data: project, isLoading } = useQuery<ProjectDetail>({
    queryKey: ["/api/projects", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}`);
      return res.json();
    },
  });

  const { data: allSales } = useQuery<SalesInvoice[]>({
    queryKey: ["/api/sales-invoices"],
  });

  const { data: allPurchases } = useQuery<PurchaseInvoice[]>({
    queryKey: ["/api/purchase-invoices"],
  });

  const linkMutation = useMutation({
    mutationFn: async ({ type, invoiceId, link, invoiceStage }: { type: "sales" | "purchase"; invoiceId: string; link: boolean; invoiceStage?: string | null }) => {
      const endpoint = type === "sales" ? `/api/sales-invoices/${invoiceId}` : `/api/purchase-invoices/${invoiceId}`;
      const body: any = { projectId: link ? projectId : null };
      if (type === "sales") body.invoiceStage = link ? (invoiceStage || null) : null;
      const res = await apiRequest("PATCH", endpoint, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-invoices"] });
    },
    onError: (err: Error) => {
      toast({ title: "연결 실패", description: err.message, variant: "destructive" });
    },
  });

  const genCollectionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/generate-collection-plan`, { confirmed: true });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
    },
    onError: (err: Error) => toast({ title: "수금 계획 생성 실패", description: err.message, variant: "destructive" }),
  });

  const genInvoiceMutation = useMutation({
    mutationFn: async (confirmed: boolean) => {
      const res = await fetch(`/api/projects/${projectId}/generate-invoice-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed }),
        credentials: "include",
      });
      const data = await res.json();
      if (res.status === 409 && data.needConfirm) {
        return { needConfirm: true, existingCount: data.existingCount };
      }
      if (!res.ok) throw new Error(data.message || "계산서 생성 실패");
      return data;
    },
    onSuccess: (data) => {
      if (data.needConfirm) {
        setShowInvoiceRegenConfirm(true);
        return;
      }
      toast({ title: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices"] });
      setShowInvoiceRegenConfirm(false);
    },
    onError: (err: Error) => {
      toast({ title: "계산서 생성 실패", description: err.message, variant: "destructive" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (status: string) => {
      const res = await apiRequest("PATCH", `/api/projects/${projectId}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "상태가 변경되었습니다" });
    },
    onError: (err: Error) => toast({ title: "상태 변경 실패", description: err.message, variant: "destructive" }),
  });

  const invalidatePayments = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
    queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
    queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices-with-payments"] });
    queryClient.invalidateQueries({ queryKey: ["/api/purchase-invoices-with-payments"] });
  };

  const updatePaymentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, any> }) => {
      const res = await apiRequest("PATCH", `/api/payments/${id}`, data);
      return res.json();
    },
    onSuccess: invalidatePayments,
    onError: (err: Error) => toast({ title: "수정 실패", description: err.message, variant: "destructive" }),
  });

  const createPaymentMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("POST", "/api/payments", data);
      return res.json();
    },
    onSuccess: invalidatePayments,
    onError: (err: Error) => toast({ title: "추가 실패", description: err.message, variant: "destructive" }),
  });

  const deletePaymentMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/payments/${id}`);
      return res.json();
    },
    onSuccess: invalidatePayments,
    onError: (err: Error) => toast({ title: "삭제 실패", description: err.message, variant: "destructive" }),
  });

  const confirmPaymentMutation = useMutation({
    mutationFn: async (data: { id: string; actualDate: string; actualAmount: number; originalAmount: number; remainderAction?: "merge" | "new"; remainderTargetId?: string; remainderNewDescription?: string; remainderPlannedDate?: string; projectId?: string; companyName?: string }) => {
      const res = await apiRequest("POST", `/api/payments/${data.id}/confirm`, data);
      return res.json();
    },
    onSuccess: invalidatePayments,
    onError: (err: Error) => toast({ title: "입금 처리 실패", description: err.message, variant: "destructive" }),
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/projects/${projectId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "프로젝트가 삭제되었습니다" });
      onClose();
    },
    onError: (err: Error) => toast({ title: "삭제 실패", description: err.message, variant: "destructive" }),
  });

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState(0);
  const [editDate, setEditDate] = useState("");
  const [confirmingPaymentId, setConfirmingPaymentId] = useState<string | null>(null);
  const [confirmAmount, setConfirmAmount] = useState(0);
  const [confirmDate, setConfirmDate] = useState("");
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [newPaymentDesc, setNewPaymentDesc] = useState("");
  const [newPaymentAmount, setNewPaymentAmount] = useState(0);
  const [newPaymentDate, setNewPaymentDate] = useState("");
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);
  const [showInvoiceRegenConfirm, setShowInvoiceRegenConfirm] = useState(false);

  const [editingInvoiceDateId, setEditingInvoiceDateId] = useState<string | null>(null);
  const [editInvoiceDate, setEditInvoiceDate] = useState("");
  const updateInvoiceDateMutation = useMutation({
    mutationFn: async ({ id, plannedIssueDate }: { id: string; plannedIssueDate: string | null }) => {
      const res = await apiRequest("PATCH", `/api/sales-invoices/${id}`, { plannedIssueDate });
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] }); },
    onError: (err: Error) => toast({ title: "예정일 변경 실패", description: err.message, variant: "destructive" }),
  });

  const [showPurchasePicker, setShowPurchasePicker] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [stagePicker, setStagePicker] = useState<string | null>(null);
  const [stageSearchTerm, setStageSearchTerm] = useState("");

  const { data: allCustomers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);

  const linkCustomerMutation = useMutation({
    mutationFn: async ({ cid, customerName }: { cid: string | null; customerName?: string }) => {
      const body: Record<string, any> = { customerId: cid };
      if (customerName) body.customerName = customerName;
      const res = await apiRequest("PATCH", `/api/projects/${projectId}`, body);
      return res.json();
    },
    onSuccess: (_data, { cid }) => {
      toast({ title: cid ? "거래처 연결 완료" : "거래처 연결 해제" });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      setShowCustomerPicker(false);
      setCustomerSearch("");
    },
    onError: (err: Error) => toast({ title: "거래처 연결 실패", description: err.message, variant: "destructive" }),
  });

  const filteredCustomers = useMemo(() => {
    if (!allCustomers) return [];
    if (!customerSearch) return allCustomers.slice(0, 10);
    const q = customerSearch.toLowerCase();
    return allCustomers.filter(c =>
      c.companyName.toLowerCase().includes(q) ||
      (c.businessNumber && c.businessNumber.includes(q))
    ).slice(0, 10);
  }, [allCustomers, customerSearch]);

  const stageUnlinkedSales = useMemo(() => {
    if (!allSales || !project) return [];
    return allSales.filter(i => !i.projectId && i.companyName?.toLowerCase().includes(stageSearchTerm.toLowerCase()));
  }, [allSales, project, stageSearchTerm]);

  const unlinkedPurchases = useMemo(() => {
    if (!allPurchases || !project) return [];
    return allPurchases.filter(i => !i.projectId && i.companyName?.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [allPurchases, project, searchTerm]);

  if (isLoading || !project) {
    return (
      <DialogContent className="max-w-2xl">
        <div className="p-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-48 mt-4" /></div>
      </DialogContent>
    );
  }

  const issuedInvoices = project.salesInvoices.filter(i => !!i.issueDate);
  const salesSupplyTotal = issuedInvoices.reduce((s, i) => s + (i.supplyAmount || 0), 0);
  const salesTotalAmount = issuedInvoices.reduce((s, i) => s + (i.totalAmount || 0), 0);
  const purchaseTotal = project.purchaseInvoices.reduce((s, i) => s + (i.totalAmount || 0), 0);
  const incomePayments = project.payments.filter(p => p.type === "income");
  const paidIncome = incomePayments.filter(p => p.status === "completed").reduce((s, p) => s + (p.actualAmount || p.amount || 0), 0);
  const paidIncomeSupply = Math.round(paidIncome / 1.1);
  const plannedIncome = incomePayments.filter(p => p.status !== "completed").reduce((s, p) => s + (p.amount || 0), 0);
  const hasConditions = !!project.totalAmount && project.totalAmount > 0;
  const contractAmount = project.totalAmount || 0;
  const issuedPct = contractAmount > 0 ? Math.min(Math.round((salesSupplyTotal / contractAmount) * 100), 100) : 0;
  const collectedPct = contractAmount > 0 ? Math.min(Math.round((paidIncomeSupply / contractAmount) * 100), 100) : 0;
  const profit = salesTotalAmount - purchaseTotal;

  return (
    <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="modal-project-detail">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <span className="font-mono text-muted-foreground">{project.projectNumber}</span>
          <span>{project.customerName}</span>
          {project.onedriveWebUrl && (
            <a href={project.onedriveWebUrl} target="_blank" rel="noopener noreferrer" className="ml-auto">
              <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </a>
          )}
        </DialogTitle>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-muted-foreground">상태:</span>
          <Select
            value={project.status || "active"}
            onValueChange={(val) => updateStatusMutation.mutate(val)}
            disabled={updateStatusMutation.isPending}
          >
            <SelectTrigger className="h-7 w-[100px] text-xs" data-testid="select-project-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active" data-testid="option-status-active">진행중</SelectItem>
              <SelectItem value="completed" data-testid="option-status-completed">완료</SelectItem>
              <SelectItem value="hold" data-testid="option-status-hold">보류</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => setShowDeleteConfirm(true)} data-testid="button-delete-project">
            <Trash2 className="h-3 w-3 mr-1" />삭제
          </Button>
        </div>
      </DialogHeader>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>프로젝트 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              "{project.projectNumber} {project.customerName}" 프로젝트를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">취소</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteProjectMutation.mutate()} disabled={deleteProjectMutation.isPending} data-testid="button-confirm-delete">
              {deleteProjectMutation.isPending ? "삭제 중..." : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ProjectDescriptionField project={project} />

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="border rounded p-2">
          <div className="text-[10px] text-muted-foreground mb-0.5">등록일자</div>
          <div className="font-medium" data-testid="text-registration-date">{project.registrationDate || "-"}</div>
        </div>
        <div className="border rounded p-2">
          <div className="text-[10px] text-muted-foreground mb-0.5">납품일자</div>
          <div className="font-medium" data-testid="text-delivery-date">{project.deliveryDate || "-"}</div>
        </div>
        <div className="border rounded p-2">
          <div className="text-[10px] text-muted-foreground mb-0.5">완료일자</div>
          <div className="font-medium" data-testid="text-completion-date">{project.completionDate || "-"}</div>
        </div>
      </div>

      <div className="border rounded-lg p-2.5 mt-1" data-testid="section-customer-link">
        {project.customer ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Building2 className="h-3 w-3" />연결된 거래처
              </span>
              <Button size="sm" variant="ghost" className="h-5 text-[10px] px-1.5 text-muted-foreground hover:text-destructive" onClick={() => linkCustomerMutation.mutate({ cid: null })} disabled={linkCustomerMutation.isPending} data-testid="button-unlink-customer">
                <Unlink className="h-3 w-3 mr-0.5" />해제
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
              <div><span className="text-muted-foreground">거래처명:</span> <span className="font-medium">{project.customer.companyName}</span></div>
              <div><span className="text-muted-foreground">사업자번호:</span> <span className="font-medium">{project.customer.businessNumber || "-"}</span></div>
              <div><span className="text-muted-foreground">대표자:</span> <span className="font-medium">{project.customer.representative || "-"}</span></div>
              <div><span className="text-muted-foreground">전화:</span> <PhoneLink value={project.customer.phone} className="font-medium" /></div>
              {project.customer.address && (
                <div className="col-span-2"><span className="text-muted-foreground">주소:</span> <span className="font-medium">{project.customer.address}</span></div>
              )}
            </div>
          </div>
        ) : (
          <div>
            {showCustomerPicker ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Search className="h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="거래처명 또는 사업자번호 검색..."
                    className="h-7 text-xs"
                    value={customerSearch}
                    onChange={e => setCustomerSearch(e.target.value)}
                    autoFocus
                    data-testid="input-customer-search"
                  />
                  <Button size="sm" variant="ghost" className="h-7 px-1.5" onClick={() => { setShowCustomerPicker(false); setCustomerSearch(""); }} data-testid="button-cancel-customer-search">
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="max-h-36 overflow-y-auto border rounded">
                  {!allCustomers ? (
                    <div className="text-xs text-muted-foreground text-center py-2">거래처 목록 로딩중...</div>
                  ) : filteredCustomers.length > 0 ? filteredCustomers.map(c => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between px-2 py-1 hover:bg-muted/50 cursor-pointer text-xs border-b last:border-b-0"
                      onClick={() => linkCustomerMutation.mutate({ cid: c.id, customerName: c.companyName })}
                      data-testid={`option-customer-${c.id}`}
                    >
                      <div>
                        <span className="font-medium">{c.companyName}</span>
                        {c.businessNumber && <span className="text-muted-foreground ml-2">{c.businessNumber}</span>}
                      </div>
                      <Link2 className="h-3 w-3 text-muted-foreground" />
                    </div>
                  )) : (
                    <div className="text-xs text-muted-foreground text-center py-2">검색 결과 없음</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-xs text-orange-600 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />거래처 미연결
                </span>
                <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => setShowCustomerPicker(true)} data-testid="button-link-customer">
                  <Link2 className="h-3 w-3 mr-1" />거래처 연결
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {hasConditions ? (
        <div className="border rounded-lg p-3 mt-2 space-y-2">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-[10px] text-muted-foreground">계약 (공급가액)</div>
              <div className="text-sm font-semibold" data-testid="text-detail-contract">{fmtComma(contractAmount)}원</div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground">발행 (계산서)</div>
              <div className="text-sm font-semibold text-blue-600" data-testid="text-detail-issued">{fmtComma(salesSupplyTotal)}원</div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground">수금 (입금완료)</div>
              <div className="text-sm font-semibold text-green-600" data-testid="text-detail-collected">{fmtComma(paidIncomeSupply)}원</div>
            </div>
          </div>
          <div className="space-y-1.5">
            <div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-0.5">
                <span>발행 진행률</span>
                <span>{issuedPct}% ({fmtComma(salesSupplyTotal)} / {fmtComma(contractAmount)})</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${issuedPct}%` }} data-testid="bar-issued" />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-0.5">
                <span>수금 진행률</span>
                <span>{collectedPct}% ({fmtComma(paidIncomeSupply)} / {fmtComma(contractAmount)})</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${collectedPct}%` }} data-testid="bar-collected" />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between text-[10px] pt-1 border-t">
            <span className="text-muted-foreground">매입: <span className="text-red-600 font-medium">{fmtComma(purchaseTotal)}원</span></span>
            <span className="text-muted-foreground">수익: <span className={`font-medium ${profit >= 0 ? "text-green-600" : "text-orange-600"}`}>{fmtComma(profit)}원</span></span>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3 mt-2">
          <div className="border rounded-lg p-2.5 bg-blue-50/50 dark:bg-blue-900/10">
            <div className="text-[10px] text-muted-foreground">매출</div>
            <div className="text-sm font-semibold text-blue-600" data-testid="text-detail-sales">{fmt(salesTotalAmount)}원</div>
          </div>
          <div className="border rounded-lg p-2.5 bg-red-50/50 dark:bg-red-900/10">
            <div className="text-[10px] text-muted-foreground">매입</div>
            <div className="text-sm font-semibold text-red-600" data-testid="text-detail-purchase">{fmt(purchaseTotal)}원</div>
          </div>
          <div className={`border rounded-lg p-2.5 ${profit >= 0 ? "bg-green-50/50 dark:bg-green-900/10" : "bg-orange-50/50 dark:bg-orange-900/10"}`}>
            <div className="text-[10px] text-muted-foreground">수익</div>
            <div className={`text-sm font-semibold ${profit >= 0 ? "text-green-600" : "text-orange-600"}`} data-testid="text-detail-profit">{fmt(profit)}원</div>
          </div>
        </div>
      )}

      {project.inquiryId && (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1.5 w-fit"
          onClick={() => { window.location.href = `/inquiries?id=${project.inquiryId}`; }}
          data-testid="link-source-inquiry"
        >
          <Link2 className="h-3 w-3" />
          영업건 보기 {(project as any).inquiryNumber ? `(${(project as any).inquiryNumber})` : ""}
        </Button>
      )}

      <Tabs defaultValue="conditions" className="mt-2">
        <TabsList className="w-full grid grid-cols-4 h-8">
          <TabsTrigger value="conditions" className="text-xs" data-testid="tab-conditions">
            <Settings className="h-3 w-3 mr-1" />계약조건
          </TabsTrigger>
          <TabsTrigger value="items" className="text-xs" data-testid="tab-items">
            <Package className="h-3 w-3 mr-1" />품목
          </TabsTrigger>
          <TabsTrigger value="collection" className="text-xs" data-testid="tab-collection">
            <CalendarClock className="h-3 w-3 mr-1" />수금계획
          </TabsTrigger>
          <TabsTrigger value="invoices" className="text-xs" data-testid="tab-invoices">
            <FileText className="h-3 w-3 mr-1" />계산서발행
          </TabsTrigger>
        </TabsList>

        <TabsContent value="conditions" className="mt-2 space-y-3">
          <CollectionConditionsEditor project={project} onSave={() => queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] })} />
        </TabsContent>

        <TabsContent value="items" className="mt-2">
          <ProjectItemsTab projectId={projectId} />
        </TabsContent>

        <TabsContent value="collection" className="mt-2 space-y-3">
        {hasConditions ? (
          <div className="border rounded-lg p-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium flex items-center gap-1"><CalendarClock className="h-3 w-3" />수금 계획 <span className="text-[9px] text-muted-foreground font-normal">(VAT포함 합계 기준)</span></span>
              <div className="flex items-center gap-1">
                {incomePayments.length > 0 ? (
                  <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => setShowRegenConfirm(true)} disabled={genCollectionMutation.isPending} data-testid="button-gen-collection">
                    {genCollectionMutation.isPending ? "생성중..." : "재생성"}
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => genCollectionMutation.mutate()} disabled={genCollectionMutation.isPending} data-testid="button-gen-collection">
                    {genCollectionMutation.isPending ? "생성중..." : "수금 계획 생성"}
                  </Button>
                )}
              </div>
            </div>
            {showRegenConfirm && (() => {
              const plannedCount = incomePayments.filter(p => p.status !== "completed").length;
              const completedCount = incomePayments.filter(p => p.status === "completed").length;
              return (
                <div className="border rounded p-2 bg-orange-50/50 dark:bg-orange-900/10 space-y-1.5">
                  <div className="text-[10px] font-medium text-orange-700 dark:text-orange-400 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />수금 계획 재생성 확인
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    예정 항목 {plannedCount}건이 삭제되고 계약조건에 따라 새로 생성됩니다.
                    {completedCount > 0 && <span className="text-green-600"> 입금완료 {completedCount}건은 유지됩니다.</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="destructive" className="h-6 text-[10px] px-2" data-testid="button-confirm-regen"
                      onClick={() => { genCollectionMutation.mutate(); setShowRegenConfirm(false); }}>
                      재생성
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => setShowRegenConfirm(false)} data-testid="button-cancel-regen">
                      취소
                    </Button>
                  </div>
                </div>
              );
            })()}
            {incomePayments.length > 0 && (
              <div className="border rounded overflow-hidden">
                {incomePayments.map((pay, idx) => {
                  const isEditing = editingPaymentId === pay.id;
                  const isConfirming = confirmingPaymentId === pay.id;
                  const isDone = pay.status === "completed";
                  const amt = isDone && pay.actualAmount ? pay.actualAmount : (pay.amount || 0);
                  const supply = Math.round(amt / 1.1);
                  const vat = amt - supply;
                  const pct = project.totalAmount ? Math.round((supply / project.totalAmount) * 100) : 0;
                  const remainder = isConfirming ? amt - confirmAmount : 0;
                  const nextPending = incomePayments.find((p, i) => i > idx && p.status !== "completed");

                  return (
                    <div key={pay.id} className="border-b last:border-b-0">
                      {isConfirming ? (
                        <div className="p-2 bg-blue-50/50 dark:bg-blue-900/10 space-y-2">
                          <div className="text-[10px] font-medium text-blue-700 dark:text-blue-400">입금 처리: {pay.description}</div>
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="text-[10px] text-muted-foreground">입금일</span>
                            <Input type="date" value={confirmDate} onChange={e => setConfirmDate(e.target.value)} className="h-6 text-xs w-[130px] px-1" data-testid={`input-confirm-date-${pay.id}`} />
                            <span className="text-[10px] text-muted-foreground">입금액</span>
                            <CommaInput value={confirmAmount} onChange={setConfirmAmount} className="h-6 text-xs w-[100px] px-1" data-testid={`input-confirm-amount-${pay.id}`} />
                            <span className="text-[10px] text-muted-foreground">원</span>
                          </div>
                          {confirmAmount > 0 && (
                            <div className="text-[10px] text-muted-foreground">
                              공급 {fmtComma(Math.round(confirmAmount / 1.1))} + VAT {fmtComma(confirmAmount - Math.round(confirmAmount / 1.1))} = {fmtComma(confirmAmount)}원
                              {remainder > 0 && <span className="text-orange-600 ml-2">잔여 {fmtComma(remainder)}원</span>}
                            </div>
                          )}
                          {remainder > 0 && (
                            <div className="flex items-center gap-1 flex-wrap">
                              {nextPending && (
                                <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" data-testid={`button-remainder-next-${pay.id}`}
                                  onClick={() => {
                                    confirmPaymentMutation.mutate({ id: pay.id, actualDate: confirmDate, actualAmount: confirmAmount, originalAmount: amt, remainderAction: "merge", remainderTargetId: nextPending.id });
                                    setConfirmingPaymentId(null);
                                  }}>
                                  잔여 → {nextPending.description}에 합산
                                </Button>
                              )}
                              <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" data-testid={`button-remainder-new-${pay.id}`}
                                onClick={() => {
                                  confirmPaymentMutation.mutate({ id: pay.id, actualDate: confirmDate, actualAmount: confirmAmount, originalAmount: amt, remainderAction: "new", projectId: project.id, companyName: project.customerName || "", remainderNewDescription: `${pay.description} 잔여`, remainderPlannedDate: pay.plannedDate || undefined });
                                  setConfirmingPaymentId(null);
                                }}>
                                잔여 → 새 항목 추가
                              </Button>
                            </div>
                          )}
                          <div className="flex items-center gap-1">
                            {remainder <= 0 && (
                              <Button size="sm" className="h-6 text-[10px] px-2" data-testid={`button-confirm-payment-${pay.id}`}
                                onClick={() => {
                                  confirmPaymentMutation.mutate({ id: pay.id, actualDate: confirmDate, actualAmount: confirmAmount, originalAmount: amt });
                                  setConfirmingPaymentId(null);
                                }}>
                                <Check className="h-3 w-3 mr-0.5" />입금 확인
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => setConfirmingPaymentId(null)} data-testid={`button-cancel-confirm-${pay.id}`}>
                              취소
                            </Button>
                          </div>
                        </div>
                      ) : isEditing ? (
                        <div className="p-2 bg-muted/30 space-y-1.5">
                          <div className="text-[10px] font-medium text-muted-foreground">{isDone ? "입금 내역 수정" : "계획 수정"}: {pay.description}</div>
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="text-[10px] text-muted-foreground">{isDone ? "입금일" : "예정일"}</span>
                            <Input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="h-6 text-xs w-[130px] px-1" data-testid={`input-edit-date-${pay.id}`} />
                            <span className="text-[10px] text-muted-foreground">합계(VAT포함)</span>
                            <CommaInput value={editAmount} onChange={setEditAmount} className="h-6 text-xs w-[100px] px-1" data-testid={`input-edit-amount-${pay.id}`} />
                            <span className="text-[10px] text-muted-foreground">원</span>
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" data-testid={`button-save-payment-${pay.id}`}
                              onClick={() => {
                                const data: Record<string, any> = isDone
                                  ? { actualAmount: editAmount, actualDate: editDate || undefined, amount: editAmount }
                                  : { amount: editAmount, plannedDate: editDate || undefined };
                                updatePaymentMutation.mutate({ id: pay.id, data });
                                setEditingPaymentId(null);
                              }}>
                              <Check className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setEditingPaymentId(null)} data-testid={`button-cancel-edit-${pay.id}`}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                          {editAmount > 0 && (
                            <div className="text-[10px] text-muted-foreground pl-1">
                              공급 {fmtComma(Math.round(editAmount / 1.1))} + VAT {fmtComma(editAmount - Math.round(editAmount / 1.1))} = {fmtComma(editAmount)}원
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="py-1.5 px-2">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{pay.description}</span>
                              <span className="text-[10px] text-muted-foreground">({pct}%)</span>
                              <span className={`text-[10px] px-1 py-0.5 rounded ${isDone ? "text-green-700 bg-green-50 dark:bg-green-900/30" : "text-orange-700 bg-orange-50 dark:bg-orange-900/30"}`}>
                                {isDone ? "입금완료" : "예정"}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              {!isDone && (
                                <Button size="sm" variant="ghost" className="h-5 text-[10px] px-1 text-blue-600" data-testid={`button-confirm-start-${pay.id}`}
                                  onClick={() => { setConfirmingPaymentId(pay.id); setConfirmAmount(pay.amount || 0); setConfirmDate(new Date().toISOString().split("T")[0]); }}>
                                  <Banknote className="h-3 w-3 mr-0.5" />입금처리
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" className="h-5 w-5 p-0" data-testid={`button-edit-payment-${pay.id}`}
                                onClick={() => { setEditingPaymentId(pay.id); setEditAmount(isDone ? (pay.actualAmount || pay.amount || 0) : (pay.amount || 0)); setEditDate(isDone ? (pay.actualDate || pay.plannedDate || "") : (pay.plannedDate || "")); }}>
                                <Pencil className="h-3 w-3" />
                              </Button>
                              {isDone && (
                                <Button size="sm" variant="ghost" className="h-5 text-[10px] px-1 text-orange-600" data-testid={`button-undo-payment-${pay.id}`}
                                  onClick={() => updatePaymentMutation.mutate({ id: pay.id, data: { status: "planned", actualDate: null, actualAmount: null } })}>
                                  <Undo2 className="h-3 w-3 mr-0.5" />입금취소
                                </Button>
                              )}
                              {!isDone && (
                                <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-red-400 hover:text-red-600" data-testid={`button-delete-payment-${pay.id}`}
                                  onClick={() => deletePaymentMutation.mutate(pay.id)}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-[10px] mt-0.5">
                            <span className="text-muted-foreground">{isDone ? `입금 ${pay.actualDate || pay.plannedDate}` : `예정 ${pay.plannedDate || "미정"}`}</span>
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <span>공급 {fmtComma(supply)}</span>
                              <span>VAT {fmtComma(vat)}</span>
                              <span className="text-blue-600 font-medium">{fmtComma(amt)}원</span>
                            </div>
                          </div>
                          {isDone && pay.actualAmount && pay.actualAmount !== pay.amount && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              계획 {fmtComma(pay.amount || 0)}원 → 실제 {fmtComma(pay.actualAmount)}원
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {(() => {
                  const totalAmt = paidIncome + plannedIncome;
                  const totalSupply = Math.round(totalAmt / 1.1);
                  const totalVat = totalAmt - totalSupply;
                  const projectTotal = project.totalAmount ? Math.round(project.totalAmount * 1.1) : 0;
                  const diff = projectTotal - totalAmt;
                  return (
                    <>
                      <div className="flex items-center justify-between text-[10px] py-1.5 px-2 bg-muted/30 font-medium">
                        <span>합계 {project.totalAmount ? `(${Math.round((totalSupply / project.totalAmount) * 100)}%)` : ""}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">공급 {fmtComma(totalSupply)}</span>
                          <span className="text-muted-foreground">VAT {fmtComma(totalVat)}</span>
                          <span className="text-blue-600">{fmtComma(totalAmt)}원</span>
                          <span className="text-muted-foreground ml-1">수금 {fmtComma(paidIncome)} / 예정 {fmtComma(plannedIncome)}</span>
                        </div>
                      </div>
                      {projectTotal > 0 && diff !== 0 && (
                        <div className={`flex items-center justify-between text-[10px] py-1 px-2 ${diff > 0 ? "bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400" : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"}`}>
                          <div className="flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            <span>{diff > 0 ? "미배정" : "초과"} {fmtComma(Math.abs(diff))}원</span>
                          </div>
                          <span className="text-muted-foreground">
                            프로젝트 총액 {fmtComma(projectTotal)}원 (공급 {fmtComma(project.totalAmount || 0)})
                            {diff > 0 && " — 예정 항목 금액을 조정하거나 새 항목을 추가하세요"}
                          </span>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
            {showAddPayment ? (
              <div className="border rounded p-2 space-y-1.5 bg-muted/20">
                <div className="text-[10px] font-medium">수금 항목 추가</div>
                <div className="flex items-center gap-1.5 text-xs">
                  <Input placeholder="내용" value={newPaymentDesc} onChange={e => setNewPaymentDesc(e.target.value)} className="h-6 text-xs w-[120px] px-1" data-testid="input-new-payment-desc" />
                  <Input type="date" value={newPaymentDate} onChange={e => setNewPaymentDate(e.target.value)} className="h-6 text-xs w-[120px] px-1" data-testid="input-new-payment-date" />
                  <CommaInput value={newPaymentAmount} onChange={setNewPaymentAmount} className="h-6 text-xs w-[100px] px-1" data-testid="input-new-payment-amount" />
                  <span className="text-[10px] text-muted-foreground">원</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" className="h-6 text-[10px] px-2" data-testid="button-save-new-payment"
                    disabled={!newPaymentDesc || !newPaymentAmount}
                    onClick={() => {
                      createPaymentMutation.mutate({ type: "income", projectId: project.id, companyName: project.customerName || "", description: newPaymentDesc, amount: newPaymentAmount, plannedDate: newPaymentDate || undefined, status: "planned" });
                      setShowAddPayment(false); setNewPaymentDesc(""); setNewPaymentAmount(0); setNewPaymentDate("");
                    }}>
                    <Check className="h-3 w-3 mr-0.5" />추가
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => setShowAddPayment(false)} data-testid="button-cancel-new-payment">취소</Button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 w-full" onClick={() => setShowAddPayment(true)} data-testid="button-add-payment">
                <Plus className="h-3 w-3 mr-0.5" />수금 항목 추가
              </Button>
            )}
          </div>
        ) : (
          <div className="text-center py-6 text-sm text-muted-foreground">
            <Settings className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
            <p>계약조건을 먼저 설정해주세요.</p>
            <p className="text-[10px] mt-1">계약조건 탭에서 총 금액과 비율을 입력하면 수금 계획을 생성할 수 있습니다.</p>
          </div>
        )}
        </TabsContent>

        <TabsContent value="invoices" className="mt-2 space-y-3">
        {hasConditions ? (
          <>
        {(() => {
          const stages = project.invoicePlan === "bulk"
            ? [{ name: "일괄", ratio: 100 }]
            : [
                { name: "계약금", ratio: project.depositRatio || 0 },
                { name: "중도금", ratio: project.midRatio || 0 },
                { name: "잔금", ratio: project.finalRatio || 0 },
              ].filter(s => s.ratio > 0);

          const linkedTotal = project.salesInvoices.reduce((s, i) => s + (i.supplyAmount || 0), 0);
          const plannedTotal = project.totalAmount!;
          const totalDiff = plannedTotal - linkedTotal;
          const stageNames = new Set(stages.map(s => s.name));
          const today = new Date().toISOString().split("T")[0];
          const otherInvoices = project.salesInvoices.filter(i => !i.invoiceStage || !stageNames.has(i.invoiceStage));

          return (
            <div className="border rounded-lg overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b">
                <span className="text-xs font-medium flex items-center gap-1">
                  <FileText className="h-3 w-3" />계산서 발행 현황
                  <span className="text-[9px] text-muted-foreground font-normal">(공급가액 기준)</span>
                </span>
                <div className="flex items-center gap-1">
                  {project.salesInvoices.length > 0 ? (
                    <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => setShowInvoiceRegenConfirm(true)} disabled={genInvoiceMutation.isPending} data-testid="button-gen-invoice">
                      {genInvoiceMutation.isPending ? "생성중..." : "재생성"}
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => genInvoiceMutation.mutate(false)} disabled={genInvoiceMutation.isPending} data-testid="button-gen-invoice">
                      {genInvoiceMutation.isPending ? "생성중..." : "계산서 생성"}
                    </Button>
                  )}
                </div>
              </div>

              {/* Regen confirm */}
              {showInvoiceRegenConfirm && (
                <div className="border-b p-2 bg-orange-50/50 dark:bg-orange-900/10 space-y-1.5">
                  <div className="text-[10px] font-medium text-orange-700 dark:text-orange-400 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />계산서 재생성 확인
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {(() => {
                      const issued = project.salesInvoices.filter((i: any) => !!i.issueDate).length;
                      const placeholder = project.salesInvoices.filter((i: any) => !i.issueDate).length;
                      if (issued > 0 && placeholder > 0) return `미발행 ${placeholder}건이 삭제되고 새로 생성됩니다. (발행완료 ${issued}건은 유지됩니다)`;
                      if (issued > 0) return `발행완료 ${issued}건은 유지되며, 미발행 스테이지만 새로 생성됩니다.`;
                      return `기존 미발행 계산서 ${placeholder}건이 삭제되고 계약조건에 따라 새로 생성됩니다.`;
                    })()}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="destructive" className="h-6 text-[10px] px-2" data-testid="button-confirm-invoice-regen" onClick={() => genInvoiceMutation.mutate(true)}>재생성</Button>
                    <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => setShowInvoiceRegenConfirm(false)} data-testid="button-cancel-invoice-regen">취소</Button>
                  </div>
                </div>
              )}

              {/* Column headers */}
              <div className="grid grid-cols-[1fr_90px_90px_64px] text-[9px] text-muted-foreground px-3 py-1.5 border-b bg-muted/10">
                <span>구분</span>
                <span className="text-right">계획 (공급)</span>
                <span className="text-right">실적 (공급)</span>
                <span className="text-right">상태</span>
              </div>

              {/* Stage rows */}
              {stages.map(stage => {
                const supply = Math.round(plannedTotal * stage.ratio / 100);
                const stageInvoices = project.salesInvoices.filter(i => i.invoiceStage === stage.name);
                const actualSupply = stageInvoices.reduce((s, i) => s + (i.supplyAmount || 0), 0);
                const stageDiff = supply - actualSupply;
                const isPickerOpen = stagePicker === stage.name;

                return (
                  <div key={stage.name} className="border-b last:border-b-0">
                    {/* Plan row */}
                    <div className="grid grid-cols-[1fr_90px_90px_64px] items-center px-3 py-2 bg-muted/5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium">{stage.name}</span>
                        <span className="text-[9px] text-muted-foreground">({stage.ratio}%)</span>
                        <Button size="sm" variant="ghost" className="h-5 text-[9px] px-1 ml-1" onClick={() => { setStagePicker(isPickerOpen ? null : stage.name); setStageSearchTerm(""); }} data-testid={`button-link-stage-${stage.name}`}>
                          <Plus className="h-2.5 w-2.5 mr-0.5" />연결
                        </Button>
                      </div>
                      <span className="text-[10px] text-right text-muted-foreground">{fmtComma(supply)}</span>
                      <span className={`text-[10px] text-right font-medium ${actualSupply > 0 ? "text-foreground" : "text-muted-foreground/40"}`}>
                        {actualSupply > 0 ? fmtComma(actualSupply) : "-"}
                      </span>
                      <div className="text-right">
                        {stageInvoices.length === 0 ? (
                          <span className="text-[9px] text-muted-foreground/50">미연결</span>
                        ) : stageDiff === 0 ? (
                          <span className="text-[9px] text-green-600 dark:text-green-400 font-medium flex items-center justify-end gap-0.5"><Check className="h-2.5 w-2.5" />일치</span>
                        ) : stageDiff > 0 ? (
                          <span className="text-[9px] text-orange-600 dark:text-orange-400 font-medium">미달</span>
                        ) : (
                          <span className="text-[9px] text-red-600 dark:text-red-400 font-medium">초과</span>
                        )}
                      </div>
                    </div>

                    {/* Invoice picker */}
                    {isPickerOpen && (
                      <div className="px-3 py-2 bg-muted/10 border-t space-y-1">
                        <Input placeholder="거래처/품목 검색..." value={stageSearchTerm} onChange={e => setStageSearchTerm(e.target.value)} className="h-6 text-xs" data-testid={`input-stage-search-${stage.name}`} />
                        <div className="max-h-28 overflow-y-auto space-y-0.5">
                          {stageUnlinkedSales.slice(0, 15).map(inv => (
                            <div key={inv.id} className="flex items-center justify-between text-[10px] py-1 px-1 hover:bg-muted rounded cursor-pointer" onClick={() => { linkMutation.mutate({ type: "sales", invoiceId: inv.id, link: true, invoiceStage: stage.name }); setStagePicker(null); }} data-testid={`link-stage-${stage.name}-${inv.id}`}>
                              <span className="truncate">{inv.issueDate || (inv.plannedIssueDate ? `예정 ${inv.plannedIssueDate}` : "미발행")} {inv.companyName} {inv.item ? `(${inv.item})` : ""}</span>
                              <span className="text-blue-600 ml-2 whitespace-nowrap">공급 {fmtComma(inv.supplyAmount || 0)}</span>
                            </div>
                          ))}
                          {stageUnlinkedSales.length === 0 && <div className="text-[10px] text-muted-foreground py-1">연결 가능한 계산서가 없습니다</div>}
                        </div>
                      </div>
                    )}

                    {/* Actual invoices */}
                    {stageInvoices.map(inv => {
                      const isIssued = !!inv.issueDate;
                      const isPastDue = !isIssued && inv.plannedIssueDate && inv.plannedIssueDate < today;
                      const isEditingDate = editingInvoiceDateId === inv.id;
                      return (
                        <div key={inv.id} className={`text-[10px] py-1.5 px-4 border-t flex items-center justify-between gap-2 ${isIssued ? "bg-green-50/40 dark:bg-green-900/10" : isPastDue ? "bg-red-50/40 dark:bg-red-900/10" : "bg-white/20 dark:bg-white/5"}`}>
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <span className={`px-1 py-0.5 rounded text-[9px] font-medium whitespace-nowrap ${isIssued ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400" : isPastDue ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400" : "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400"}`}>
                              {isIssued ? "발행완료" : isPastDue ? "지연" : "미발행"}
                            </span>
                            {isIssued ? (
                              <span className="text-green-700 dark:text-green-400 whitespace-nowrap">{inv.issueDate}</span>
                            ) : isEditingDate ? (
                              <div className="flex items-center gap-1">
                                <Input type="date" value={editInvoiceDate} onChange={e => setEditInvoiceDate(e.target.value)} className="h-5 text-[10px] w-[110px] px-1" data-testid={`input-invoice-date-${inv.id}`} />
                                <Button size="sm" variant="ghost" className="h-5 w-5 p-0" data-testid={`button-save-invoice-date-${inv.id}`} onClick={() => { updateInvoiceDateMutation.mutate({ id: inv.id, plannedIssueDate: editInvoiceDate || null }); setEditingInvoiceDateId(null); }}><Check className="h-2.5 w-2.5" /></Button>
                                <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => setEditingInvoiceDateId(null)} data-testid={`button-cancel-invoice-date-${inv.id}`}><X className="h-2.5 w-2.5" /></Button>
                              </div>
                            ) : (
                              <span className={`cursor-pointer hover:underline whitespace-nowrap ${isPastDue ? "text-red-600 dark:text-red-400 font-medium" : inv.plannedIssueDate ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground"}`} onClick={() => { setEditingInvoiceDateId(inv.id); setEditInvoiceDate(inv.plannedIssueDate || ""); }} data-testid={`text-invoice-date-${inv.id}`}>
                                {inv.plannedIssueDate ? `예정 ${inv.plannedIssueDate}` : "예정일 미정"}
                              </span>
                            )}
                            <span className="truncate text-muted-foreground">{inv.companyName}</span>
                            {inv.item && <span className="text-muted-foreground/60 truncate hidden md:inline">({inv.item})</span>}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-blue-600 dark:text-blue-400 font-medium whitespace-nowrap">공급 {fmtComma(inv.supplyAmount || 0)}원</span>
                            <Button size="sm" variant="ghost" className="h-4 w-4 p-0" onClick={() => linkMutation.mutate({ type: "sales", invoiceId: inv.id, link: false })} data-testid={`unlink-stage-${inv.id}`}>
                              <X className="h-2.5 w-2.5 text-muted-foreground" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {/* 기타: invoices linked to project but no stage */}
              {otherInvoices.length > 0 && (
                <div className="border-t">
                  <div className="px-3 py-1.5 bg-muted/10 text-[9px] text-muted-foreground font-medium">기타 연결 계산서</div>
                  {otherInvoices.map(inv => {
                    const isIssued = !!inv.issueDate;
                    const isPastDue = !isIssued && inv.plannedIssueDate && inv.plannedIssueDate < today;
                    return (
                      <div key={inv.id} className={`text-[10px] py-1.5 px-4 border-t flex items-center justify-between gap-2 ${isIssued ? "bg-green-50/40 dark:bg-green-900/10" : isPastDue ? "bg-red-50/40 dark:bg-red-900/10" : "bg-white/20 dark:bg-white/5"}`}>
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`px-1 py-0.5 rounded text-[9px] font-medium whitespace-nowrap ${isIssued ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400" : isPastDue ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400" : "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400"}`}>
                            {isIssued ? "발행완료" : isPastDue ? "지연" : "미발행"}
                          </span>
                          <span className="text-muted-foreground whitespace-nowrap">{isIssued ? inv.issueDate : inv.plannedIssueDate ? `예정 ${inv.plannedIssueDate}` : "예정일 미정"}</span>
                          <span className="truncate">{inv.companyName}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-blue-600 dark:text-blue-400 font-medium whitespace-nowrap">공급 {fmtComma(inv.supplyAmount || 0)}원</span>
                          <Button size="sm" variant="ghost" className="h-4 w-4 p-0" onClick={() => linkMutation.mutate({ type: "sales", invoiceId: inv.id, link: false })} data-testid={`unlink-other-${inv.id}`}>
                            <X className="h-2.5 w-2.5 text-muted-foreground" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Footer totals */}
              <div className="grid grid-cols-[1fr_90px_90px_64px] items-center px-3 py-2 bg-muted/20 border-t text-[10px]">
                <span className="text-muted-foreground font-medium">합계</span>
                <span className="text-right text-muted-foreground">{fmtComma(plannedTotal)}</span>
                <span className="text-right font-medium">{fmtComma(linkedTotal)}</span>
                <div className="text-right">
                  {totalDiff === 0 ? (
                    <span className="text-green-600 dark:text-green-400 font-medium flex items-center justify-end gap-0.5"><Check className="h-3 w-3" />일치</span>
                  ) : totalDiff > 0 ? (
                    <span className="text-orange-600 dark:text-orange-400 font-medium">미달</span>
                  ) : (
                    <span className="text-red-600 dark:text-red-400 font-medium">초과</span>
                  )}
                </div>
              </div>
              {totalDiff !== 0 && (
                <div className="px-3 pb-2 text-[9px] text-muted-foreground text-right">
                  {totalDiff > 0 ? `미발행 잔액: 공급 ${fmtComma(totalDiff)}원` : `초과 공급: ${fmtComma(Math.abs(totalDiff))}원`}
                </div>
              )}
            </div>
          );
        })()}


        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium flex items-center gap-1"><ReceiptText className="h-3 w-3" />매입계산서 ({project.purchaseInvoices.length})</span>
            <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => { setShowPurchasePicker(!showPurchasePicker); setSearchTerm(""); }} data-testid="button-add-purchase-invoice">
              <Plus className="h-3 w-3 mr-0.5" />연결
            </Button>
          </div>
          {showPurchasePicker && (
            <div className="border rounded p-2 mb-2 bg-muted/30 space-y-1">
              <Input placeholder="거래처 검색..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="h-7 text-xs" data-testid="input-search-purchase" />
              <div className="max-h-32 overflow-y-auto space-y-0.5">
                {unlinkedPurchases.slice(0, 20).map(inv => (
                  <div key={inv.id} className="flex items-center justify-between text-xs py-1 px-1 hover:bg-muted rounded cursor-pointer" onClick={() => linkMutation.mutate({ type: "purchase", invoiceId: inv.id, link: true })} data-testid={`link-purchase-${inv.id}`}>
                    <span className="truncate">{inv.issueDate} {inv.companyName}</span>
                    <span className="text-red-600 ml-2 whitespace-nowrap">{(inv.totalAmount || 0).toLocaleString()}</span>
                  </div>
                ))}
                {unlinkedPurchases.length === 0 && <div className="text-[10px] text-muted-foreground py-1">연결 가능한 계산서가 없습니다</div>}
              </div>
            </div>
          )}
          {project.purchaseInvoices.length > 0 ? (
            <div className="border rounded overflow-hidden">
              {project.purchaseInvoices.map(inv => (
                <div key={inv.id} className="flex items-center justify-between text-xs py-1.5 px-2 border-b last:border-b-0 hover:bg-muted/30">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-muted-foreground whitespace-nowrap">{inv.issueDate}</span>
                    <span className="font-medium truncate">{inv.companyName}</span>
                    {inv.item && <span className="text-muted-foreground truncate hidden md:inline">({inv.item})</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-red-600 font-medium whitespace-nowrap">{(inv.totalAmount || 0).toLocaleString()}</span>
                    <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => linkMutation.mutate({ type: "purchase", invoiceId: inv.id, link: false })} data-testid={`unlink-purchase-${inv.id}`}>
                      <X className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[10px] text-muted-foreground py-2">연결된 매입계산서가 없습니다</div>
          )}
        </div>

        {project.payments.filter(p => p.type !== "income").length > 0 && (
          <div>
            <span className="text-xs font-medium flex items-center gap-1 mb-1"><Wallet className="h-3 w-3" />지출현황 ({project.payments.filter(p => p.type !== "income").length})</span>
            <div className="border rounded overflow-hidden">
              {project.payments.filter(p => p.type !== "income").map(pay => (
                <div key={pay.id} className="flex items-center justify-between text-xs py-1.5 px-2 border-b last:border-b-0">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{pay.plannedDate || "미정"}</span>
                    <span>{pay.companyName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-red-600">{(pay.amount || 0).toLocaleString()}</span>
                    <span className={`text-[10px] px-1 py-0.5 rounded ${pay.status === "completed" ? "text-green-700 bg-green-50" : "text-orange-700 bg-orange-50"}`}>
                      {pay.status === "completed" ? "완료" : "예정"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        </>
        ) : (
          <div className="text-center py-6 text-sm text-muted-foreground">
            <Settings className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
            <p>계약조건을 먼저 설정해주세요.</p>
            <p className="text-[10px] mt-1">계약조건 탭에서 총 금액과 비율을 입력하면 계산서 발행 계획을 생성할 수 있습니다.</p>
          </div>
        )}
        </TabsContent>
      </Tabs>

      <ProjectTaskSection projectId={projectId} />
    </DialogContent>
  );
}

function ProjectTaskSection({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const [newContent, setNewContent] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [taskType, setTaskType] = useState<"todo" | "schedule">("todo");
  const [staffId, setStaffId] = useState("");

  const { data: staffList = [] } = useQuery<any[]>({
    queryKey: ["/api/staff"],
  });

  const { data: companySettings } = useQuery<any>({
    queryKey: ["/api/company-settings"],
  });

  useEffect(() => {
    if (companySettings?.projectDefaultStaffId) {
      setStaffId(companySettings.projectDefaultStaffId);
    }
  }, [companySettings?.projectDefaultStaffId]);

  const { data: tasks = [], isLoading } = useQuery<any[]>({
    queryKey: [`/api/projects/${projectId}/tasks`],
  });

  const createMutation = useMutation({
    mutationFn: (data: { content: string; dueDate?: string; dueTime?: string; taskType?: string; staffId?: string }) =>
      apiRequest("POST", `/api/projects/${projectId}/tasks`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/tasks`] });
      queryClient.invalidateQueries({ queryKey: ["/api/project-tasks/pending"] });
      setNewContent("");
      setDueDate("");
      setDueTime("");
      setStaffId(companySettings?.projectDefaultStaffId || "");
    },
    onError: () => toast({ title: "할일 추가 실패", variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      apiRequest("PATCH", `/api/project-tasks/${id}`, { completed }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/tasks`] });
      queryClient.invalidateQueries({ queryKey: ["/api/project-tasks/pending"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/project-tasks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/tasks`] });
      queryClient.invalidateQueries({ queryKey: ["/api/project-tasks/pending"] });
    },
  });

  const invalidateTaskCaches = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/tasks`] });
    queryClient.invalidateQueries({ queryKey: ["/api/project-tasks/pending"] });
    queryClient.invalidateQueries({ queryKey: ["/api/tasks/pending"] });
  };

  const syncTaskMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/project-tasks/${id}/sync-calendar`, {});
      return res.json();
    },
    onSuccess: () => {
      invalidateTaskCaches();
      toast({ title: "캘린더에 등록되었습니다" });
    },
    onError: (err: Error) => {
      toast({ title: "캘린더 등록 실패", description: err.message, variant: "destructive" });
    },
  });

  const syncAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/tasks/sync-calendar", {});
      return res.json();
    },
    onSuccess: (data: { synced: number; failed: number; total: number }) => {
      invalidateTaskCaches();
      if (data.synced > 0) {
        toast({ title: `${data.synced}건 캘린더 등록 완료` });
      } else {
        toast({ title: "등록할 항목이 없습니다" });
      }
    },
    onError: (err: Error) => {
      toast({ title: "캘린더 동기화 실패", description: err.message, variant: "destructive" });
    },
  });

  const pendingTasks = tasks.filter((t: any) => !t.completed);
  const completedTasks = tasks.filter((t: any) => t.completed);
  const unsyncedCount = pendingTasks.filter((t: any) => t.dueDate && !t.calendarEventId).length;

  const isOverdue = (d: string | null) => {
    if (!d) return false;
    return d < new Date().toISOString().split("T")[0];
  };

  return (
    <div className="border rounded-lg p-2.5 mt-2" data-testid="section-project-tasks">
      <div className="flex items-center gap-1.5 mb-2">
        <Check className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">할일</span>
        {pendingTasks.length > 0 && (
          <span className="text-[10px] bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400 px-1.5 rounded-full">{pendingTasks.length}</span>
        )}
        <div className="ml-auto">
          <Button
            variant="ghost"
            size="sm"
            className="h-5 text-[9px] gap-0.5 px-1.5"
            onClick={() => syncAllMutation.mutate()}
            disabled={syncAllMutation.isPending}
            data-testid="button-sync-calendar-project-tasks"
          >
            <RefreshCw className={`h-2.5 w-2.5 ${syncAllMutation.isPending ? "animate-spin" : ""}`} />
            캘린더
            {unsyncedCount > 0 && <span className="bg-orange-100 text-orange-600 px-1 rounded-full">{unsyncedCount}</span>}
          </Button>
        </div>
      </div>
      <div className="flex gap-1.5 mb-2">
        <div className="flex shrink-0">
          <Button
            size="sm"
            variant={taskType === "todo" ? "default" : "outline"}
            className="h-7 px-1.5 rounded-r-none text-[10px] gap-0.5"
            onClick={() => setTaskType("todo")}
            data-testid="button-project-task-type-todo"
          >
            <ListTodo className="h-3 w-3" />
            할일
          </Button>
          <Button
            size="sm"
            variant={taskType === "schedule" ? "default" : "outline"}
            className="h-7 px-1.5 rounded-l-none text-[10px] gap-0.5 border-l-0"
            onClick={() => setTaskType("schedule")}
            data-testid="button-project-task-type-schedule"
          >
            <CalendarDays className="h-3 w-3" />
            일정
          </Button>
        </div>
        <Input
          placeholder={taskType === "todo" ? "할일 입력..." : "일정 입력..."}
          value={newContent}
          onChange={e => setNewContent(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && newContent.trim()) {
              createMutation.mutate({ content: newContent.trim(), dueDate: dueDate || undefined, dueTime: dueTime || undefined, taskType, staffId: staffId || undefined });
            }
          }}
          className="h-7 text-xs"
          data-testid="input-project-task-content"
        />
        <Select value={staffId || "none"} onValueChange={v => setStaffId(v === "none" ? "" : v)}>
          <SelectTrigger className="h-7 text-[10px] w-[80px] shrink-0" data-testid="select-project-task-staff">
            <SelectValue placeholder="담당" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">담당자</SelectItem>
            {staffList.map((s: any) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={dueDate}
          onChange={e => setDueDate(e.target.value)}
          className="h-7 text-[10px] w-[120px] shrink-0"
          data-testid="input-project-task-due-date"
        />
        <Input
          type="time"
          value={dueTime}
          onChange={e => setDueTime(e.target.value)}
          className="h-7 text-[10px] w-[90px] shrink-0"
          data-testid="input-project-task-due-time"
        />
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 shrink-0"
          disabled={!newContent.trim() || createMutation.isPending}
          onClick={() => createMutation.mutate({ content: newContent.trim(), dueDate: dueDate || undefined, dueTime: dueTime || undefined, taskType, staffId: staffId || undefined })}
          data-testid="button-add-project-task"
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-12" />
      ) : (
        <div className="space-y-0.5">
          {pendingTasks.map((task: any) => (
            <div key={task.id} className="flex items-center gap-1.5 group py-0.5" data-testid={`project-task-${task.id}`}>
              <button
                className="shrink-0 w-3.5 h-3.5 rounded border border-muted-foreground/40 hover:border-cyan-500 flex items-center justify-center"
                onClick={() => toggleMutation.mutate({ id: task.id, completed: true })}
                data-testid={`button-toggle-project-task-${task.id}`}
              />
              {task.taskType === "schedule" ? (
                <CalendarDays className="h-3 w-3 shrink-0 text-blue-500" />
              ) : (
                <ListTodo className="h-3 w-3 shrink-0 text-muted-foreground" />
              )}
              <span className="text-xs flex-1 min-w-0 truncate">{task.content}</span>
              {task.staffId && (
                <span className="text-[9px] shrink-0 px-1 py-0.5 rounded bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" data-testid={`text-project-task-staff-${task.id}`}>
                  {staffList.find((s: any) => s.id === task.staffId)?.name || ""}
                </span>
              )}
              {task.dueDate && (
                <span className={`text-[10px] shrink-0 inline-flex items-center gap-0.5 ${isOverdue(task.dueDate) ? "text-red-500 font-medium" : "text-muted-foreground"}`}>
                  <button
                    onClick={() => syncTaskMutation.mutate(task.id)}
                    disabled={syncTaskMutation.isPending}
                    title={task.calendarEventId ? "캘린더 등록됨 (클릭 시 갱신)" : "캘린더 미등록 (클릭 시 등록)"}
                    data-testid={`button-sync-project-task-${task.id}`}
                  >
                    <CalendarDays className={`h-3 w-3 ${task.calendarEventId ? "text-green-500" : "text-muted-foreground/40 hover:text-orange-500"}`} />
                  </button>
                  {task.dueDate}{task.dueTime ? ` ${task.dueTime}` : ""}
                </span>
              )}
              <button
                className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => deleteMutation.mutate(task.id)}
                data-testid={`button-delete-project-task-${task.id}`}
              >
                <X className="h-3 w-3 text-muted-foreground hover:text-red-500" />
              </button>
            </div>
          ))}
          {completedTasks.map((task: any) => (
            <div key={task.id} className="flex items-center gap-1.5 group py-0.5 opacity-50" data-testid={`project-task-${task.id}`}>
              <button
                className="shrink-0 w-3.5 h-3.5 rounded border border-green-500 bg-green-500 flex items-center justify-center"
                onClick={() => toggleMutation.mutate({ id: task.id, completed: false })}
                data-testid={`button-toggle-project-task-${task.id}`}
              >
                <Check className="h-2.5 w-2.5 text-white" />
              </button>
              {task.taskType === "schedule" ? (
                <CalendarDays className="h-3 w-3 shrink-0 text-blue-500" />
              ) : (
                <ListTodo className="h-3 w-3 shrink-0 text-muted-foreground" />
              )}
              <span className="text-xs flex-1 min-w-0 truncate line-through">{task.content}</span>
              {task.staffId && (
                <span className="text-[9px] shrink-0 px-1 py-0.5 rounded bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                  {staffList.find((s: any) => s.id === task.staffId)?.name || ""}
                </span>
              )}
              {task.dueDate && (
                <span className="text-[10px] shrink-0 text-muted-foreground">{task.dueDate}{task.dueTime ? ` ${task.dueTime}` : ""}</span>
              )}
              <button
                className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => deleteMutation.mutate(task.id)}
                data-testid={`button-delete-project-task-${task.id}`}
              >
                <X className="h-3 w-3 text-muted-foreground hover:text-red-500" />
              </button>
            </div>
          ))}
          {tasks.length === 0 && (
            <div className="text-[10px] text-muted-foreground py-2 text-center">등록된 할일이 없습니다</div>
          )}
        </div>
      )}
    </div>
  );
}

type UnlinkedSuggestion = {
  id: string;
  projectNumber: string | null;
  customerName: string | null;
  year: number | null;
  candidates: { id: string; companyName: string; businessNumber: string | null; score: number }[];
};

function BulkMatchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [selections, setSelections] = useState<Record<string, string | null>>({});
  const [customerSearches, setCustomerSearches] = useState<Record<string, string>>({});
  const [expandedSearch, setExpandedSearch] = useState<string | null>(null);

  const { data: suggestions, isLoading, refetch } = useQuery<UnlinkedSuggestion[]>({
    queryKey: ["/api/projects/unlinked-suggestions"],
    enabled: open,
    queryFn: async () => {
      const res = await fetch("/api/projects/unlinked-suggestions");
      return res.json();
    },
  });

  const { data: allCustomers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    enabled: open,
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      const pairs = Object.entries(selections).filter(([, cid]) => cid);
      for (const [projectId, customerId] of pairs) {
        await apiRequest("PATCH", `/api/projects/${projectId}`, { customerId });
      }
      return pairs.length;
    },
    onSuccess: (count) => {
      toast({ title: `${count}건 거래처 연결 완료` });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects/unlinked-suggestions"] });
      setSelections({});
      refetch();
    },
    onError: (err: Error) => toast({ title: "연결 실패", description: err.message, variant: "destructive" }),
  });

  const filteredForSearch = (projectId: string) => {
    if (!allCustomers) return [];
    const q = (customerSearches[projectId] || "").toLowerCase();
    if (!q) return allCustomers.slice(0, 8);
    return allCustomers.filter(c =>
      c.companyName.toLowerCase().includes(q) || (c.businessNumber && c.businessNumber.includes(q))
    ).slice(0, 8);
  };

  const selectedCount = Object.values(selections).filter(Boolean).length;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="dialog-bulk-match">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            거래처 일괄 매칭
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}
          </div>
        ) : !suggestions || suggestions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Check className="h-10 w-10 mx-auto mb-2 text-green-500 opacity-70" />
            <p className="text-sm">모든 프로젝트가 거래처에 연결되어 있습니다.</p>
          </div>
        ) : (
          <>
            <div className="text-xs text-muted-foreground mb-2">
              거래처 미연결 프로젝트 {suggestions.length}건 — 각 프로젝트에 연결할 거래처를 선택하세요.
            </div>
            <div className="space-y-2">
              {suggestions.map(proj => {
                const selectedCid = selections[proj.id];
                const selectedCustomer = allCustomers?.find(c => c.id === selectedCid);
                const isExpanded = expandedSearch === proj.id;

                return (
                  <div key={proj.id} className={`border rounded-lg p-2.5 text-xs transition-colors ${selectedCid ? "border-green-300 bg-green-50/40 dark:bg-green-900/10" : ""}`} data-testid={`row-bulk-match-${proj.id}`}>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-muted-foreground">{proj.projectNumber || "-"}</span>
                        <span className="font-semibold">{proj.customerName}</span>
                        {proj.year && <span className="text-muted-foreground">({proj.year}년)</span>}
                      </div>
                      {selectedCid ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-5 text-[10px] px-1.5 text-muted-foreground hover:text-destructive"
                          onClick={() => setSelections(s => { const n = { ...s }; delete n[proj.id]; return n; })}
                          data-testid={`button-clear-selection-${proj.id}`}
                        >
                          <X className="h-3 w-3 mr-0.5" />해제
                        </Button>
                      ) : null}
                    </div>

                    {selectedCustomer ? (
                      <div className="flex items-center gap-1.5 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded px-2 py-1">
                        <Check className="h-3 w-3 shrink-0" />
                        <span className="font-medium">{selectedCustomer.companyName}</span>
                        {selectedCustomer.businessNumber && <span className="text-muted-foreground">{selectedCustomer.businessNumber}</span>}
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {proj.candidates.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {proj.candidates.map(c => (
                              <button
                                key={c.id}
                                className="inline-flex items-center gap-1 border rounded px-1.5 py-0.5 hover:bg-blue-50 hover:border-blue-300 dark:hover:bg-blue-900/20 text-[10px] transition-colors"
                                onClick={() => { setSelections(s => ({ ...s, [proj.id]: c.id })); setExpandedSearch(null); }}
                                data-testid={`button-candidate-${proj.id}-${c.id}`}
                              >
                                <span className="font-medium">{c.companyName}</span>
                                {c.businessNumber && <span className="text-muted-foreground">{c.businessNumber}</span>}
                              </button>
                            ))}
                          </div>
                        )}
                        {isExpanded ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1">
                              <Input
                                className="h-6 text-xs"
                                placeholder="거래처 검색..."
                                value={customerSearches[proj.id] || ""}
                                onChange={e => setCustomerSearches(s => ({ ...s, [proj.id]: e.target.value }))}
                                autoFocus
                                data-testid={`input-customer-search-${proj.id}`}
                              />
                              <Button size="sm" variant="ghost" className="h-6 px-1.5" onClick={() => setExpandedSearch(null)}>
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                            <div className="border rounded max-h-28 overflow-y-auto">
                              {filteredForSearch(proj.id).map(c => (
                                <div
                                  key={c.id}
                                  className="flex items-center justify-between px-2 py-1 hover:bg-muted/50 cursor-pointer border-b last:border-b-0"
                                  onClick={() => { setSelections(s => ({ ...s, [proj.id]: c.id })); setExpandedSearch(null); setCustomerSearches(s => ({ ...s, [proj.id]: "" })); }}
                                  data-testid={`option-search-${proj.id}-${c.id}`}
                                >
                                  <span className="font-medium">{c.companyName}</span>
                                  {c.businessNumber && <span className="text-muted-foreground ml-2">{c.businessNumber}</span>}
                                </div>
                              ))}
                              {filteredForSearch(proj.id).length === 0 && (
                                <div className="text-center text-muted-foreground py-2 text-[10px]">검색 결과 없음</div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-5 text-[10px] px-1.5 text-muted-foreground"
                            onClick={() => setExpandedSearch(proj.id)}
                            data-testid={`button-search-customer-${proj.id}`}
                          >
                            <Search className="h-3 w-3 mr-0.5" />직접 검색
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-xs text-muted-foreground">{selectedCount}건 선택됨</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={onClose} data-testid="button-bulk-match-cancel">취소</Button>
                <Button
                  size="sm"
                  disabled={selectedCount === 0 || applyMutation.isPending}
                  onClick={() => applyMutation.mutate()}
                  data-testid="button-bulk-match-apply"
                >
                  {applyMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
                  {selectedCount}건 연결 적용
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function ProjectList() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const urlParams = new URLSearchParams(searchString);

  const hasAnyParam = urlParams.has("year") || urlParams.has("status") || urlParams.has("view");
  const viewFilter = urlParams.get("view") || (!hasAnyParam ? "current" : "");
  const yearFilter = urlParams.get("year") || "all";
  const statusFilter = urlParams.get("status") || "all";

  const now = new Date();
  const currentYear = now.getFullYear();

  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showBulkMatch, setShowBulkMatch] = useState(false);

  const queryYear = viewFilter === "current" ? currentYear : (yearFilter !== "all" ? parseInt(yearFilter) : undefined);

  const { data: years, isLoading: yearsLoading } = useQuery<number[]>({
    queryKey: ["/api/projects/years"],
  });

  const { data: projects, isLoading } = useQuery<EnrichedProject[]>({
    queryKey: ["/api/projects", queryYear ?? "all"],
    queryFn: async () => {
      const url = queryYear ? `/api/projects?year=${queryYear}` : "/api/projects";
      const res = await fetch(url);
      return res.json();
    },
  });

  const handleQuickView = (view: string) => {
    if (view === "current") {
      navigate("/projects?view=current");
    } else if (view === "all") {
      navigate("/projects?view=all");
    } else if (view === "active") {
      navigate("/projects?view=all&status=active");
    } else if (view === "completed") {
      navigate("/projects?view=all&status=completed");
    }
  };

  const handleYearChange = (value: string) => {
    const params = new URLSearchParams();
    if (value === "all") {
      params.set("view", "all");
    } else {
      params.set("year", value);
    }
    if (statusFilter !== "all") params.set("status", statusFilter);
    navigate(`/projects?${params.toString()}`);
  };

  const handleStatusChange = (value: string) => {
    const params = new URLSearchParams(searchString);
    params.delete("view");
    if (!params.has("year")) params.set("view", "all");
    if (value === "all") {
      params.delete("status");
    } else {
      params.set("status", value);
    }
    navigate(`/projects?${params.toString()}`);
  };

  const activeQuickView = useMemo(() => {
    if (viewFilter === "current") return "current";
    if (viewFilter === "all" && statusFilter === "all") return "all";
    if (statusFilter === "active" && (viewFilter === "all" || yearFilter === "all")) return "active";
    if (statusFilter === "completed" && (viewFilter === "all" || yearFilter === "all")) return "completed";
    return "";
  }, [viewFilter, statusFilter, yearFilter]);

  const activeYearSelectValue = viewFilter === "current" ? String(currentYear) : yearFilter;

  const syncYear = queryYear || currentYear;
  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/projects/sync?year=${syncYear}`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "동기화 완료", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    },
    onError: (err: Error) => {
      toast({ title: "동기화 실패", description: err.message, variant: "destructive" });
    },
  });

  const autoMatchMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/projects/auto-match-customers");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "거래처 매칭 완료", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    },
    onError: (err: Error) => {
      toast({ title: "매칭 실패", description: err.message, variant: "destructive" });
    },
  });

  const statusLabel = (status: string | null) => {
    switch (status) {
      case "active": return { text: "진행중", className: "text-blue-700 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-400" };
      case "completed": return { text: "완료", className: "text-green-700 bg-green-50 dark:bg-green-900/30 dark:text-green-400" };
      case "hold": return { text: "보류", className: "text-orange-700 bg-orange-50 dark:bg-orange-900/30 dark:text-orange-400" };
      default: return { text: status || "진행중", className: "text-gray-700 bg-gray-50 dark:bg-gray-900/30 dark:text-gray-400" };
    }
  };

  const filteredProjects = useMemo(() => {
    if (!projects) return [];
    let result = projects;
    if (statusFilter !== "all") {
      result = result.filter(p => (p.status || "active") === statusFilter);
    }
    if (search.trim()) {
      const term = search.trim().toLowerCase();
      result = result.filter(p =>
        (p.projectNumber || "").toLowerCase().includes(term) ||
        (p.customerName || "").toLowerCase().includes(term) ||
        (p.description || "").toLowerCase().includes(term)
      );
    }
    result = [...result];
    result.sort((a, b) => {
      const dateA = a.registrationDate || "";
      const dateB = b.registrationDate || "";
      return dateB.localeCompare(dateA);
    });
    return result;
  }, [projects, statusFilter, search]);

  const totals = useMemo(() => {
    if (!filteredProjects.length) return { contract: 0, issued: 0, collected: 0, purchase: 0, profit: 0 };
    return {
      contract: filteredProjects.reduce((s, p) => s + (p.totalAmount || 0), 0),
      issued: filteredProjects.reduce((s, p) => s + (p.salesSupplyTotal || 0), 0),
      collected: filteredProjects.reduce((s, p) => s + Math.round((p.paidIncome || 0) / 1.1), 0),
      purchase: filteredProjects.reduce((s, p) => s + p.purchaseTotal, 0),
      profit: filteredProjects.reduce((s, p) => s + p.profit, 0),
    };
  }, [filteredProjects]);

  return (
    <div className="p-6 space-y-4 overflow-auto h-full">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-semibold" data-testid="text-project-list-title">프로젝트</h1>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowBulkMatch(true)}
            data-testid="button-bulk-match"
          >
            <Users className="h-4 w-4 mr-1" />
            일괄 매칭
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => autoMatchMutation.mutate()}
            disabled={autoMatchMutation.isPending}
            data-testid="button-auto-match"
          >
            <Users className={`h-4 w-4 mr-1 ${autoMatchMutation.isPending ? "animate-spin" : ""}`} />
            자동 매칭
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            data-testid="button-sync-projects"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            {syncYear}년 동기화
          </Button>
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap" data-testid="quick-view-buttons">
        {[
          { key: "current", label: `${currentYear}년` },
          { key: "all", label: "전체보기" },
          { key: "active", label: "진행중" },
          { key: "completed", label: "완료" },
        ].map(({ key, label }) => (
          <Button
            key={key}
            variant={activeQuickView === key ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => handleQuickView(key)}
            data-testid={`button-quick-${key}`}
          >
            {label}
          </Button>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="프로젝트번호, 고객사, 내용 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search"
          />
        </div>
        {yearsLoading ? (
          <Skeleton className="h-9 w-32" />
        ) : (
          <Select value={activeYearSelectValue} onValueChange={handleYearChange}>
            <SelectTrigger className="w-32" data-testid="select-project-year">
              <SelectValue placeholder="연도" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 연도</SelectItem>
              {(years || []).map(y => (
                <SelectItem key={y} value={String(y)}>{y}년</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={statusFilter} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-32" data-testid="select-project-status">
            <SelectValue placeholder="상태" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 상태</SelectItem>
            <SelectItem value="active">진행중</SelectItem>
            <SelectItem value="completed">완료</SelectItem>
            <SelectItem value="hold">보류</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filteredProjects.length > 0 && (
        <div className="grid grid-cols-5 gap-2">
          <div className="border rounded-lg p-2.5">
            <div className="text-[10px] text-muted-foreground">계약</div>
            <div className="text-sm font-semibold" data-testid="text-total-contract">{fmt(totals.contract)}원</div>
          </div>
          <div className="border rounded-lg p-2.5 bg-blue-50/50 dark:bg-blue-900/10">
            <div className="text-[10px] text-muted-foreground">발행</div>
            <div className="text-sm font-semibold text-blue-600" data-testid="text-total-issued">{fmt(totals.issued)}원</div>
          </div>
          <div className="border rounded-lg p-2.5 bg-green-50/50 dark:bg-green-900/10">
            <div className="text-[10px] text-muted-foreground">수금</div>
            <div className="text-sm font-semibold text-green-600" data-testid="text-total-collected">{fmt(totals.collected)}원</div>
          </div>
          <div className="border rounded-lg p-2.5 bg-red-50/50 dark:bg-red-900/10">
            <div className="text-[10px] text-muted-foreground">매입</div>
            <div className="text-sm font-semibold text-red-600" data-testid="text-total-purchase">{fmt(totals.purchase)}원</div>
          </div>
          <div className={`border rounded-lg p-2.5 ${totals.profit >= 0 ? "bg-green-50/50 dark:bg-green-900/10" : "bg-orange-50/50 dark:bg-orange-900/10"}`}>
            <div className="text-[10px] text-muted-foreground">수익</div>
            <div className={`text-sm font-semibold ${totals.profit >= 0 ? "text-green-600" : "text-orange-600"}`} data-testid="text-total-profit">{fmt(totals.profit)}원</div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10" />)}</div>
      ) : filteredProjects.length > 0 ? (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left py-2 px-3 font-medium text-xs w-20">번호</th>
                <th className="text-left py-2 px-3 font-medium text-xs">고객사</th>
                <th className="text-left py-2 px-3 font-medium text-xs hidden md:table-cell">내용</th>
                <th className="text-center py-2 px-3 font-medium text-xs hidden md:table-cell w-24">등록일</th>
                <th className="text-right py-2 px-3 font-medium text-xs hidden md:table-cell w-20">계약</th>
                <th className="text-right py-2 px-3 font-medium text-xs hidden md:table-cell w-20">발행</th>
                <th className="text-right py-2 px-3 font-medium text-xs hidden md:table-cell w-20">수금</th>
                <th className="text-center py-2 px-3 font-medium text-xs w-14">상태</th>
                <th className="text-center py-2 px-3 font-medium text-xs w-10">폴더</th>
              </tr>
            </thead>
            <tbody>
              {filteredProjects.map(p => {
                const status = statusLabel(p.status);
                return (
                  <tr
                    key={p.id}
                    className="border-b last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => setSelectedId(p.id)}
                    data-testid={`row-project-${p.id}`}
                  >
                    <td className="py-2 px-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-mono font-medium" data-testid={`text-project-number-${p.id}`}>{p.projectNumber || "-"}</span>
                        {p.inquiryNumber && (
                          <button
                            type="button"
                            className="text-[10px] text-blue-500 hover:text-blue-700 hover:underline text-left font-mono"
                            onClick={e => { e.stopPropagation(); window.location.href = `/inquiries?id=${p.inquiryId}`; }}
                          >
                            {p.inquiryNumber}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1">
                        {p.customerId ? (
                          <Check className="h-3 w-3 text-green-500 shrink-0" />
                        ) : (
                          <AlertTriangle className="h-3 w-3 text-orange-400 shrink-0" />
                        )}
                        <span className="text-sm font-medium" data-testid={`text-project-customer-${p.id}`}>{p.customerName || "-"}</span>
                      </div>
                    </td>
                    <td className="py-2 px-3 hidden md:table-cell">
                      <span className="text-xs text-muted-foreground truncate block max-w-[200px]" data-testid={`text-project-desc-${p.id}`}>{p.description || "-"}</span>
                    </td>
                    <td className="py-2 px-3 text-center hidden md:table-cell">
                      <span className="text-xs text-muted-foreground" data-testid={`text-project-regdate-${p.id}`}>{p.registrationDate || "-"}</span>
                    </td>
                    <td className="py-2 px-3 text-right hidden md:table-cell">
                      {(p.totalAmount || 0) > 0 ? (
                        <span className="text-xs font-medium">{(p.totalAmount || 0).toLocaleString()}</span>
                      ) : <span className="text-xs text-muted-foreground">-</span>}
                    </td>
                    <td className="py-2 px-3 text-right hidden md:table-cell">
                      {(p.salesSupplyTotal || 0) > 0 ? (
                        <span className="text-xs font-medium text-blue-600">{(p.salesSupplyTotal || 0).toLocaleString()}</span>
                      ) : <span className="text-xs text-muted-foreground">-</span>}
                    </td>
                    <td className="py-2 px-3 text-right hidden md:table-cell">
                      {(p.paidIncome || 0) > 0 ? (
                        <span className="text-xs font-medium text-green-600">{Math.round((p.paidIncome || 0) / 1.1).toLocaleString()}</span>
                      ) : <span className="text-xs text-muted-foreground">-</span>}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${status.className}`} data-testid={`text-project-status-${p.id}`}>
                        {status.text}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-center">
                      {p.onedriveWebUrl ? (
                        <a
                          href={p.onedriveWebUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          data-testid={`link-project-folder-${p.id}`}
                        >
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                        </a>
                      ) : (
                        <FolderOpen className="h-3.5 w-3.5 text-muted-foreground/30" />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <FolderOpen className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p>{search ? "검색 결과가 없습니다" : "프로젝트가 없습니다. \"동기화\" 버튼을 눌러 OneDrive에서 가져오세요."}</p>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        {filteredProjects.length > 0 && `${filteredProjects.length}건${projects && filteredProjects.length !== projects.length ? ` (전체 ${projects.length}건)` : ""}`}
      </div>

      <Dialog open={!!selectedId} onOpenChange={open => { if (!open) setSelectedId(null); }}>
        {selectedId && <ProjectDetailModal projectId={selectedId} onClose={() => setSelectedId(null)} />}
      </Dialog>

      <BulkMatchDialog open={showBulkMatch} onClose={() => setShowBulkMatch(false)} />
    </div>
  );
}
