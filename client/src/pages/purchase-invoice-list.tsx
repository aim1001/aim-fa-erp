import { useQuery, useMutation } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { FileText, Plus, Search, Trash2, RefreshCw, Download } from "lucide-react";
import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { PurchaseInvoice, Vendor } from "@shared/schema";
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
  if (!amount && amount !== 0) return "-";
  return amount.toLocaleString() + "원";
}

function InvoiceDetailModal({ invoiceId, onClose }: { invoiceId: string; onClose: () => void }) {
  const { toast } = useToast();
  const { data: invoice } = useQuery<PurchaseInvoice>({
    queryKey: ["/api/purchase-invoices", invoiceId],
  });
  const { data: vendorList } = useQuery<Vendor[]>({
    queryKey: ["/api/vendors"],
  });

  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const updateMutation = useMutation({
    mutationFn: async (patch: Record<string, any>) => {
      const res = await apiRequest("PATCH", `/api/purchase-invoices/${invoiceId}`, patch);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-invoices", invoiceId] });
    },
    onError: (err: Error) => {
      toast({ title: "저장 실패", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/purchase-invoices/${invoiceId}`);
    },
    onSuccess: () => {
      toast({ title: "삭제 완료" });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-invoices"] });
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

  const vendorName = vendorList?.find(v => v.id === invoice.vendorId)?.companyName || "-";

  return (
    <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="modal-purchase-invoice-detail">
      <DialogHeader>
        <div className="flex items-center justify-between pr-8">
          <DialogTitle>매입계산서 상세</DialogTitle>
          <Button variant="destructive" size="sm" onClick={() => { if (confirm("삭제하시겠습니까?")) deleteMutation.mutate(); }} disabled={deleteMutation.isPending} data-testid="button-delete-purchase-invoice">
            <Trash2 className="h-4 w-4" /><span>삭제</span>
          </Button>
        </div>
      </DialogHeader>
      <p className="text-xs text-muted-foreground">각 항목을 클릭하면 바로 수정할 수 있습니다</p>
      <div className="grid grid-cols-[100px_1fr] gap-y-2 gap-x-2 text-sm items-center">
        <span className="text-muted-foreground">공급업체</span>
        <Select value={invoice.vendorId || ""} onValueChange={val => updateMutation.mutate({ vendorId: val || null })}>
          <SelectTrigger className="h-7 text-sm"><SelectValue placeholder="공급업체 선택" /></SelectTrigger>
          <SelectContent>
            {(vendorList || []).map(v => <SelectItem key={v.id} value={v.id}>{v.companyName}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground text-xs">(현재: {vendorName})</span>
        <span></span>
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
        {renderField("이메일", "email1", invoice.email1 || "")}
        {renderField("메모", "memo", invoice.memo || "")}
      </div>
    </DialogContent>
  );
}

export default function PurchaseInvoiceList() {
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [importYear, setImportYear] = useState("");
  const [newInvoice, setNewInvoice] = useState({ vendorId: "", invoiceNumber: "", issueDate: "", item: "", supplyAmount: "", taxAmount: "" });

  const { data: invoices, isLoading } = useQuery<PurchaseInvoice[]>({
    queryKey: ["/api/purchase-invoices"],
  });
  const { data: vendorList } = useQuery<Vendor[]>({
    queryKey: ["/api/vendors"],
  });
  const { data: invoiceYears } = useQuery<number[]>({
    queryKey: ["/api/invoice-years"],
  });

  const vendorMap = useMemo(() => {
    const map = new Map<string, string>();
    vendorList?.forEach(v => map.set(v.id, v.companyName));
    return map;
  }, [vendorList]);

  const filtered = useMemo(() => {
    if (!invoices) return [];
    if (!search) return invoices;
    const s = search.toLowerCase();
    return invoices.filter(inv =>
      (inv.companyName && inv.companyName.toLowerCase().includes(s)) ||
      (inv.item && inv.item.toLowerCase().includes(s)) ||
      (inv.invoiceNumber && inv.invoiceNumber.toLowerCase().includes(s)) ||
      (inv.businessNumber && inv.businessNumber.includes(s)) ||
      (inv.vendorId && vendorMap.get(inv.vendorId)?.toLowerCase().includes(s))
    );
  }, [invoices, search, vendorMap]);

  const importMutation = useMutation({
    mutationFn: async (year: number) => {
      const res = await apiRequest("POST", "/api/purchase-invoices/import-onedrive", { year });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-invoices"] });
      toast({ title: "가져오기 완료", description: `${data.imported}건 추가, ${data.skipped}건 중복 건너뜀 (총 ${data.total}건)` });
    },
    onError: (err: Error) => {
      toast({ title: "가져오기 실패", description: err.message, variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const data: any = {
        vendorId: newInvoice.vendorId || null,
        invoiceNumber: newInvoice.invoiceNumber || null,
        issueDate: newInvoice.issueDate || null,
        item: newInvoice.item || null,
        supplyAmount: newInvoice.supplyAmount ? parseInt(newInvoice.supplyAmount) : null,
        taxAmount: newInvoice.taxAmount ? parseInt(newInvoice.taxAmount) : null,
        totalAmount: (newInvoice.supplyAmount ? parseInt(newInvoice.supplyAmount) : 0) + (newInvoice.taxAmount ? parseInt(newInvoice.taxAmount) : 0) || null,
      };
      const res = await apiRequest("POST", "/api/purchase-invoices", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-invoices"] });
      setShowAdd(false);
      setNewInvoice({ vendorId: "", invoiceNumber: "", issueDate: "", item: "", supplyAmount: "", taxAmount: "" });
      toast({ title: "매입계산서가 등록되었습니다" });
    },
    onError: (err: Error) => {
      toast({ title: "등록 실패", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="p-6 space-y-4 overflow-auto h-full">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-semibold" data-testid="text-purchase-invoice-title">매입계산서</h1>
        <div className="flex items-center gap-2">
          <Select value={importYear} onValueChange={setImportYear}>
            <SelectTrigger className="w-28" data-testid="select-import-year-purchase">
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
            data-testid="button-import-purchase"
          >
            {importMutation.isPending ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
            {importMutation.isPending ? "가져오는 중..." : "OneDrive에서 가져오기"}
          </Button>
          <Button size="sm" onClick={() => setShowAdd(true)} data-testid="button-add-purchase-invoice">
            <Plus className="h-4 w-4 mr-1" />추가
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="상호, 품목, 사업자번호 검색" className="pl-9" data-testid="input-search-purchase-invoices" />
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
                <th className="text-left py-2.5 px-4 font-medium hidden md:table-cell">사업자번호</th>
                <th className="text-right py-2.5 px-4 font-medium hidden md:table-cell">공급가액</th>
                <th className="text-right py-2.5 px-4 font-medium hidden md:table-cell">세액</th>
                <th className="text-right py-2.5 px-4 font-medium">합계</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(inv => (
                <tr key={inv.id} className="border-b last:border-b-0 hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => setSelectedId(inv.id)} data-testid={`row-purchase-invoice-${inv.id}`}>
                  <td className="py-2.5 px-4">{inv.issueDate || "-"}</td>
                  <td className="py-2.5 px-4">{inv.companyName || (inv.vendorId ? vendorMap.get(inv.vendorId) : "-") || "-"}</td>
                  <td className="py-2.5 px-4 text-muted-foreground hidden md:table-cell">{inv.businessNumber || "-"}</td>
                  <td className="py-2.5 px-4 text-right hidden md:table-cell">{formatAmount(inv.supplyAmount)}</td>
                  <td className="py-2.5 px-4 text-right hidden md:table-cell">{formatAmount(inv.taxAmount)}</td>
                  <td className="py-2.5 px-4 text-right font-medium">{formatAmount(inv.totalAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-4 opacity-30" />
          {search ? <p>검색 결과가 없습니다.</p> : <p>등록된 매입계산서가 없습니다.</p>}
        </div>
      )}

      <div className="text-xs text-muted-foreground">{filtered.length > 0 && `총 ${filtered.length}건`}</div>

      <Dialog open={!!selectedId} onOpenChange={open => { if (!open) setSelectedId(null); }}>
        {selectedId && <InvoiceDetailModal invoiceId={selectedId} onClose={() => setSelectedId(null)} />}
      </Dialog>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>매입계산서 추가</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>공급업체</Label>
              <Select value={newInvoice.vendorId} onValueChange={val => setNewInvoice(p => ({ ...p, vendorId: val }))}>
                <SelectTrigger><SelectValue placeholder="공급업체 선택" /></SelectTrigger>
                <SelectContent>
                  {(vendorList || []).map(v => <SelectItem key={v.id} value={v.id}>{v.companyName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>계산서번호</Label><Input value={newInvoice.invoiceNumber} onChange={e => setNewInvoice(p => ({ ...p, invoiceNumber: e.target.value }))} data-testid="input-new-pi-number" /></div>
              <div><Label>발행일</Label><Input type="date" value={newInvoice.issueDate} onChange={e => setNewInvoice(p => ({ ...p, issueDate: e.target.value }))} data-testid="input-new-pi-date" /></div>
            </div>
            <div><Label>품목</Label><Input value={newInvoice.item} onChange={e => setNewInvoice(p => ({ ...p, item: e.target.value }))} data-testid="input-new-pi-item" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>공급가액</Label><Input type="number" value={newInvoice.supplyAmount} onChange={e => setNewInvoice(p => ({ ...p, supplyAmount: e.target.value }))} data-testid="input-new-pi-supply" /></div>
              <div><Label>세액</Label><Input type="number" value={newInvoice.taxAmount} onChange={e => setNewInvoice(p => ({ ...p, taxAmount: e.target.value }))} data-testid="input-new-pi-tax" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowAdd(false)}>취소</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} data-testid="button-confirm-add-pi">등록</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
