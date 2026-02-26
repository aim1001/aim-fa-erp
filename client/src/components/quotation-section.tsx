import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FileText, Plus, Trash2, Search, Pencil, Check, X,
  Upload, FileDown, Package, Loader2, ChevronRight,
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Quotation, QuotationItem, Inquiry, ItemMaster } from "@shared/schema";

function fmtNum(n: number | null | undefined) {
  if (n == null) return "0";
  return n.toLocaleString("ko-KR");
}

function calcMarginRate(unitPrice: number, costPrice: number): number {
  if (!unitPrice || !costPrice) return 0;
  return Math.round(((unitPrice - costPrice) / unitPrice) * 100);
}

function MarginBadge({ rate }: { rate: number }) {
  if (rate === 0) return <span className="text-muted-foreground text-xs">-</span>;
  const color = rate >= 30 ? "text-green-600" : rate >= 15 ? "text-yellow-600" : "text-red-500";
  return <span className={`text-xs font-medium ${color}`}>{rate}%</span>;
}

function ItemSearchPopover({ onSelect, disabled }: {
  onSelect: (item: ItemMaster) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [cat1Filter, setCat1Filter] = useState("all");
  const [cat2Filter, setCat2Filter] = useState("all");

  const { data: allItems = [] } = useQuery<(ItemMaster & { inventory: any[]; documents: any[] })[]>({
    queryKey: ["/api/items"],
  });

  const activeItems = useMemo(() => allItems.filter(i => i.active !== false), [allItems]);

  const cat1List = useMemo(() => {
    const cats = new Set<string>();
    activeItems.forEach(i => { if (i.category1) cats.add(i.category1); });
    return Array.from(cats).sort();
  }, [activeItems]);

  const cat2List = useMemo(() => {
    const cats = new Set<string>();
    const base = cat1Filter === "all" ? activeItems : activeItems.filter(i => i.category1 === cat1Filter);
    base.forEach(i => { if (i.category2) cats.add(i.category2); });
    return Array.from(cats).sort();
  }, [activeItems, cat1Filter]);

  const filtered = useMemo(() => {
    let list = activeItems;
    if (cat1Filter !== "all") list = list.filter(i => i.category1 === cat1Filter);
    if (cat2Filter !== "all") list = list.filter(i => i.category2 === cat2Filter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(i =>
        i.itemName?.toLowerCase().includes(q) ||
        i.itemCode?.toLowerCase().includes(q) ||
        i.spec?.toLowerCase().includes(q)
      );
    }
    return list.slice(0, 80);
  }, [activeItems, search, cat1Filter, cat2Filter]);

  const handleReset = () => {
    setSearch("");
    setCat1Filter("all");
    setCat2Filter("all");
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) handleReset(); }}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled} data-testid="button-add-quotation-item">
          <Plus className="h-3 w-3 mr-1" />품목 추가
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[520px] p-0" align="start">
        <div className="p-2 border-b space-y-1.5">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="품목코드, 품목명, 사양 검색..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="text-xs pl-7"
              autoFocus
              data-testid="input-item-search"
            />
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground mb-1">대분류</div>
            <div className="flex gap-1 flex-wrap">
              <Button
                size="sm"
                variant={cat1Filter === "all" ? "default" : "outline"}
                className="text-[10px] px-2 py-0.5"
                onClick={() => { setCat1Filter("all"); setCat2Filter("all"); }}
                data-testid="button-cat1-all"
              >
                전체
              </Button>
              {cat1List.map(c => (
                <Button
                  key={c}
                  size="sm"
                  variant={cat1Filter === c ? "default" : "outline"}
                  className="text-[10px] px-2 py-0.5"
                  onClick={() => { setCat1Filter(c); setCat2Filter("all"); }}
                  data-testid={`button-cat1-${c}`}
                >
                  {c}
                </Button>
              ))}
            </div>
          </div>
          {cat2List.length > 0 && (
            <div>
              <div className="text-[10px] text-muted-foreground mb-1">소분류</div>
              <div className="flex gap-1 flex-wrap">
                <Button
                  size="sm"
                  variant={cat2Filter === "all" ? "default" : "outline"}
                  className="text-[10px] px-2 py-0.5"
                  onClick={() => setCat2Filter("all")}
                  data-testid="button-cat2-all"
                >
                  전체
                </Button>
                {cat2List.map(c => (
                  <Button
                    key={c}
                    size="sm"
                    variant={cat2Filter === c ? "default" : "outline"}
                    className="text-[10px] px-2 py-0.5"
                    onClick={() => setCat2Filter(c)}
                    data-testid={`button-cat2-${c}`}
                  >
                    {c}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
        <ScrollArea className="max-h-[400px]">
          {filtered.length === 0 && (
            <div className="px-3 py-4 text-xs text-center text-muted-foreground">검색 결과 없음</div>
          )}
          {filtered.map(item => (
            <button
              key={item.id}
              type="button"
              className="w-full text-left px-3 py-2 text-xs hover:bg-muted border-b last:border-0"
              onClick={() => { onSelect(item); setOpen(false); handleReset(); }}
              data-testid={`option-item-${item.id}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px] px-1">{item.category1}</Badge>
                  {item.category2 && <Badge variant="secondary" className="text-[10px] px-1">{item.category2}</Badge>}
                  <span className="font-medium">{item.itemName}</span>
                </div>
                <div className="flex items-center gap-3 text-muted-foreground">
                  <span>원가 {fmtNum(item.cost)}</span>
                  <span>판매가 {fmtNum(item.salesPrice)}</span>
                </div>
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

function ItemsTab({ quotation, items, onRefresh }: {
  quotation: Quotation;
  items: QuotationItem[];
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ quantity: 0, unitPrice: 0 });

  const grouped = useMemo(() => {
    const map = new Map<string, QuotationItem[]>();
    for (const item of items) {
      const cat = item.category2 || item.category1 || "기타";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(item);
    }
    return map;
  }, [items]);

  const addItemMut = useMutation({
    mutationFn: (body: any) => apiRequest("POST", `/api/quotations/${quotation.id}/items`, body),
    onSuccess: onRefresh,
    onError: () => toast({ title: "품목 추가 실패", variant: "destructive" }),
  });

  const updateItemMut = useMutation({
    mutationFn: ({ id, ...body }: any) => apiRequest("PATCH", `/api/quotation-items/${id}`, body),
    onSuccess: () => { onRefresh(); setEditingItemId(null); },
    onError: () => toast({ title: "수정 실패", variant: "destructive" }),
  });

  const deleteItemMut = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/quotation-items/${id}`),
    onSuccess: onRefresh,
    onError: () => toast({ title: "삭제 실패", variant: "destructive" }),
  });

  const handleAddItem = (masterItem: ItemMaster) => {
    addItemMut.mutate({
      itemCode: masterItem.itemCode,
      itemName: masterItem.itemName,
      spec: masterItem.spec || "",
      quantity: 1,
      costPrice: masterItem.cost || 0,
      unitPrice: masterItem.salesPrice || 0,
      category1: masterItem.category1 || "",
      category2: masterItem.category2 || "",
      sortOrder: items.length,
    });
  };

  const subtotal = items.reduce((s, i) => s + (i.amount || 0), 0);
  const totalCost = items.reduce((s, i) => s + ((i.costPrice || 0) * i.quantity), 0);
  const overallMargin = subtotal > 0 && totalCost > 0 ? Math.round(((subtotal - totalCost) / subtotal) * 100) : 0;

  let globalIdx = 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <ItemSearchPopover onSelect={handleAddItem} disabled={addItemMut.isPending} />
        <div className="text-xs text-muted-foreground">
          {items.length}개 품목 · 총 마진율: <MarginBadge rate={overallMargin} />
        </div>
      </div>

      <div className="border rounded-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[700px]">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-2 py-1.5 text-left w-8">No</th>
                <th className="px-2 py-1.5 text-left w-20">품목코드</th>
                <th className="px-2 py-1.5 text-left">품목명</th>
                <th className="px-2 py-1.5 text-left w-24">사양</th>
                <th className="px-2 py-1.5 text-right w-14">수량</th>
                <th className="px-2 py-1.5 text-right w-20">원가</th>
                <th className="px-2 py-1.5 text-right w-20">판매단가</th>
                <th className="px-2 py-1.5 text-right w-24">금액</th>
                <th className="px-2 py-1.5 text-center w-14">마진</th>
                <th className="px-2 py-1.5 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {Array.from(grouped).flatMap(([cat, catItems]) => {
                const catSubtotal = catItems.reduce((s, i) => s + (i.amount || 0), 0);
                const catCostTotal = catItems.reduce((s, i) => s + ((i.costPrice || 0) * i.quantity), 0);
                const catMargin = catSubtotal > 0 && catCostTotal > 0
                  ? Math.round(((catSubtotal - catCostTotal) / catSubtotal) * 100) : 0;

                const rows = [];
                rows.push(
                  <tr key={`cat-header-${cat}`} className="bg-blue-50 dark:bg-blue-950/30">
                    <td colSpan={10} className="px-2 py-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs">{cat}</span>
                        <span className="text-[10px] text-muted-foreground">
                          소계: {fmtNum(catSubtotal)}원 · 마진: <MarginBadge rate={catMargin} />
                        </span>
                      </div>
                    </td>
                  </tr>
                );

                for (const item of catItems) {
                  globalIdx++;
                  const margin = calcMarginRate(item.unitPrice, item.costPrice || 0);
                  const isEditing = editingItemId === item.id;

                  rows.push(
                    <tr key={item.id} className="border-t hover:bg-muted/20" data-testid={`quotation-item-row-${item.id}`}>
                      <td className="px-2 py-1.5 w-8">{globalIdx}</td>
                      <td className="px-2 py-1.5 w-20 text-muted-foreground">{item.itemCode || "-"}</td>
                      <td className="px-2 py-1.5 font-medium">{item.itemName}</td>
                      <td className="px-2 py-1.5 w-24 text-muted-foreground">{item.spec || "-"}</td>
                      {isEditing ? (
                        <>
                          <td className="px-1 py-1 w-14">
                            <Input
                              type="number"
                              value={editForm.quantity}
                              onChange={e => setEditForm(f => ({ ...f, quantity: parseInt(e.target.value) || 0 }))}
                              className="text-xs text-right w-12"
                              data-testid={`input-edit-qty-${item.id}`}
                            />
                          </td>
                          <td className="px-2 py-1.5 w-20 text-right text-muted-foreground">{fmtNum(item.costPrice)}</td>
                          <td className="px-1 py-1 w-20">
                            <Input
                              type="number"
                              value={editForm.unitPrice}
                              onChange={e => setEditForm(f => ({ ...f, unitPrice: parseInt(e.target.value) || 0 }))}
                              className="text-xs text-right"
                              data-testid={`input-edit-price-${item.id}`}
                            />
                          </td>
                          <td className="px-2 py-1.5 w-24 text-right">{fmtNum(editForm.quantity * editForm.unitPrice)}</td>
                          <td className="px-2 py-1.5 w-14 text-center">
                            <MarginBadge rate={calcMarginRate(editForm.unitPrice, item.costPrice || 0)} />
                          </td>
                          <td className="px-1 py-1 w-10">
                            <div className="flex gap-0.5">
                              <Button size="sm" variant="ghost" className="h-5 w-5 p-0"
                                data-testid={`button-confirm-edit-${item.id}`}
                                onClick={() => updateItemMut.mutate({ id: item.id, quantity: editForm.quantity, unitPrice: editForm.unitPrice })}>
                                <Check className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-5 w-5 p-0"
                                data-testid={`button-cancel-edit-${item.id}`}
                                onClick={() => setEditingItemId(null)}>
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-2 py-1.5 w-14 text-right">{fmtNum(item.quantity)}</td>
                          <td className="px-2 py-1.5 w-20 text-right text-muted-foreground">{fmtNum(item.costPrice)}</td>
                          <td className="px-2 py-1.5 w-20 text-right">{fmtNum(item.unitPrice)}</td>
                          <td className="px-2 py-1.5 w-24 text-right font-medium">{fmtNum(item.amount)}</td>
                          <td className="px-2 py-1.5 w-14 text-center"><MarginBadge rate={margin} /></td>
                          <td className="px-1 py-1 w-10">
                            <div className="flex gap-0.5">
                              <Button size="sm" variant="ghost" className="h-5 w-5 p-0"
                                data-testid={`button-edit-item-${item.id}`}
                                onClick={() => { setEditingItemId(item.id); setEditForm({ quantity: item.quantity, unitPrice: item.unitPrice }); }}>
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-destructive"
                                data-testid={`button-delete-item-${item.id}`}
                                onClick={() => deleteItemMut.mutate(item.id)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                }

                return rows;
              })}
              {items.length === 0 && (
                <tr><td colSpan={10} className="px-2 py-8 text-center text-muted-foreground">품목을 추가하세요</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function PricingTab({ quotation, items, inquiryId, onRefresh }: {
  quotation: Quotation;
  items: QuotationItem[];
  inquiryId: string;
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const [adjustmentAmount, setAdjustmentAmount] = useState(quotation.adjustmentAmount || 0);
  const [adjustmentNote, setAdjustmentNote] = useState(quotation.adjustmentNote || "");
  const [notes, setNotes] = useState(quotation.notes || "");
  const [adjustType, setAdjustType] = useState<"discount" | "add">(
    (quotation.adjustmentAmount || 0) >= 0 ? "add" : "discount"
  );
  const [absAmount, setAbsAmount] = useState(Math.abs(quotation.adjustmentAmount || 0));

  const subtotal = items.reduce((s, i) => s + (i.amount || 0), 0);
  const totalCost = items.reduce((s, i) => s + ((i.costPrice || 0) * i.quantity), 0);
  const effectiveAdjustment = adjustType === "discount" ? -absAmount : absAmount;
  const adjustedSubtotal = subtotal + effectiveAdjustment;
  const tax = Math.round(adjustedSubtotal * 0.1);
  const total = adjustedSubtotal + tax;

  const updateMut = useMutation({
    mutationFn: (body: any) => apiRequest("PATCH", `/api/quotations/${quotation.id}`, body),
    onSuccess: () => {
      onRefresh();
      queryClient.invalidateQueries({ queryKey: ["/api/inquiries", inquiryId, "quotations"] });
      toast({ title: "저장되었습니다" });
    },
    onError: () => toast({ title: "저장 실패", variant: "destructive" }),
  });

  const handleSave = () => {
    updateMut.mutate({
      adjustmentAmount: effectiveAdjustment,
      adjustmentNote,
      notes,
    });
  };

  const grouped = useMemo(() => {
    const map = new Map<string, QuotationItem[]>();
    for (const item of items) {
      const cat = item.category2 || item.category1 || "기타";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(item);
    }
    return map;
  }, [items]);

  return (
    <div className="space-y-4">
      <div className="border rounded-md overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left">카테고리</th>
              <th className="px-3 py-2 text-right">원가 합계</th>
              <th className="px-3 py-2 text-right">판매 합계</th>
              <th className="px-3 py-2 text-center">마진율</th>
            </tr>
          </thead>
          <tbody>
            {Array.from(grouped).map(([cat, catItems]) => {
              const catSale = catItems.reduce((s, i) => s + (i.amount || 0), 0);
              const catCost = catItems.reduce((s, i) => s + ((i.costPrice || 0) * i.quantity), 0);
              const catMargin = catSale > 0 && catCost > 0 ? Math.round(((catSale - catCost) / catSale) * 100) : 0;
              return (
                <tr key={cat} className="border-t">
                  <td className="px-3 py-2 font-medium">{cat}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{fmtNum(catCost)}원</td>
                  <td className="px-3 py-2 text-right">{fmtNum(catSale)}원</td>
                  <td className="px-3 py-2 text-center"><MarginBadge rate={catMargin} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="bg-muted/20 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span>공급가액 (품목 합계)</span>
          <span className="font-medium">{fmtNum(subtotal)}원</span>
        </div>
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>원가 합계</span>
          <span>{fmtNum(totalCost)}원</span>
        </div>

        <div className="border-t pt-3 space-y-2">
          <label className="text-sm font-medium">가격 조정</label>
          <div className="flex items-center gap-2">
            <Select value={adjustType} onValueChange={(v: "discount" | "add") => setAdjustType(v)}>
              <SelectTrigger className="w-24 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="discount">할인</SelectItem>
                <SelectItem value="add">추가</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="number"
              value={absAmount || ""}
              onChange={e => setAbsAmount(parseInt(e.target.value) || 0)}
              placeholder="금액"
              className="h-8 text-xs w-32"
              data-testid="input-adjustment-amount"
            />
            <span className="text-xs text-muted-foreground">원</span>
          </div>
          <Input
            value={adjustmentNote}
            onChange={e => setAdjustmentNote(e.target.value)}
            placeholder="조정 사유 (예: 대량 구매 할인)"
            className="h-8 text-xs"
            data-testid="input-adjustment-note"
          />
        </div>

        {effectiveAdjustment !== 0 && (
          <div className="flex items-center justify-between text-sm border-t pt-2">
            <span>{adjustType === "discount" ? "할인" : "추가"} 금액</span>
            <span className={adjustType === "discount" ? "text-red-500" : "text-blue-500"}>
              {effectiveAdjustment > 0 ? "+" : ""}{fmtNum(effectiveAdjustment)}원
            </span>
          </div>
        )}

        <div className="flex items-center justify-between text-sm border-t pt-2">
          <span>{effectiveAdjustment !== 0 ? "조정 후 공급가액" : "공급가액"}</span>
          <span className="font-medium">{fmtNum(adjustedSubtotal)}원</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span>부가세 (10%)</span>
          <span>{fmtNum(tax)}원</span>
        </div>
        <div className="flex items-center justify-between text-base border-t pt-2">
          <span className="font-bold">최종 합계</span>
          <span className="font-bold text-lg">{fmtNum(total)}원</span>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">비고</label>
        <Textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          className="text-xs mt-1"
          placeholder="견적서 비고 사항..."
          data-testid="input-quotation-notes"
        />
      </div>

      <Button onClick={handleSave} disabled={updateMut.isPending} data-testid="button-save-pricing">
        {updateMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
        저장
      </Button>
    </div>
  );
}

function ExportTab({ quotation, items, inquiry, inquiryId }: {
  quotation: Quotation;
  items: QuotationItem[];
  inquiry: Inquiry;
  inquiryId: string;
}) {
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);
  const [headerForm, setHeaderForm] = useState({
    quoteDate: quotation.quoteDate,
    validUntil: quotation.validUntil || "",
    status: quotation.status || "draft",
  });

  const subtotal = items.reduce((s, i) => s + (i.amount || 0), 0);
  const adjustment = quotation.adjustmentAmount || 0;
  const adjustedSubtotal = subtotal + adjustment;
  const tax = Math.round(adjustedSubtotal * 0.1);
  const total = adjustedSubtotal + tax;

  const updateMut = useMutation({
    mutationFn: (body: any) => apiRequest("PATCH", `/api/quotations/${quotation.id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotations", quotation.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/inquiries", inquiryId, "quotations"] });
      toast({ title: "저장되었습니다" });
    },
    onError: () => toast({ title: "저장 실패", variant: "destructive" }),
  });

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await apiRequest("POST", `/api/quotations/${quotation.id}/export`);
      const result = await res.json();
      toast({ title: "견적서 내보내기 완료", description: result.message });
      queryClient.invalidateQueries({ queryKey: ["/api/inquiries", inquiryId, "files"] });
    } catch (e: any) {
      toast({ title: "내보내기 실패", description: e.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const statusLabel: Record<string, string> = { draft: "작성중", sent: "발송", accepted: "수주" };

  return (
    <div className="space-y-4">
      <div className="bg-muted/20 rounded-lg p-4 space-y-2">
        <h4 className="text-sm font-semibold mb-2">고객 정보</h4>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div><span className="text-muted-foreground">회사명: </span>{inquiry.snapshotCompanyName || inquiry.customerName || "-"}</div>
          <div><span className="text-muted-foreground">담당자: </span>{inquiry.snapshotContactName || "-"}</div>
          <div><span className="text-muted-foreground">연락처: </span>{inquiry.snapshotPhone || "-"}</div>
          <div><span className="text-muted-foreground">이메일: </span>{inquiry.snapshotEmail || "-"}</div>
          {inquiry.snapshotAddress && (
            <div className="col-span-2"><span className="text-muted-foreground">주소: </span>{inquiry.snapshotAddress}</div>
          )}
        </div>
      </div>

      <div className="bg-muted/20 rounded-lg p-4 space-y-2">
        <h4 className="text-sm font-semibold mb-2">견적 요약</h4>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div><span className="text-muted-foreground">견적번호: </span>{quotation.quoteNumber}</div>
          <div><span className="text-muted-foreground">품목수: </span>{items.length}개</div>
          <div><span className="text-muted-foreground">공급가액: </span>{fmtNum(adjustedSubtotal)}원</div>
          <div className="font-bold"><span className="text-muted-foreground">최종합계: </span>{fmtNum(total)}원</div>
        </div>
      </div>

      <div className="border rounded-md p-4 space-y-3">
        <h4 className="text-sm font-semibold">견적서 정보 편집</h4>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium">견적일자</label>
            <Input type="date" value={headerForm.quoteDate} onChange={e => setHeaderForm(f => ({ ...f, quoteDate: e.target.value }))} className="h-8 text-xs mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium">유효기한</label>
            <Input type="date" value={headerForm.validUntil} onChange={e => setHeaderForm(f => ({ ...f, validUntil: e.target.value }))} className="h-8 text-xs mt-1" />
          </div>
          <div>
            <label className="text-xs font-medium">상태</label>
            <Select value={headerForm.status} onValueChange={v => setHeaderForm(f => ({ ...f, status: v }))}>
              <SelectTrigger className="h-8 text-xs mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">작성중</SelectItem>
                <SelectItem value="sent">발송</SelectItem>
                <SelectItem value="accepted">수주</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button size="sm" onClick={() => updateMut.mutate(headerForm)} disabled={updateMut.isPending}>
          <Check className="h-3 w-3 mr-1" />정보 저장
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 pt-2">
        {inquiry.onedriveFolderId && (
          <Button onClick={handleExport} disabled={exporting || items.length === 0} data-testid="button-export-onedrive">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
            견적서 생성 → OneDrive 업로드
          </Button>
        )}
        <Button
          variant="outline"
          onClick={() => window.open(`/api/quotations/${quotation.id}/download/pdf`, "_blank")}
          disabled={items.length === 0}
          data-testid="button-download-pdf"
        >
          <FileDown className="h-4 w-4 mr-1" />PDF 다운로드
        </Button>
        <Button
          variant="outline"
          onClick={() => window.open(`/api/quotations/${quotation.id}/download/xlsx`, "_blank")}
          disabled={items.length === 0}
          data-testid="button-download-xlsx"
        >
          <FileDown className="h-4 w-4 mr-1" />Excel 다운로드
        </Button>
      </div>
    </div>
  );
}

function QuotationModal({ quotationId, inquiryId, inquiry, open, onClose }: {
  quotationId: string;
  inquiryId: string;
  inquiry: Inquiry;
  open: boolean;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery<{ quotation: Quotation; items: QuotationItem[] }>({
    queryKey: ["/api/quotations", quotationId],
    queryFn: () => fetch(`/api/quotations/${quotationId}`).then(r => r.json()),
    enabled: open && !!quotationId,
  });

  const onRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/quotations", quotationId] });
  };

  const quotation = data?.quotation;
  const items = data?.items || [];
  const statusLabel: Record<string, string> = { draft: "작성중", sent: "발송", accepted: "수주" };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {quotation ? (
              <>
                {quotation.quoteNumber}
                <Badge variant={quotation.status === "accepted" ? "default" : "secondary"} className="ml-2">
                  {statusLabel[quotation.status || "draft"] || quotation.status}
                </Badge>
                <span className="text-sm text-muted-foreground font-normal ml-2">{quotation.quoteDate}</span>
              </>
            ) : "견적서"}
          </DialogTitle>
        </DialogHeader>

        {isLoading || !quotation ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="items" className="mt-2">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="items" data-testid="tab-items">품목</TabsTrigger>
              <TabsTrigger value="pricing" data-testid="tab-pricing">가격·합계</TabsTrigger>
              <TabsTrigger value="export" data-testid="tab-export">생성·내보내기</TabsTrigger>
            </TabsList>
            <TabsContent value="items" className="mt-4">
              <ItemsTab quotation={quotation} items={items} onRefresh={onRefresh} />
            </TabsContent>
            <TabsContent value="pricing" className="mt-4">
              <PricingTab quotation={quotation} items={items} inquiryId={inquiryId} onRefresh={onRefresh} />
            </TabsContent>
            <TabsContent value="export" className="mt-4">
              <ExportTab quotation={quotation} items={items} inquiry={inquiry} inquiryId={inquiryId} />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function QuotationSection({ inquiryId, inquiry }: { inquiryId: string; inquiry: Inquiry }) {
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
      setSelectedId(q.id);
      toast({ title: "새 견적서 생성됨" });
    },
    onError: () => toast({ title: "생성 실패", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/quotations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inquiries", inquiryId, "quotations"] });
      toast({ title: "견적서 삭제됨" });
    },
    onError: () => toast({ title: "삭제 실패", variant: "destructive" }),
  });

  const statusLabel: Record<string, string> = { draft: "작성중", sent: "발송", accepted: "수주" };

  return (
    <>
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
        <CardContent className="space-y-1.5">
          {isLoading && <div className="text-sm text-muted-foreground">불러오는 중...</div>}

          {quotationList.length === 0 && !isLoading && (
            <div className="text-sm text-muted-foreground text-center py-4">
              아직 견적서가 없습니다. "새 견적서" 버튼으로 작성을 시작하세요.
            </div>
          )}

          {quotationList.map(q => (
            <div
              key={q.id}
              className="flex items-center justify-between px-3 py-2 rounded-md border hover:bg-muted/50 cursor-pointer group"
              onClick={() => setSelectedId(q.id)}
              data-testid={`quotation-row-${q.id}`}
            >
              <div className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium text-sm">{q.quoteNumber}</span>
                <Badge variant={q.status === "accepted" ? "default" : "secondary"} className="text-[10px]">
                  {statusLabel[q.status || "draft"] || q.status}
                </Badge>
                <span className="text-xs text-muted-foreground">{q.quoteDate}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm("이 견적서를 삭제하시겠습니까?")) deleteMut.mutate(q.id);
                  }}
                  data-testid={`button-delete-quotation-${q.id}`}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {selectedId && (
        <QuotationModal
          quotationId={selectedId}
          inquiryId={inquiryId}
          inquiry={inquiry}
          open={!!selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </>
  );
}
