import { useQuery, useMutation } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { FileText, Plus, Search, Trash2, RefreshCw, Download, Calendar, Wallet, Check, CircleDot, Clock, CircleCheck, CircleMinus, Pencil, X, Save, Undo2, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { SalesInvoice, Customer, Payment, Project } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SalesInvoiceWithPayment = SalesInvoice & {
  paymentStatus: "none" | "planned" | "partial" | "completed";
  paidAmount: number;
  plannedAmount: number;
  remainingAmount: number;
  paymentCount: number;
  completedCount: number;
  nextPaymentDate: string | null;
};

function formatAmount(amount: number | null | undefined) {
  if (!amount && amount !== 0) return "-";
  return amount.toLocaleString() + "원";
}

function PaymentStatusBadge({ inv }: { inv: SalesInvoiceWithPayment }) {
  const { paymentStatus, paidAmount, remainingAmount, paymentCount, completedCount, nextPaymentDate } = inv;

  if (paymentStatus === "none") {
    return <Badge variant="outline" className="text-muted-foreground border-muted-foreground/30" data-testid={`badge-payment-none-${inv.id}`}><CircleMinus className="h-3 w-3 mr-1" />미설정</Badge>;
  }
  if (paymentStatus === "completed") {
    return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0" data-testid={`badge-payment-completed-${inv.id}`}><CircleCheck className="h-3 w-3 mr-1" />입금완료</Badge>;
  }
  if (paymentStatus === "partial") {
    return (
      <div className="flex flex-col gap-0.5" data-testid={`badge-payment-partial-${inv.id}`}>
        <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-0">
          <CircleDot className="h-3 w-3 mr-1" />{completedCount}/{paymentCount}회 입금
        </Badge>
        <span className="text-[10px] text-muted-foreground">입금 {paidAmount.toLocaleString()} / 잔액 {remainingAmount.toLocaleString()}</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-0.5" data-testid={`badge-payment-planned-${inv.id}`}>
      <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-0">
        <Clock className="h-3 w-3 mr-1" />입금계획{paymentCount > 1 ? ` (${paymentCount}회)` : ""}
      </Badge>
      {nextPaymentDate && <span className="text-[10px] text-muted-foreground">예정 {nextPaymentDate}</span>}
    </div>
  );
}

function PaymentRow({ payment, onUpdate, onDelete, onComplete, onUncomplete }: { payment: Payment; onUpdate: (id: string, data: Record<string, any>) => void; onDelete: (id: string) => void; onComplete: (id: string) => void; onUncomplete: (id: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({
    plannedDate: payment.plannedDate || "",
    amount: String(payment.amount || 0),
    actualDate: payment.actualDate || "",
    actualAmount: String(payment.actualAmount || ""),
  });

  const isCompleted = payment.status === "completed";

  const handleSave = () => {
    const patch: Record<string, any> = {
      plannedDate: editData.plannedDate || null,
      amount: editData.amount ? parseInt(editData.amount) : 0,
    };
    if (isCompleted) {
      if (editData.actualDate) {
        patch.actualDate = editData.actualDate;
        patch.actualAmount = editData.actualAmount ? parseInt(editData.actualAmount) : 0;
        patch.status = "completed";
      } else {
        patch.actualDate = null;
        patch.actualAmount = null;
        patch.status = "planned";
      }
    }
    onUpdate(payment.id, patch);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="border rounded px-2 py-2 space-y-2 bg-muted/20" data-testid={`payment-edit-${payment.id}`}>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px] text-muted-foreground">예정일</Label>
            <Input type="date" className="h-7 text-xs" value={editData.plannedDate} onChange={e => setEditData(p => ({ ...p, plannedDate: e.target.value }))} data-testid={`input-planned-date-${payment.id}`} />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">예정금액</Label>
            <Input type="number" className="h-7 text-xs" value={editData.amount} onChange={e => setEditData(p => ({ ...p, amount: e.target.value }))} data-testid={`input-amount-${payment.id}`} />
          </div>
        </div>
        {isCompleted && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px] text-muted-foreground">실제지급일</Label>
            <Input type="date" className="h-7 text-xs" value={editData.actualDate} onChange={e => setEditData(p => ({ ...p, actualDate: e.target.value }))} data-testid={`input-actual-date-${payment.id}`} />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">실제금액</Label>
            <Input type="number" className="h-7 text-xs" value={editData.actualAmount} onChange={e => setEditData(p => ({ ...p, actualAmount: e.target.value }))} data-testid={`input-actual-amount-${payment.id}`} />
          </div>
        </div>
        )}
        <div className="flex items-center gap-1 justify-end">
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)} data-testid={`button-cancel-edit-${payment.id}`}>
            <X className="h-3 w-3 mr-1" />취소
          </Button>
          <Button size="sm" onClick={handleSave} data-testid={`button-save-edit-${payment.id}`}>
            <Save className="h-3 w-3 mr-1" />저장
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between text-xs border rounded px-2 py-1.5" data-testid={`payment-row-${payment.id}`}>
      <div className="flex items-center gap-2">
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${isCompleted ? "bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400" : "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"}`}>
          {isCompleted ? "완료" : "예정"}
        </span>
        <span>{payment.plannedDate || "미정"}</span>
        {payment.splitTotal && payment.splitTotal > 1 && <span className="text-muted-foreground">({payment.splitIndex}/{payment.splitTotal})</span>}
      </div>
      <div className="flex items-center gap-2">
        <span className="font-medium">{formatAmount(payment.amount)}</span>
        {payment.actualDate && <span className="text-green-600 dark:text-green-400">→ {formatAmount(payment.actualAmount)} ({payment.actualDate})</span>}
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditData({ plannedDate: payment.plannedDate || "", amount: String(payment.amount || 0), actualDate: payment.actualDate || "", actualAmount: String(payment.actualAmount || "") }); setEditing(true); }} data-testid={`button-edit-${payment.id}`}>
            <Pencil className="h-3 w-3" />
          </Button>
          {!isCompleted && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onComplete(payment.id)} data-testid={`button-complete-${payment.id}`}>
              <Check className="h-3 w-3" />
            </Button>
          )}
          {isCompleted && (
            <Button variant="ghost" size="icon" className="h-6 w-6 text-orange-500" onClick={() => onUncomplete(payment.id)} data-testid={`button-uncomplete-${payment.id}`} title="완료 취소">
              <Undo2 className="h-3 w-3" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => onDelete(payment.id)} data-testid={`button-delete-payment-${payment.id}`}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function PaymentSection({ invoiceId, type }: { invoiceId: string; type: "income" | "expense" }) {
  const { toast } = useToast();
  const [showGenerate, setShowGenerate] = useState(false);
  const [genForm, setGenForm] = useState({ paymentMethod: "end_of_next_month", splitCount: "1" });

  const invalidateKeys = type === "expense"
    ? ["/api/purchase-invoices-with-payments"]
    : ["/api/sales-invoices-with-payments"];

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
    queryClient.invalidateQueries({ queryKey: ["/api/payments/by-invoice", type, invoiceId] });
    invalidateKeys.forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
  };

  const { data: existingPayments } = useQuery<Payment[]>({
    queryKey: ["/api/payments/by-invoice", type, invoiceId],
    queryFn: async () => {
      const res = await fetch(`/api/payments/by-invoice?type=${type}&invoiceId=${invoiceId}`);
      return res.json();
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/payments/auto-generate", {
        invoiceId,
        type,
        paymentMethod: genForm.paymentMethod,
        splitCount: parseInt(genForm.splitCount) || 1,
      });
      return res.json();
    },
    onSuccess: (data) => {
      invalidateAll();
      setShowGenerate(false);
      toast({ title: "결제 계획 생성 완료", description: `${data.created}건 생성` });
    },
    onError: (err: Error) => {
      toast({ title: "생성 실패", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, any> }) => {
      const res = await apiRequest("PATCH", `/api/payments/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: "결제 계획이 수정되었습니다" });
    },
    onError: (err: Error) => {
      toast({ title: "수정 실패", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/payments/${id}`);
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: "결제 계획이 삭제되었습니다" });
    },
    onError: (err: Error) => {
      toast({ title: "삭제 실패", description: err.message, variant: "destructive" });
    },
  });

  const completeMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      const today = new Date().toISOString().split("T")[0];
      const payment = existingPayments?.find(p => p.id === paymentId);
      const res = await apiRequest("PATCH", `/api/payments/${paymentId}`, {
        actualDate: today,
        actualAmount: payment?.amount || 0,
        status: "completed",
      });
      return res.json();
    },
    onSuccess: () => {
      invalidateAll();
    },
  });

  const uncompleteMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      const res = await apiRequest("PATCH", `/api/payments/${paymentId}`, {
        status: "planned",
        actualDate: null,
        actualAmount: null,
      });
      return res.json();
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: "완료가 취소되었습니다" });
    },
  });

  return (
    <div className="border-t pt-3 mt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium flex items-center gap-1">
          <Wallet className="h-4 w-4" />결제 계획
        </span>
        <Button variant="outline" size="sm" onClick={() => setShowGenerate(!showGenerate)} data-testid="button-generate-payments">
          <Plus className="h-3 w-3 mr-1" />생성
        </Button>
      </div>

      {showGenerate && (
        <div className="border rounded-lg p-3 mb-2 space-y-2 bg-muted/30">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">결제방법</Label>
              <Select value={genForm.paymentMethod} onValueChange={val => setGenForm(p => ({ ...p, paymentMethod: val }))}>
                <SelectTrigger className="h-7 text-xs" data-testid="select-gen-method"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="end_of_next_month">익월말</SelectItem>
                  <SelectItem value="end_of_month">월말</SelectItem>
                  <SelectItem value="specific_date">일자지정</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">분할 횟수</Label>
              <Input type="number" min="1" max="12" className="h-7 text-xs" value={genForm.splitCount} onChange={e => setGenForm(p => ({ ...p, splitCount: e.target.value }))} data-testid="input-split-count" />
            </div>
          </div>
          <Button size="sm" className="w-full text-xs" onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending} data-testid="button-confirm-generate">
            {generateMutation.isPending ? "생성 중..." : "결제 계획 생성"}
          </Button>
        </div>
      )}

      {existingPayments && existingPayments.length > 0 ? (
        <div className="space-y-1">
          {existingPayments.map(p => (
            <PaymentRow
              key={p.id}
              payment={p}
              onUpdate={(id, data) => updateMutation.mutate({ id, data })}
              onDelete={(id) => deleteMutation.mutate(id)}
              onComplete={(id) => completeMutation.mutate(id)}
              onUncomplete={(id) => uncompleteMutation.mutate(id)}
            />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">등록된 결제 계획이 없습니다.</p>
      )}
    </div>
  );
}

export function InvoiceDetailModal({ invoiceId, onClose }: { invoiceId: string; onClose: () => void }) {
  const { toast } = useToast();
  const { data: invoice } = useQuery<SalesInvoice>({
    queryKey: ["/api/sales-invoices", invoiceId],
  });
  const { data: customers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });
  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const updateMutation = useMutation({
    mutationFn: async (patch: Record<string, any>) => {
      const res = await apiRequest("PATCH", `/api/sales-invoices/${invoiceId}`, patch);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices-with-payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices", invoiceId] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    },
    onError: (err: Error) => {
      toast({ title: "저장 실패", description: err.message, variant: "destructive" });
    },
  });

  const projectLinkMutation = useMutation({
    mutationFn: async (projectId: string | null) => {
      const res = await apiRequest("PATCH", `/api/sales-invoices/${invoiceId}`, { projectId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices-with-payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices", invoiceId] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    },
    onError: (err: Error) => {
      toast({ title: "프로젝트 연결 실패", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/sales-invoices/${invoiceId}`);
    },
    onSuccess: () => {
      toast({ title: "삭제 완료" });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices-with-payments"] });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "삭제 실패", description: err.message, variant: "destructive" });
    },
  });

  const handleSave = (field: string) => {
    if (!invoice) return;
    const numFields = ["quantity", "unitPrice", "supplyAmount", "taxAmount", "totalAmount"];
    const newVal = numFields.includes(field) ? (editValue ? parseInt(editValue) : null) : (editValue || null);
    updateMutation.mutate({ [field]: newVal });
    setEditing(null);
  };

  const renderField = (label: string, field: string, value: string) => (
    <>
      <span className="text-muted-foreground">{label}</span>
      {editing === field ? (
        <Input
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          className="h-7 text-sm"
          autoFocus
          onKeyDown={e => { if (e.key === "Enter") handleSave(field); if (e.key === "Escape") setEditing(null); }}
          onBlur={() => handleSave(field)}
        />
      ) : (
        <span
          className="cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 min-h-[1.5rem] inline-block"
          onClick={() => { setEditing(field); setEditValue(value); }}
        >
          {value || <span className="text-muted-foreground">클릭하여 입력</span>}
        </span>
      )}
    </>
  );

  if (!invoice) {
    return <DialogContent className="max-w-2xl"><Skeleton className="h-48" /></DialogContent>;
  }

  const customerName = customers?.find(c => c.id === invoice.customerId)?.companyName || "-";
  const linkedProject = projects?.find(p => p.id === invoice.projectId);

  return (
    <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="modal-sales-invoice-detail">
      <DialogHeader>
        <div className="flex items-center justify-between pr-8">
          <DialogTitle>매출계산서 상세</DialogTitle>
          <Button variant="destructive" size="sm" onClick={() => { if (confirm("삭제하시겠습니까?")) deleteMutation.mutate(); }} disabled={deleteMutation.isPending} data-testid="button-delete-sales-invoice">
            <Trash2 className="h-4 w-4" /><span>삭제</span>
          </Button>
        </div>
      </DialogHeader>
      <p className="text-xs text-muted-foreground">각 항목을 클릭하면 바로 수정할 수 있습니다</p>
      {(!invoice.issueDate || invoice.invoiceStage) && (
        <div className="flex items-center gap-2 flex-wrap">
          {!invoice.issueDate && (
            <Badge variant="outline" className="text-amber-600 border-amber-300 dark:text-amber-400 dark:border-amber-700" data-testid="badge-detail-unissued">
              미발행
            </Badge>
          )}
          {invoice.invoiceStage && (
            <Badge variant="secondary" data-testid="badge-detail-stage">
              {invoice.invoiceStage}
            </Badge>
          )}
          {invoice.plannedIssueDate && !invoice.issueDate && (
            <Badge variant="outline" className="text-muted-foreground text-[10px]" data-testid="badge-detail-planned-date">
              발행예정일: {invoice.plannedIssueDate}
            </Badge>
          )}
        </div>
      )}
      <div className="grid grid-cols-[100px_1fr] gap-y-2 gap-x-2 text-sm items-center">
        <span className="text-muted-foreground">고객사</span>
        <Select value={invoice.customerId || ""} onValueChange={val => updateMutation.mutate({ customerId: val || null })}>
          <SelectTrigger className="h-7 text-sm"><SelectValue placeholder="고객사 선택" /></SelectTrigger>
          <SelectContent>
            {(customers || []).map(c => <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground text-xs">(현재: {customerName})</span>
        <span></span>
        <span className="text-muted-foreground">프로젝트</span>
        <div className="flex items-center gap-1">
          <Select value={invoice.projectId || "__none__"} onValueChange={val => projectLinkMutation.mutate(val === "__none__" ? null : val)}>
            <SelectTrigger className="h-7 text-sm" data-testid="select-project-link"><SelectValue placeholder="프로젝트 선택" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">연결 안함</SelectItem>
              {(projects || []).map(p => <SelectItem key={p.id} value={p.id}>{p.projectNumber} {p.customerName}{p.description ? ` - ${p.description}` : ""}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {linkedProject && (
          <>
            <span className="text-muted-foreground text-xs">(현재: {linkedProject.projectNumber} {linkedProject.customerName})</span>
            <span></span>
          </>
        )}
        {renderField("상호", "companyName", invoice.companyName || "")}
        {renderField("사업자번호", "businessNumber", invoice.businessNumber || "")}
        {renderField("대표자", "representative", invoice.representative || "")}
        {renderField("주소", "address", invoice.address || "")}
        {renderField("작성일자", "writeDate", invoice.writeDate || "")}
        {renderField("발급일자", "issueDate", invoice.issueDate || "")}
        {renderField("계산서번호", "invoiceNumber", invoice.invoiceNumber || "")}
        {renderField("품목", "item", invoice.item || "")}
        {renderField("수량", "quantity", String(invoice.quantity || ""))}
        {renderField("단가", "unitPrice", String(invoice.unitPrice || ""))}
        {renderField("공급가액", "supplyAmount", String(invoice.supplyAmount || ""))}
        {renderField("세액", "taxAmount", String(invoice.taxAmount || ""))}
        {renderField("합계", "totalAmount", String(invoice.totalAmount || ""))}
        {renderField("이메일1", "email1", invoice.email1 || "")}
        {renderField("이메일2", "email2", invoice.email2 || "")}
        {renderField("메모", "memo", invoice.memo || "")}
      </div>
      <PaymentSection invoiceId={invoiceId} type="income" />
    </DialogContent>
  );
}

export default function SalesInvoiceList() {
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [importYear, setImportYear] = useState("");
  const [filterYear, setFilterYear] = useState<string>("all");
  const [periodType, setPeriodType] = useState<string>("all");
  const [periodValue, setPeriodValue] = useState<string>("all");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [issueStatusFilter, setIssueStatusFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [newInvoice, setNewInvoice] = useState({ customerId: "", invoiceNumber: "", issueDate: "", item: "", supplyAmount: "", taxAmount: "" });

  const { data: invoices, isLoading } = useQuery<SalesInvoiceWithPayment[]>({
    queryKey: ["/api/sales-invoices-with-payments"],
  });
  const { data: customers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });
  const { data: invoiceYears } = useQuery<number[]>({
    queryKey: ["/api/invoice-years"],
  });
  const { data: allProjects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const projectMap = useMemo(() => {
    const map = new Map<string, Project>();
    allProjects?.forEach(p => map.set(p.id, p));
    return map;
  }, [allProjects]);

  const customerMap = useMemo(() => {
    const map = new Map<string, string>();
    customers?.forEach(c => map.set(c.id, c.companyName));
    return map;
  }, [customers]);

  const availableYears = useMemo(() => {
    if (!invoices) return [];
    const years = new Set<number>();
    invoices.forEach(inv => {
      const d = inv.issueDate || inv.plannedIssueDate;
      if (d) {
        const y = parseInt(d.substring(0, 4));
        if (!isNaN(y)) years.add(y);
      }
      if (inv.year) years.add(inv.year);
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [invoices]);

  const filtered = useMemo(() => {
    if (!invoices) return [];
    let list = invoices;

    if (issueStatusFilter === "issued") {
      list = list.filter(inv => !!inv.issueDate);
    } else if (issueStatusFilter === "unissued") {
      list = list.filter(inv => !inv.issueDate);
    }

    if (dateFrom || dateTo) {
      list = list.filter(inv => {
        const d = inv.issueDate || inv.plannedIssueDate;
        if (!d) return false;
        if (dateFrom && d < dateFrom) return false;
        if (dateTo && d > dateTo) return false;
        return true;
      });
    } else if (filterYear !== "all") {
      const y = filterYear;
      list = list.filter(inv => {
        const d = inv.issueDate || inv.plannedIssueDate;
        return d?.startsWith(y) || (inv.year && String(inv.year) === y);
      });

      if (periodType === "monthly" && periodValue !== "all") {
        const m = periodValue.padStart(2, "0");
        list = list.filter(inv => {
          const d = inv.issueDate || inv.plannedIssueDate;
          return d?.substring(5, 7) === m;
        });
      } else if (periodType === "quarterly" && periodValue !== "all") {
        const q = parseInt(periodValue);
        const startMonth = (q - 1) * 3 + 1;
        const endMonth = startMonth + 2;
        list = list.filter(inv => {
          const d = inv.issueDate || inv.plannedIssueDate;
          const month = parseInt(d?.substring(5, 7) || "0");
          return month >= startMonth && month <= endMonth;
        });
      }
    }

    if (paymentFilter !== "all") {
      list = list.filter(inv => inv.paymentStatus === paymentFilter);
    }

    if (search) {
      const s = search.toLowerCase();
      list = list.filter(inv =>
        (inv.companyName && inv.companyName.toLowerCase().includes(s)) ||
        (inv.item && inv.item.toLowerCase().includes(s)) ||
        (inv.invoiceNumber && inv.invoiceNumber.toLowerCase().includes(s)) ||
        (inv.businessNumber && inv.businessNumber.includes(s)) ||
        (inv.customerId && customerMap.get(inv.customerId)?.toLowerCase().includes(s)) ||
        (inv.invoiceStage && inv.invoiceStage.toLowerCase().includes(s))
      );
    }

    return list;
  }, [invoices, search, customerMap, filterYear, periodType, periodValue, paymentFilter, issueStatusFilter, dateFrom, dateTo]);

  const totals = useMemo(() => {
    let supply = 0, tax = 0, total = 0;
    filtered.forEach(inv => {
      supply += inv.supplyAmount || 0;
      tax += inv.taxAmount || 0;
      total += inv.totalAmount || 0;
    });
    return { supply, tax, total };
  }, [filtered]);

  const importMutation = useMutation({
    mutationFn: async (year: number) => {
      const res = await apiRequest("POST", "/api/sales-invoices/import-onedrive", { year });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices-with-payments"] });
      const parts = [`${data.imported}건 추가`];
      if (data.matched > 0) parts.push(`${data.matched}건 예정→발행 매칭`);
      if (data.updated > 0) parts.push(`${data.updated}건 업데이트`);
      parts.push(`${data.skipped}건 변경없음`);
      toast({ title: "가져오기 완료", description: `${parts.join(", ")} (총 ${data.total}건)` });
    },
    onError: (err: Error) => {
      toast({ title: "가져오기 실패", description: err.message, variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const data: any = {
        customerId: newInvoice.customerId || null,
        invoiceNumber: newInvoice.invoiceNumber || null,
        issueDate: newInvoice.issueDate || null,
        item: newInvoice.item || null,
        supplyAmount: newInvoice.supplyAmount ? parseInt(newInvoice.supplyAmount) : null,
        taxAmount: newInvoice.taxAmount ? parseInt(newInvoice.taxAmount) : null,
        totalAmount: (newInvoice.supplyAmount ? parseInt(newInvoice.supplyAmount) : 0) + (newInvoice.taxAmount ? parseInt(newInvoice.taxAmount) : 0) || null,
      };
      const res = await apiRequest("POST", "/api/sales-invoices", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices-with-payments"] });
      setShowAdd(false);
      setNewInvoice({ customerId: "", invoiceNumber: "", issueDate: "", item: "", supplyAmount: "", taxAmount: "" });
      toast({ title: "매출계산서가 등록되었습니다" });
    },
    onError: (err: Error) => {
      toast({ title: "등록 실패", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="p-6 space-y-4 overflow-auto h-full">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-semibold" data-testid="text-sales-invoice-title">매출계산서</h1>
        <div className="flex items-center gap-2">
          <Select value={importYear} onValueChange={setImportYear}>
            <SelectTrigger className="w-28" data-testid="select-import-year-sales">
              <SelectValue placeholder="연도 선택" />
            </SelectTrigger>
            <SelectContent>
              {(invoiceYears || []).map(y => <SelectItem key={y} value={String(y)}>{y}년</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { if (importYear) importMutation.mutate(parseInt(importYear)); }}
            disabled={!importYear || importMutation.isPending}
            data-testid="button-import-sales"
          >
            {importMutation.isPending ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
            {importMutation.isPending ? "가져오는 중..." : "OneDrive에서 가져오기"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              if (!importYear) { toast({ title: "연도를 먼저 선택해주세요", variant: "destructive" }); return; }
              try {
                const res = await fetch(`/api/sales-invoices/excel-url?year=${importYear}`);
                if (!res.ok) { const err = await res.json(); toast({ title: "파일 열기 실패", description: err.message, variant: "destructive" }); return; }
                const { webUrl } = await res.json();
                window.open(webUrl, "_blank");
              } catch (e: any) {
                toast({ title: "파일 열기 실패", description: e.message, variant: "destructive" });
              }
            }}
            disabled={!importYear}
            data-testid="button-open-sales-excel"
          >
            <ExternalLink className="h-4 w-4 mr-1" />엑셀 열기
          </Button>
          <Button size="sm" onClick={() => setShowAdd(true)} data-testid="button-add-sales-invoice">
            <Plus className="h-4 w-4 mr-1" />추가
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Select value={filterYear} onValueChange={v => { setFilterYear(v); setPeriodValue("all"); setDateFrom(""); setDateTo(""); }}>
            <SelectTrigger className="w-24" data-testid="select-filter-year-sales">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              {availableYears.map(y => <SelectItem key={y} value={String(y)}>{y}년</SelectItem>)}
            </SelectContent>
          </Select>
          {filterYear !== "all" && (
            <Select value={periodType} onValueChange={v => { setPeriodType(v); setPeriodValue("all"); }}>
              <SelectTrigger className="w-24" data-testid="select-period-type-sales">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">연간</SelectItem>
                <SelectItem value="quarterly">분기별</SelectItem>
                <SelectItem value="monthly">월별</SelectItem>
              </SelectContent>
            </Select>
          )}
          {filterYear !== "all" && periodType === "quarterly" && (
            <Select value={periodValue} onValueChange={setPeriodValue}>
              <SelectTrigger className="w-24" data-testid="select-quarter-sales">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="1">1분기</SelectItem>
                <SelectItem value="2">2분기</SelectItem>
                <SelectItem value="3">3분기</SelectItem>
                <SelectItem value="4">4분기</SelectItem>
              </SelectContent>
            </Select>
          )}
          {filterYear !== "all" && periodType === "monthly" && (
            <Select value={periodValue} onValueChange={setPeriodValue}>
              <SelectTrigger className="w-20" data-testid="select-month-sales">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <SelectItem key={m} value={String(m)}>{m}월</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span>기간</span>
          <Input type="date" className="h-8 w-[130px] text-xs" value={dateFrom} onChange={e => { setDateFrom(e.target.value); if (e.target.value) { setFilterYear("all"); setPeriodType("all"); setPeriodValue("all"); } }} data-testid="input-date-from-sales" />
          <span>~</span>
          <Input type="date" className="h-8 w-[130px] text-xs" value={dateTo} onChange={e => { setDateTo(e.target.value); if (e.target.value) { setFilterYear("all"); setPeriodType("all"); setPeriodValue("all"); } }} data-testid="input-date-to-sales" />
          {(dateFrom || dateTo) && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setDateFrom(""); setDateTo(""); }} data-testid="button-clear-date-sales">
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="상호, 품목, 사업자번호 검색" className="pl-9" data-testid="input-search-sales-invoices" />
        </div>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1.5" data-testid="issue-status-filter-tabs">
          <FileText className="h-4 w-4 text-muted-foreground mr-1" />
          {[
            { value: "all", label: "전체" },
            { value: "issued", label: "발행" },
            { value: "unissued", label: "미발행" },
          ].map(opt => (
            <Button
              key={opt.value}
              variant={issueStatusFilter === opt.value ? "default" : "outline"}
              size="sm"
              className="text-xs"
              onClick={() => setIssueStatusFilter(opt.value)}
              data-testid={`filter-issue-${opt.value}`}
            >
              {opt.label}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1.5" data-testid="payment-filter-tabs-sales">
          <Wallet className="h-4 w-4 text-muted-foreground mr-1" />
          {[
            { value: "all", label: "전체" },
            { value: "none", label: "미설정" },
            { value: "planned", label: "입금계획" },
            { value: "partial", label: "일부입금" },
            { value: "completed", label: "입금완료" },
          ].map(opt => (
            <Button
              key={opt.value}
              variant={paymentFilter === opt.value ? "default" : "outline"}
              size="sm"
              className="text-xs"
              onClick={() => setPaymentFilter(opt.value)}
              data-testid={`filter-payment-sales-${opt.value}`}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12" />)}</div>
      ) : filtered.length > 0 ? (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left py-2.5 px-4 font-medium">발급일</th>
                <th className="text-left py-2.5 px-4 font-medium">상호</th>
                <th className="text-center py-2.5 px-4 font-medium hidden md:table-cell">구분</th>
                <th className="text-left py-2.5 px-4 font-medium hidden md:table-cell">프로젝트</th>
                <th className="text-left py-2.5 px-4 font-medium hidden lg:table-cell">사업자번호</th>
                <th className="text-right py-2.5 px-4 font-medium hidden md:table-cell">공급가액</th>
                <th className="text-right py-2.5 px-4 font-medium hidden md:table-cell">세액</th>
                <th className="text-right py-2.5 px-4 font-medium">합계</th>
                <th className="text-center py-2.5 px-4 font-medium">결제상태</th>
                <th className="text-right py-2.5 px-4 font-medium hidden lg:table-cell">입금액</th>
                <th className="text-right py-2.5 px-4 font-medium hidden lg:table-cell">잔액</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(inv => {
                const isUnissued = !inv.issueDate;
                return (
                <tr key={inv.id} className={`border-b last:border-b-0 hover:bg-muted/30 cursor-pointer transition-colors ${isUnissued ? "bg-amber-50/50 dark:bg-amber-950/10" : ""}`} onClick={() => setSelectedId(inv.id)} data-testid={`row-sales-invoice-${inv.id}`}>
                  <td className="py-2.5 px-4">
                    {isUnissued ? (
                      <div className="flex flex-col gap-0.5">
                        <Badge variant="outline" className="text-amber-600 border-amber-300 dark:text-amber-400 dark:border-amber-700 text-[10px] w-fit" data-testid={`badge-unissued-${inv.id}`}>미발행</Badge>
                        {inv.plannedIssueDate && <span className="text-[10px] text-muted-foreground">예정 {inv.plannedIssueDate}</span>}
                      </div>
                    ) : inv.issueDate}
                  </td>
                  <td className="py-2.5 px-4">{inv.companyName || (inv.customerId ? customerMap.get(inv.customerId) : "-") || "-"}</td>
                  <td className="py-2.5 px-4 text-center hidden md:table-cell">
                    {inv.invoiceStage ? (
                      <Badge variant="secondary" className="text-[10px]" data-testid={`badge-stage-${inv.id}`}>{inv.invoiceStage}</Badge>
                    ) : <span className="text-muted-foreground/50">-</span>}
                  </td>
                  <td className="py-2.5 px-4 hidden md:table-cell">
                    {inv.projectId && projectMap.get(inv.projectId) ? (
                      <span className="text-xs font-medium text-muted-foreground" data-testid={`text-project-${inv.id}`}>
                        {projectMap.get(inv.projectId)!.projectNumber} {projectMap.get(inv.projectId)!.customerName}
                      </span>
                    ) : <span className="text-xs text-muted-foreground/50">-</span>}
                  </td>
                  <td className="py-2.5 px-4 text-muted-foreground hidden lg:table-cell">{inv.businessNumber || "-"}</td>
                  <td className="py-2.5 px-4 text-right hidden md:table-cell">{formatAmount(inv.supplyAmount)}</td>
                  <td className="py-2.5 px-4 text-right hidden md:table-cell">{formatAmount(inv.taxAmount)}</td>
                  <td className="py-2.5 px-4 text-right font-medium">{formatAmount(inv.totalAmount)}</td>
                  <td className="py-2.5 px-4 text-center"><PaymentStatusBadge inv={inv} /></td>
                  <td className="py-2.5 px-4 text-right hidden lg:table-cell">
                    {inv.paymentCount > 0 ? <span className="text-green-600 dark:text-green-400">{inv.paidAmount.toLocaleString()}원</span> : <span className="text-muted-foreground">-</span>}
                  </td>
                  <td className="py-2.5 px-4 text-right hidden lg:table-cell">
                    {inv.paymentCount > 0 ? <span className={inv.remainingAmount > 0 ? "text-red-600 dark:text-red-400 font-medium" : "text-muted-foreground"}>{inv.remainingAmount.toLocaleString()}원</span> : <span className="text-muted-foreground">-</span>}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-4 opacity-30" />
          {search ? <p>검색 결과가 없습니다.</p> : <p>등록된 매출계산서가 없습니다.</p>}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-2">
          <span>총 {filtered.length}건</span>
          <div className="flex gap-4">
            <span>공급가액: <strong className="text-foreground">{totals.supply.toLocaleString()}원</strong></span>
            <span>세액: <strong className="text-foreground">{totals.tax.toLocaleString()}원</strong></span>
            <span>합계: <strong className="text-foreground">{totals.total.toLocaleString()}원</strong></span>
          </div>
        </div>
      )}

      <Dialog open={!!selectedId} onOpenChange={open => { if (!open) setSelectedId(null); }}>
        {selectedId && <InvoiceDetailModal invoiceId={selectedId} onClose={() => setSelectedId(null)} />}
      </Dialog>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>매출계산서 추가</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>고객사</Label>
              <Select value={newInvoice.customerId} onValueChange={val => setNewInvoice(p => ({ ...p, customerId: val }))}>
                <SelectTrigger><SelectValue placeholder="고객사 선택" /></SelectTrigger>
                <SelectContent>
                  {(customers || []).map(c => <SelectItem key={c.id} value={c.id}>{c.companyName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>계산서번호</Label><Input value={newInvoice.invoiceNumber} onChange={e => setNewInvoice(p => ({ ...p, invoiceNumber: e.target.value }))} data-testid="input-new-si-number" /></div>
              <div><Label>발행일</Label><Input type="date" value={newInvoice.issueDate} onChange={e => setNewInvoice(p => ({ ...p, issueDate: e.target.value }))} data-testid="input-new-si-date" /></div>
            </div>
            <div><Label>품목</Label><Input value={newInvoice.item} onChange={e => setNewInvoice(p => ({ ...p, item: e.target.value }))} data-testid="input-new-si-item" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>공급가액</Label><Input type="number" value={newInvoice.supplyAmount} onChange={e => setNewInvoice(p => ({ ...p, supplyAmount: e.target.value }))} data-testid="input-new-si-supply" /></div>
              <div><Label>세액</Label><Input type="number" value={newInvoice.taxAmount} onChange={e => setNewInvoice(p => ({ ...p, taxAmount: e.target.value }))} data-testid="input-new-si-tax" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowAdd(false)}>취소</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} data-testid="button-confirm-add-si">등록</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
