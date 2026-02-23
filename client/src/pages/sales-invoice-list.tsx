import { useQuery, useMutation } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { FileText, Plus, Search, Trash2 } from "lucide-react";
import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { SalesInvoice, Customer } from "@shared/schema";
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

function formatAmount(amount: number | null | undefined) {
  if (!amount) return "-";
  return amount.toLocaleString() + "원";
}

function InvoiceDetailModal({ invoiceId, onClose }: { invoiceId: string; onClose: () => void }) {
  const { toast } = useToast();
  const { data: invoice } = useQuery<SalesInvoice>({
    queryKey: ["/api/sales-invoices", invoiceId],
  });
  const { data: customers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
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
      queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices", invoiceId] });
    },
    onError: (err: Error) => {
      toast({ title: "저장 실패", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/sales-invoices/${invoiceId}`);
    },
    onSuccess: () => {
      toast({ title: "삭제 완료" });
      queryClient.invalidateQueries({ queryKey: ["/api/sales-invoices"] });
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
        {renderField("계산서번호", "invoiceNumber", invoice.invoiceNumber || "")}
        {renderField("발행일", "issueDate", invoice.issueDate || "")}
        {renderField("품목", "item", invoice.item || "")}
        {renderField("수량", "quantity", String(invoice.quantity || ""))}
        {renderField("단가", "unitPrice", String(invoice.unitPrice || ""))}
        {renderField("공급가액", "supplyAmount", String(invoice.supplyAmount || ""))}
        {renderField("세액", "taxAmount", String(invoice.taxAmount || ""))}
        {renderField("합계", "totalAmount", String(invoice.totalAmount || ""))}
        {renderField("메모", "memo", invoice.memo || "")}
      </div>
    </DialogContent>
  );
}

export default function SalesInvoiceList() {
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newInvoice, setNewInvoice] = useState({ customerId: "", invoiceNumber: "", issueDate: "", item: "", supplyAmount: "", taxAmount: "" });

  const { data: invoices, isLoading } = useQuery<SalesInvoice[]>({
    queryKey: ["/api/sales-invoices"],
  });
  const { data: customers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const customerMap = useMemo(() => {
    const map = new Map<string, string>();
    customers?.forEach(c => map.set(c.id, c.companyName));
    return map;
  }, [customers]);

  const filtered = useMemo(() => {
    if (!invoices) return [];
    if (!search) return invoices;
    const s = search.toLowerCase();
    return invoices.filter(inv =>
      (inv.item && inv.item.toLowerCase().includes(s)) ||
      (inv.invoiceNumber && inv.invoiceNumber.toLowerCase().includes(s)) ||
      (inv.customerId && customerMap.get(inv.customerId)?.toLowerCase().includes(s))
    );
  }, [invoices, search, customerMap]);

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
        <Button size="sm" onClick={() => setShowAdd(true)} data-testid="button-add-sales-invoice">
          <Plus className="h-4 w-4 mr-1" />추가
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="품목, 계산서번호, 고객사 검색" className="pl-9" data-testid="input-search-sales-invoices" />
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12" />)}</div>
      ) : filtered.length > 0 ? (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left py-2.5 px-4 font-medium">발행일</th>
                <th className="text-left py-2.5 px-4 font-medium">고객사</th>
                <th className="text-left py-2.5 px-4 font-medium hidden md:table-cell">품목</th>
                <th className="text-right py-2.5 px-4 font-medium hidden md:table-cell">공급가액</th>
                <th className="text-right py-2.5 px-4 font-medium">합계</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(inv => (
                <tr key={inv.id} className="border-b last:border-b-0 hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => setSelectedId(inv.id)} data-testid={`row-sales-invoice-${inv.id}`}>
                  <td className="py-2.5 px-4">{inv.issueDate || "-"}</td>
                  <td className="py-2.5 px-4">{inv.customerId ? customerMap.get(inv.customerId) || "-" : "-"}</td>
                  <td className="py-2.5 px-4 hidden md:table-cell">{inv.item || "-"}</td>
                  <td className="py-2.5 px-4 text-right hidden md:table-cell">{formatAmount(inv.supplyAmount)}</td>
                  <td className="py-2.5 px-4 text-right font-medium">{formatAmount(inv.totalAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-4 opacity-30" />
          {search ? <p>검색 결과가 없습니다.</p> : <p>등록된 매출계산서가 없습니다.</p>}
        </div>
      )}

      <div className="text-xs text-muted-foreground">{filtered.length > 0 && `총 ${filtered.length}건`}</div>

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
