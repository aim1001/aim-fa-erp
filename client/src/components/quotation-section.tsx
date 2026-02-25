import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  FileText, Plus, Trash2, ChevronDown, ChevronUp, Search,
  Pencil, Check, X, Upload, FileDown, Package, Loader2,
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Quotation, QuotationItem, Inquiry, ItemMaster } from "@shared/schema";

function formatNumber(n: number | null | undefined) {
  if (n == null) return "0";
  return n.toLocaleString("ko-KR");
}

function ItemSearchPopover({ onSelect, disabled }: {
  onSelect: (item: ItemMaster) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: allItems = [] } = useQuery<(ItemMaster & { inventory: any[]; documents: any[] })[]>({
    queryKey: ["/api/items"],
  });

  const filtered = useMemo(() => {
    if (!search) return allItems.filter(i => i.active !== false).slice(0, 30);
    const q = search.toLowerCase();
    return allItems.filter(i =>
      i.active !== false && (
        i.itemName?.toLowerCase().includes(q) ||
        i.itemCode?.toLowerCase().includes(q) ||
        i.spec?.toLowerCase().includes(q) ||
        i.category1?.toLowerCase().includes(q)
      )
    ).slice(0, 30);
  }, [allItems, search]);

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(""); }}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled} data-testid="button-add-quotation-item">
          <Plus className="h-3 w-3 mr-1" />품목 추가
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="품목코드, 품목명, 사양 검색..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 text-xs pl-7"
              autoFocus
              data-testid="input-item-search"
            />
          </div>
        </div>
        <ScrollArea className="max-h-[300px]">
          {filtered.length === 0 && (
            <div className="px-3 py-4 text-xs text-center text-muted-foreground">검색 결과 없음</div>
          )}
          {filtered.map(item => (
            <button
              key={item.id}
              type="button"
              className="w-full text-left px-3 py-2 text-xs hover:bg-muted border-b last:border-0"
              onClick={() => {
                onSelect(item);
                setOpen(false);
                setSearch("");
              }}
              data-testid={`option-item-${item.id}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{item.itemName}</span>
                <span className="text-muted-foreground">{formatNumber(item.salesPrice)}원</span>
              </div>
              <div className="text-muted-foreground mt-0.5">
                {item.itemCode} {item.spec && `· ${item.spec}`}
              </div>
            </button>
          ))}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function QuotationDetail({ quotation, inquiryId, inquiry }: {
  quotation: Quotation;
  inquiryId: string;
  inquiry: Inquiry;
}) {
  const { toast } = useToast();
  const [editingHeader, setEditingHeader] = useState(false);
  const [headerForm, setHeaderForm] = useState({
    quoteDate: quotation.quoteDate,
    validUntil: quotation.validUntil || "",
    notes: quotation.notes || "",
  });
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editItemForm, setEditItemForm] = useState({ quantity: 0, unitPrice: 0 });

  const { data, isLoading } = useQuery<{ quotation: Quotation; items: QuotationItem[] }>({
    queryKey: ["/api/quotations", quotation.id],
    queryFn: () => fetch(`/api/quotations/${quotation.id}`).then(r => r.json()),
  });

  const items = data?.items || [];
  const subtotal = items.reduce((s, i) => s + (i.amount || 0), 0);
  const tax = Math.round(subtotal * 0.1);
  const total = subtotal + tax;

  const updateQuotationMut = useMutation({
    mutationFn: (body: any) => apiRequest("PATCH", `/api/quotations/${quotation.id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotations", quotation.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/inquiries", inquiryId, "quotations"] });
      setEditingHeader(false);
    },
    onError: () => toast({ title: "수정 실패", variant: "destructive" }),
  });

  const deleteQuotationMut = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/quotations/${quotation.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inquiries", inquiryId, "quotations"] });
      toast({ title: "견적서 삭제됨" });
    },
    onError: () => toast({ title: "삭제 실패", variant: "destructive" }),
  });

  const addItemMut = useMutation({
    mutationFn: (body: any) => apiRequest("POST", `/api/quotations/${quotation.id}/items`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotations", quotation.id] });
    },
    onError: () => toast({ title: "품목 추가 실패", variant: "destructive" }),
  });

  const updateItemMut = useMutation({
    mutationFn: ({ id, ...body }: any) => apiRequest("PATCH", `/api/quotation-items/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotations", quotation.id] });
      setEditingItemId(null);
    },
    onError: () => toast({ title: "수정 실패", variant: "destructive" }),
  });

  const deleteItemMut = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/quotation-items/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotations", quotation.id] });
    },
    onError: () => toast({ title: "삭제 실패", variant: "destructive" }),
  });

  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await apiRequest("POST", `/api/quotations/${quotation.id}/export`);
      const result = await res.json();
      toast({ title: "견적서 내보내기 완료", description: result.message || "OneDrive에 저장되었습니다" });
      queryClient.invalidateQueries({ queryKey: ["/api/inquiries", inquiryId, "files"] });
    } catch (e: any) {
      toast({ title: "내보내기 실패", description: e.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const handleAddItem = (masterItem: ItemMaster) => {
    addItemMut.mutate({
      itemCode: masterItem.itemCode,
      itemName: masterItem.itemName,
      spec: masterItem.spec || "",
      quantity: 1,
      unitPrice: masterItem.salesPrice || 0,
      sortOrder: items.length,
    });
  };

  const statusLabel: Record<string, string> = { draft: "작성중", sent: "발송", accepted: "수주" };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant={quotation.status === "accepted" ? "default" : "secondary"}>
            {statusLabel[quotation.status || "draft"] || quotation.status}
          </Badge>
          <span className="text-sm font-medium">{quotation.quoteNumber}</span>
          <span className="text-xs text-muted-foreground">{quotation.quoteDate}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setEditingHeader(!editingHeader); setHeaderForm({ quoteDate: quotation.quoteDate, validUntil: quotation.validUntil || "", notes: quotation.notes || "" }); }}
            data-testid={`button-edit-quotation-${quotation.id}`}
          >
            <Pencil className="h-3 w-3" />
          </Button>
          {inquiry.onedriveFolderId && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleExport}
              disabled={exporting || items.length === 0}
              data-testid={`button-export-quotation-${quotation.id}`}
            >
              {exporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
              <span className="ml-1">OneDrive</span>
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.open(`/api/quotations/${quotation.id}/download/pdf`, "_blank")}
            disabled={items.length === 0}
            data-testid={`button-download-pdf-${quotation.id}`}
          >
            <FileDown className="h-3 w-3" />
            <span className="ml-1">PDF</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.open(`/api/quotations/${quotation.id}/download/xlsx`, "_blank")}
            disabled={items.length === 0}
            data-testid={`button-download-xlsx-${quotation.id}`}
          >
            <FileDown className="h-3 w-3" />
            <span className="ml-1">Excel</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={() => { if (confirm("이 견적서를 삭제하시겠습니까?")) deleteQuotationMut.mutate(); }}
            data-testid={`button-delete-quotation-${quotation.id}`}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {editingHeader && (
        <div className="border rounded-md p-3 space-y-2 bg-muted/20">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium">견적일자</label>
              <Input type="date" value={headerForm.quoteDate} onChange={e => setHeaderForm(f => ({ ...f, quoteDate: e.target.value }))} className="h-7 text-xs mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium">유효기한</label>
              <Input type="date" value={headerForm.validUntil} onChange={e => setHeaderForm(f => ({ ...f, validUntil: e.target.value }))} className="h-7 text-xs mt-1" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium">비고</label>
            <Textarea value={headerForm.notes} onChange={e => setHeaderForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="text-xs mt-1" />
          </div>
          <div className="flex gap-1">
            <Button size="sm" onClick={() => updateQuotationMut.mutate(headerForm)} disabled={updateQuotationMut.isPending}>
              <Check className="h-3 w-3 mr-1" />저장
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditingHeader(false)}>취소</Button>
          </div>
        </div>
      )}

      <div className="text-xs space-y-1 text-muted-foreground bg-muted/30 rounded-md p-2">
        <div><strong>고객:</strong> {inquiry.snapshotCompanyName || inquiry.customerName}</div>
        {inquiry.snapshotContactName && <div><strong>담당자:</strong> {inquiry.snapshotContactName} {inquiry.snapshotPhone && `(${inquiry.snapshotPhone})`}</div>}
        {inquiry.snapshotAddress && <div><strong>주소:</strong> {inquiry.snapshotAddress}</div>}
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-4 text-center">불러오는 중...</div>
      ) : (
        <>
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-2 py-1.5 text-left w-8">No</th>
                  <th className="px-2 py-1.5 text-left">품목코드</th>
                  <th className="px-2 py-1.5 text-left">품목명</th>
                  <th className="px-2 py-1.5 text-left">사양</th>
                  <th className="px-2 py-1.5 text-right w-16">수량</th>
                  <th className="px-2 py-1.5 text-right w-24">단가</th>
                  <th className="px-2 py-1.5 text-right w-24">금액</th>
                  <th className="px-2 py-1.5 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={item.id} className="border-t hover:bg-muted/20" data-testid={`quotation-item-row-${item.id}`}>
                    <td className="px-2 py-1.5">{idx + 1}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{item.itemCode || "-"}</td>
                    <td className="px-2 py-1.5 font-medium">{item.itemName}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{item.spec || "-"}</td>
                    {editingItemId === item.id ? (
                      <>
                        <td className="px-1 py-1">
                          <Input type="number" value={editItemForm.quantity} onChange={e => setEditItemForm(f => ({ ...f, quantity: parseInt(e.target.value) || 0 }))} className="h-6 text-xs text-right w-14" />
                        </td>
                        <td className="px-1 py-1">
                          <Input type="number" value={editItemForm.unitPrice} onChange={e => setEditItemForm(f => ({ ...f, unitPrice: parseInt(e.target.value) || 0 }))} className="h-6 text-xs text-right w-20" />
                        </td>
                        <td className="px-2 py-1.5 text-right">{formatNumber(editItemForm.quantity * editItemForm.unitPrice)}</td>
                        <td className="px-1 py-1">
                          <div className="flex gap-0.5">
                            <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => updateItemMut.mutate({ id: item.id, quantity: editItemForm.quantity, unitPrice: editItemForm.unitPrice })}>
                              <Check className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => setEditingItemId(null)}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-2 py-1.5 text-right">{formatNumber(item.quantity)}</td>
                        <td className="px-2 py-1.5 text-right">{formatNumber(item.unitPrice)}</td>
                        <td className="px-2 py-1.5 text-right font-medium">{formatNumber(item.amount)}</td>
                        <td className="px-1 py-1">
                          <div className="flex gap-0.5">
                            <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => { setEditingItemId(item.id); setEditItemForm({ quantity: item.quantity, unitPrice: item.unitPrice }); }}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-destructive" onClick={() => deleteItemMut.mutate(item.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr><td colSpan={8} className="px-2 py-4 text-center text-muted-foreground">품목을 추가하세요</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <ItemSearchPopover onSelect={handleAddItem} disabled={addItemMut.isPending} />
            <div className="text-right space-y-0.5 text-xs">
              <div>공급가액: <span className="font-medium">{formatNumber(subtotal)}원</span></div>
              <div>부가세(10%): <span className="font-medium">{formatNumber(tax)}원</span></div>
              <div className="text-sm font-bold">합계: {formatNumber(total)}원</div>
            </div>
          </div>

          {(data?.quotation.notes || quotation.notes) && (
            <div className="text-xs bg-muted/20 rounded-md p-2">
              <strong>비고:</strong> {data?.quotation.notes || quotation.notes}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function QuotationSection({ inquiryId, inquiry }: { inquiryId: string; inquiry: Inquiry }) {
  const { toast } = useToast();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: quotationList = [], isLoading } = useQuery<Quotation[]>({
    queryKey: ["/api/inquiries", inquiryId, "quotations"],
    queryFn: () => fetch(`/api/inquiries/${inquiryId}/quotations`).then(r => r.json()),
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const year = String(inquiry.year).slice(-2);
      const num = String(quotationList.length + 1).padStart(2, "0");
      const quoteNumber = `Q-${year}-${inquiry.inquiryNumber?.replace(/^.*?(\d+)$/, "$1") || "0"}-${num}`;
      const today = new Date().toISOString().split("T")[0];
      const validDate = new Date();
      validDate.setDate(validDate.getDate() + 30);
      const validUntil = validDate.toISOString().split("T")[0];
      const res = await apiRequest("POST", `/api/inquiries/${inquiryId}/quotations`, {
        quoteNumber,
        quoteDate: today,
        validUntil,
      });
      return res.json();
    },
    onSuccess: (q: Quotation) => {
      queryClient.invalidateQueries({ queryKey: ["/api/inquiries", inquiryId, "quotations"] });
      setExpandedId(q.id);
      toast({ title: "새 견적서 생성됨" });
    },
    onError: () => toast({ title: "생성 실패", variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            견적서
            {quotationList.length > 0 && (
              <Badge variant="secondary" className="text-xs">{quotationList.length}</Badge>
            )}
          </CardTitle>
          <Button size="sm" onClick={() => createMut.mutate()} disabled={createMut.isPending} data-testid="button-new-quotation">
            <Plus className="h-3 w-3 mr-1" />새 견적서
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && <div className="text-sm text-muted-foreground">불러오는 중...</div>}

        {quotationList.length === 0 && !isLoading && (
          <div className="text-sm text-muted-foreground text-center py-4">
            아직 견적서가 없습니다. "새 견적서" 버튼으로 작성을 시작하세요.
          </div>
        )}

        {quotationList.map(q => (
          <Collapsible key={q.id} open={expandedId === q.id} onOpenChange={open => setExpandedId(open ? q.id : null)}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="w-full flex items-center justify-between px-3 py-2 rounded-md border hover:bg-muted/50 text-sm"
                data-testid={`quotation-toggle-${q.id}`}
              >
                <div className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium">{q.quoteNumber}</span>
                  <span className="text-xs text-muted-foreground">{q.quoteDate}</span>
                </div>
                {expandedId === q.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2 pb-1">
              <QuotationDetail quotation={q} inquiryId={inquiryId} inquiry={inquiry} />
            </CollapsibleContent>
          </Collapsible>
        ))}
      </CardContent>
    </Card>
  );
}
