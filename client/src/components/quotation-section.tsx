import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  FileText, Plus, Trash2, Search, Pencil, Check, X,
  Upload, FileDown, Package, Loader2, Star, Mail, Send, ArrowUpToLine,
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Quotation, QuotationItem, Inquiry, ItemMaster, CompanySettings } from "@shared/schema";
import { useDialogContainer } from "@/hooks/use-dialog-container";

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
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const { ref: containerRef, container: portalContainer } = useDialogContainer();

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
    list = [...list].sort((a, b) => {
      const af = a.isFavorite ? 1 : 0;
      const bf = b.isFavorite ? 1 : 0;
      if (af !== bf) return bf - af;
      return (a.itemName || "").localeCompare(b.itemName || "");
    });
    return list.slice(0, 80);
  }, [activeItems, search, cat1Filter, cat2Filter]);

  const toggleFavoriteMutation = useMutation({
    mutationFn: async ({ id, isFavorite }: { id: string; isFavorite: boolean }) => {
      const res = await apiRequest("PATCH", `/api/items/${id}`, { isFavorite });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
    },
  });

  const handleReset = () => {
    setSearch("");
    setCat1Filter("all");
    setCat2Filter("all");
    setAddedIds(new Set());
  };

  return (
    <div ref={containerRef} className="inline-block">
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) handleReset(); }}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled} data-testid="button-add-quotation-item">
          <Plus className="h-3 w-3 mr-1" />품목 추가
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[520px] p-0" align="start" container={portalContainer}>
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
            <div className="flex gap-1 flex-wrap max-h-[72px] overflow-y-auto">
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
              <div className="flex gap-1 flex-wrap max-h-[72px] overflow-y-auto">
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
          {filtered.map(item => {
            const isAdded = addedIds.has(item.id);
            return (
              <div
                key={item.id}
                className={`flex items-center px-3 py-2 text-xs border-b last:border-0 ${isAdded ? "bg-green-50 dark:bg-green-950/20" : ""}`}
              >
                <button
                  type="button"
                  className="shrink-0 mr-1.5 p-0.5 rounded hover:bg-muted"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavoriteMutation.mutate({ id: item.id, isFavorite: !item.isFavorite });
                  }}
                  data-testid={`button-fav-${item.id}`}
                >
                  <Star className={`h-3.5 w-3.5 ${item.isFavorite ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40"}`} />
                </button>
                <button
                  type="button"
                  className="flex-1 text-left hover:bg-muted rounded px-1 py-0.5"
                  onClick={() => {
                    onSelect(item);
                    setAddedIds(prev => new Set(prev).add(item.id));
                  }}
                  data-testid={`option-item-${item.id}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      {isAdded && <Check className="h-3 w-3 text-green-600 shrink-0" />}
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
              </div>
            );
          })}
        </ScrollArea>
      </PopoverContent>
    </Popover>
    </div>
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

  const regularItems = useMemo(() => items.filter(i => !i.isAdjustment), [items]);

  const grouped = useMemo(() => {
    const map = new Map<string, QuotationItem[]>();
    for (const item of regularItems) {
      const cat = item.category1 || item.category2 || "기타";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(item);
    }
    return map;
  }, [regularItems]);

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

  const subtotal = regularItems.reduce((s, i) => s + (i.amount || 0), 0);
  const totalCost = regularItems.reduce((s, i) => s + ((i.costPrice || 0) * i.quantity), 0);
  const overallMargin = subtotal > 0 && totalCost > 0 ? Math.round(((subtotal - totalCost) / subtotal) * 100) : 0;

  let globalIdx = 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <ItemSearchPopover onSelect={handleAddItem} disabled={addItemMut.isPending} />
        <div className="text-xs text-muted-foreground">
          {regularItems.length}개 품목 · 총 마진율: <MarginBadge rate={overallMargin} />
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

const FALLBACK_NOTES = `[제외사항]
- 기술지원료
- 모니터, 키보드, 마우스, 배선 설치 및 배선
- 피더용 SMPS(24V 5A 이상), 조명용 SMPS(24V 2.5A 이상)

[기술지원]
- 현장 출장 1MD: 60만원 (8시간, 이동시간 제외, 숙식비 제외)
  대전 이남 80만원
- 원격 기술지원: 4시간 20만원`;

function PricingTab({ quotation, items, inquiryId, onRefresh }: {
  quotation: Quotation;
  items: QuotationItem[];
  inquiryId: string;
  onRefresh: () => void;
}) {
  const { data: companySettings } = useQuery<CompanySettings>({
    queryKey: ["/api/company-settings"],
  });

  const defaultNotes = companySettings?.quotationNotesTemplate || FALLBACK_NOTES;

  const { toast } = useToast();
  const [notes, setNotes] = useState(quotation.notes || defaultNotes);
  const [notesInitialized, setNotesInitialized] = useState(!!quotation.notes);

  useEffect(() => {
    if (!notesInitialized && !quotation.notes && companySettings?.quotationNotesTemplate) {
      setNotes(companySettings.quotationNotesTemplate);
      setNotesInitialized(true);
    }
  }, [companySettings?.quotationNotesTemplate, quotation.notes, notesInitialized]);

  const [newAdj, setNewAdj] = useState({ itemName: "", spec: "", quantity: 1, costPrice: 0, unitPrice: 0 });
  const [editingAdjId, setEditingAdjId] = useState<string | null>(null);
  const [editAdjForm, setEditAdjForm] = useState({ itemName: "", spec: "", quantity: 1, costPrice: 0, unitPrice: 0 });
  const [discountType, setDiscountType] = useState<string>(quotation.discountType || "amount");
  const [discountValue, setDiscountValue] = useState(quotation.discountValue || 0);
  const [discountTruncUnit, setDiscountTruncUnit] = useState<string>(quotation.discountTruncUnit || "none");
  const [deliveryDays, setDeliveryDays] = useState<number | null>(quotation.deliveryDays ?? null);
  const [deliveryAutoCalculated, setDeliveryAutoCalculated] = useState(!quotation.deliveryDays);

  const { data: purchaseItemsData } = useQuery<any[]>({ queryKey: ["/api/purchase-items"] });

  const regularItems = useMemo(() => items.filter(i => !i.isAdjustment), [items]);
  const adjustmentItems = useMemo(() => items.filter(i => i.isAdjustment), [items]);

  const regularSubtotal = regularItems.reduce((s, i) => s + (i.amount || 0), 0);
  const totalCost = regularItems.reduce((s, i) => s + ((i.costPrice || 0) * i.quantity), 0);
  const adjTotal = adjustmentItems.reduce((s, i) => s + (i.amount || 0), 0);
  const supplyAmount = regularSubtotal + adjTotal;

  const discountAmount = useMemo(() => {
    if (discountValue <= 0) return 0;
    if (discountType === "percent") return Math.round(supplyAmount * discountValue / 100);
    return discountValue;
  }, [discountType, discountValue, supplyAmount]);

  const afterDiscount = useMemo(() => {
    const raw = supplyAmount - discountAmount;
    const unit = parseInt(discountTruncUnit);
    if (unit > 0 && discountAmount > 0) return Math.floor(raw / unit) * unit;
    return raw;
  }, [discountAmount, discountTruncUnit, supplyAmount]);

  const actualDiscount = supplyAmount - afterDiscount;
  const tax = Math.round(afterDiscount * 0.1);
  const total = afterDiscount + tax;

  const autoDeliveryDays = useMemo(() => {
    if (!purchaseItemsData || regularItems.length === 0) return 0;
    const itemCodes = regularItems.map(i => i.itemCode).filter(Boolean);
    if (itemCodes.length === 0) return 0;
    let maxDays = 0;
    for (const code of itemCodes) {
      const pi = purchaseItemsData.find((p: any) => p.itemCode === code);
      if (pi?.leadTimeDays && pi.leadTimeDays > maxDays) maxDays = pi.leadTimeDays;
    }
    return maxDays;
  }, [purchaseItemsData, regularItems]);

  useEffect(() => {
    if (deliveryAutoCalculated && autoDeliveryDays > 0) {
      setDeliveryDays(autoDeliveryDays);
    }
  }, [autoDeliveryDays, deliveryAutoCalculated]);

  const addAdjMut = useMutation({
    mutationFn: (body: any) => apiRequest("POST", `/api/quotations/${quotation.id}/items`, body),
    onSuccess: () => {
      onRefresh();
      setNewAdj({ itemName: "", spec: "", quantity: 1, costPrice: 0, unitPrice: 0 });
    },
    onError: () => toast({ title: "추가 항목 추가 실패", variant: "destructive" }),
  });

  const updateAdjMut = useMutation({
    mutationFn: ({ id, ...body }: any) => apiRequest("PATCH", `/api/quotation-items/${id}`, body),
    onSuccess: () => { onRefresh(); setEditingAdjId(null); },
    onError: () => toast({ title: "수정 실패", variant: "destructive" }),
  });

  const deleteAdjMut = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/quotation-items/${id}`),
    onSuccess: onRefresh,
    onError: () => toast({ title: "삭제 실패", variant: "destructive" }),
  });

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
      notes,
      discountType,
      discountValue,
      discountTruncUnit,
      deliveryDays: deliveryDays || null,
      adjustmentAmount: -actualDiscount,
    });
  };

  const handleAddAdj = () => {
    if (!newAdj.itemName.trim()) {
      toast({ title: "품목명을 입력하세요", variant: "destructive" });
      return;
    }
    addAdjMut.mutate({
      itemName: newAdj.itemName,
      spec: newAdj.spec,
      quantity: newAdj.quantity,
      costPrice: newAdj.costPrice,
      unitPrice: newAdj.unitPrice,
      category1: "추가",
      category2: "",
      sortOrder: items.length,
      isAdjustment: true,
    });
  };

  return (
    <div className="space-y-4">
      <div className="border rounded-md overflow-hidden">
        <div className="bg-muted/50 px-3 py-2 text-xs font-semibold flex items-center justify-between">
          <span>추가/할인 항목</span>
          <span className="text-muted-foreground font-normal">{adjustmentItems.length}개 · 단가에 음수 입력 시 할인</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[600px]">
            <thead className="bg-muted/30">
              <tr>
                <th className="px-2 py-1.5 text-left">품목명</th>
                <th className="px-2 py-1.5 text-left w-24">사양</th>
                <th className="px-2 py-1.5 text-right w-14">수량</th>
                <th className="px-2 py-1.5 text-right w-20">원가</th>
                <th className="px-2 py-1.5 text-right w-20">단가</th>
                <th className="px-2 py-1.5 text-right w-24">금액</th>
                <th className="px-2 py-1.5 text-center w-14">마진</th>
                <th className="px-2 py-1.5 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {adjustmentItems.map(item => {
                const margin = calcMarginRate(item.unitPrice, item.costPrice || 0);
                const isEditing = editingAdjId === item.id;
                return (
                  <tr key={item.id} className="border-t hover:bg-muted/20" data-testid={`adj-item-row-${item.id}`}>
                    {isEditing ? (
                      <>
                        <td className="px-1 py-1">
                          <Input value={editAdjForm.itemName} onChange={e => setEditAdjForm(f => ({ ...f, itemName: e.target.value }))} className="text-xs h-7" data-testid={`input-edit-adj-name-${item.id}`} />
                        </td>
                        <td className="px-1 py-1 w-24">
                          <Input value={editAdjForm.spec} onChange={e => setEditAdjForm(f => ({ ...f, spec: e.target.value }))} className="text-xs h-7" data-testid={`input-edit-adj-spec-${item.id}`} />
                        </td>
                        <td className="px-1 py-1 w-14">
                          <Input type="number" value={editAdjForm.quantity} onChange={e => setEditAdjForm(f => ({ ...f, quantity: parseInt(e.target.value) || 0 }))} className="text-xs text-right h-7 w-12" data-testid={`input-edit-adj-qty-${item.id}`} />
                        </td>
                        <td className="px-1 py-1 w-20">
                          <Input type="number" value={editAdjForm.costPrice} onChange={e => setEditAdjForm(f => ({ ...f, costPrice: parseInt(e.target.value) || 0 }))} className="text-xs text-right h-7" data-testid={`input-edit-adj-cost-${item.id}`} />
                        </td>
                        <td className="px-1 py-1 w-20">
                          <Input type="number" value={editAdjForm.unitPrice} onChange={e => setEditAdjForm(f => ({ ...f, unitPrice: e.target.value === "" || e.target.value === "-" ? 0 : parseInt(e.target.value) }))} className="text-xs text-right h-7" data-testid={`input-edit-adj-price-${item.id}`} />
                        </td>
                        <td className="px-2 py-1.5 w-24 text-right">{fmtNum(editAdjForm.quantity * editAdjForm.unitPrice)}</td>
                        <td className="px-2 py-1.5 w-14 text-center"><MarginBadge rate={calcMarginRate(editAdjForm.unitPrice, editAdjForm.costPrice)} /></td>
                        <td className="px-1 py-1 w-10">
                          <div className="flex gap-0.5">
                            <Button size="sm" variant="ghost" className="h-5 w-5 p-0" data-testid={`button-confirm-edit-adj-${item.id}`}
                              onClick={() => updateAdjMut.mutate({ id: item.id, itemName: editAdjForm.itemName, spec: editAdjForm.spec, quantity: editAdjForm.quantity, costPrice: editAdjForm.costPrice, unitPrice: editAdjForm.unitPrice })}>
                              <Check className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-5 w-5 p-0" data-testid={`button-cancel-edit-adj-${item.id}`}
                              onClick={() => setEditingAdjId(null)}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-2 py-1.5 font-medium">{item.itemName}</td>
                        <td className="px-2 py-1.5 w-24 text-muted-foreground">{item.spec || "-"}</td>
                        <td className="px-2 py-1.5 w-14 text-right">{fmtNum(item.quantity)}</td>
                        <td className="px-2 py-1.5 w-20 text-right text-muted-foreground">{fmtNum(item.costPrice)}</td>
                        <td className="px-2 py-1.5 w-20 text-right">{fmtNum(item.unitPrice)}</td>
                        <td className="px-2 py-1.5 w-24 text-right font-medium">{fmtNum(item.amount)}</td>
                        <td className="px-2 py-1.5 w-14 text-center"><MarginBadge rate={margin} /></td>
                        <td className="px-1 py-1 w-10">
                          <div className="flex gap-0.5">
                            <Button size="sm" variant="ghost" className="h-5 w-5 p-0" data-testid={`button-edit-adj-${item.id}`}
                              onClick={() => { setEditingAdjId(item.id); setEditAdjForm({ itemName: item.itemName, spec: item.spec || "", quantity: item.quantity, costPrice: item.costPrice || 0, unitPrice: item.unitPrice }); }}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-destructive" data-testid={`button-delete-adj-${item.id}`}
                              onClick={() => deleteAdjMut.mutate(item.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
              <tr className="border-t bg-muted/10">
                <td className="px-1 py-1">
                  <Input value={newAdj.itemName} onChange={e => setNewAdj(f => ({ ...f, itemName: e.target.value }))} placeholder="품목명" className="text-xs h-7" data-testid="input-new-adj-name" />
                </td>
                <td className="px-1 py-1 w-24">
                  <Input value={newAdj.spec} onChange={e => setNewAdj(f => ({ ...f, spec: e.target.value }))} placeholder="사양" className="text-xs h-7" data-testid="input-new-adj-spec" />
                </td>
                <td className="px-1 py-1 w-14">
                  <Input type="number" value={newAdj.quantity} onChange={e => setNewAdj(f => ({ ...f, quantity: parseInt(e.target.value) || 0 }))} className="text-xs text-right h-7 w-12" data-testid="input-new-adj-qty" />
                </td>
                <td className="px-1 py-1 w-20">
                  <Input type="number" value={newAdj.costPrice || ""} onChange={e => setNewAdj(f => ({ ...f, costPrice: parseInt(e.target.value) || 0 }))} placeholder="원가" className="text-xs text-right h-7" data-testid="input-new-adj-cost" />
                </td>
                <td className="px-1 py-1 w-20">
                  <Input type="number" value={newAdj.unitPrice || ""} onChange={e => setNewAdj(f => ({ ...f, unitPrice: e.target.value === "" || e.target.value === "-" ? 0 : parseInt(e.target.value) }))} placeholder="단가 (음수=할인)" className="text-xs text-right h-7" data-testid="input-new-adj-price" />
                </td>
                <td className="px-2 py-1.5 w-24 text-right text-muted-foreground">{fmtNum(newAdj.quantity * newAdj.unitPrice)}</td>
                <td className="px-2 py-1.5 w-14"></td>
                <td className="px-1 py-1 w-10">
                  <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={handleAddAdj} disabled={addAdjMut.isPending} data-testid="button-add-adj">
                    <Plus className="h-3 w-3" />
                  </Button>
                </td>
              </tr>
              {adjustmentItems.length > 0 && (
                <tr className="border-t bg-muted/30">
                  <td colSpan={5} className="px-2 py-1.5 text-right font-semibold">추가 항목 소계</td>
                  <td className="px-2 py-1.5 w-24 text-right font-semibold">{fmtNum(adjTotal)}원</td>
                  <td colSpan={2}></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-muted/20 rounded-lg p-4 space-y-3">
        <div className="text-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-medium">공급가액 (품목{adjTotal !== 0 ? "+추가" : ""} 합계)</span>
            <span className="font-medium">{fmtNum(supplyAmount)}원</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground pl-2">
            <span>원가 {fmtNum(totalCost)}</span>
            <span>마진 {fmtNum(supplyAmount - totalCost)}</span>
            <span>마진율 {supplyAmount > 0 ? (((supplyAmount - totalCost) / supplyAmount) * 100).toFixed(1) : "0.0"}%</span>
          </div>
        </div>

        <div className="border-t pt-3 space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">할인</label>
            <Select value={discountType} onValueChange={(v) => { setDiscountType(v); setDiscountValue(0); }}>
              <SelectTrigger className="w-20 h-7 text-xs" data-testid="select-discount-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">비율(%)</SelectItem>
                <SelectItem value="amount">금액(원)</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="number"
              value={discountValue || ""}
              onChange={e => setDiscountValue(e.target.value === "" ? 0 : (discountType === "percent" ? parseFloat(e.target.value) || 0 : parseInt(e.target.value) || 0))}
              placeholder={discountType === "percent" ? "할인율" : "할인금액"}
              className="h-7 text-xs w-28"
              data-testid="input-discount-value"
            />
            <span className="text-xs text-muted-foreground">{discountType === "percent" ? "%" : "원"}</span>
            {discountType === "percent" && discountAmount > 0 && (
              <span className="text-xs text-muted-foreground">= -{fmtNum(discountAmount)}원</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">절사</label>
          <Select value={discountTruncUnit} onValueChange={setDiscountTruncUnit}>
            <SelectTrigger className="w-28 h-7 text-xs" data-testid="select-discount-trunc-unit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">절사 없음</SelectItem>
              <SelectItem value="1000">천원 절사</SelectItem>
              <SelectItem value="10000">만원 절사</SelectItem>
              <SelectItem value="100000">십만원 절사</SelectItem>
              <SelectItem value="1000000">백만원 절사</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {actualDiscount > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">할인</span>
            <span className="text-red-500">-{fmtNum(actualDiscount)}원 ({supplyAmount > 0 ? ((actualDiscount / supplyAmount) * 100).toFixed(1) : "0"}%)</span>
          </div>
        )}

        {actualDiscount > 0 && (
          <div className="bg-primary/10 rounded-md px-3 py-2 -mx-1 space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold">최종 공급가액</span>
              <span className="font-semibold">{fmtNum(afterDiscount)}원</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground pl-2">
              <span>마진 {fmtNum(afterDiscount - totalCost)}</span>
              <span>마진율 {afterDiscount > 0 ? (((afterDiscount - totalCost) / afterDiscount) * 100).toFixed(1) : "0.0"}%</span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between text-sm border-t pt-2">
          <span>부가세 (10%)</span>
          <span>{fmtNum(tax)}원</span>
        </div>
        <div className="flex items-center justify-between border-t pt-3">
          <span className="font-bold text-base">전체 금액</span>
          <span className="font-bold text-xl">{fmtNum(total)}원</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">납기</span>
        <Input
          type="number"
          value={deliveryDays ?? ""}
          onChange={e => {
            const v = e.target.value === "" ? null : parseInt(e.target.value) || 0;
            setDeliveryDays(v);
            setDeliveryAutoCalculated(false);
          }}
          className="h-7 text-xs w-16"
          placeholder="일"
          data-testid="input-delivery-days"
        />
        <span className="text-xs text-muted-foreground">일</span>
        {deliveryAutoCalculated && autoDeliveryDays > 0 && (
          <span className="text-xs text-muted-foreground">(자동)</span>
        )}
        {deliveryAutoCalculated && autoDeliveryDays === 0 && (
          <span className="text-xs text-muted-foreground">(리드타임 정보 없음)</span>
        )}
        {!deliveryAutoCalculated && autoDeliveryDays > 0 && (
          <button
            className="text-xs text-blue-500 hover:underline"
            onClick={() => { setDeliveryDays(autoDeliveryDays); setDeliveryAutoCalculated(true); }}
            data-testid="button-reset-delivery"
          >
            자동({autoDeliveryDays}일)으로 복원
          </button>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-sm font-medium">비고</label>
          <button
            type="button"
            className="text-xs text-blue-500 hover:underline"
            onClick={() => setNotes(defaultNotes)}
            data-testid="button-load-default-notes"
          >
            기본 메모 불러오기
          </button>
        </div>
        <Textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={9}
          className="text-xs"
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

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function QuotationHeaderBar({ quotation, items, inquiry, inquiryId }: {
  quotation: Quotation;
  items: QuotationItem[];
  inquiry: Inquiry;
  inquiryId: string;
}) {
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);
  const [quoteDate, setQuoteDate] = useState(quotation.quoteDate);
  const [status, setStatus] = useState(quotation.status || "draft");
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState(inquiry.snapshotEmail || "");
  const [emailCc, setEmailCc] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [sending, setSending] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState("");
  const [syncing, setSyncing] = useState(false);

  const updateMut = useMutation({
    mutationFn: (body: any) => apiRequest("PATCH", `/api/quotations/${quotation.id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotations", quotation.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/inquiries", inquiryId, "quotations"] });
      toast({ title: "저장되었습니다" });
    },
    onError: () => toast({ title: "저장 실패", variant: "destructive" }),
  });

  const handleSaveHeader = () => {
    updateMut.mutate({
      quoteDate,
      validUntil: addDays(quoteDate, 30),
      status,
    });
  };

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

  const openEmailDialog = async () => {
    let latestEmail = inquiry.snapshotEmail || "";
    let latestCompanyName = inquiry.snapshotCompanyName || "고객";
    try {
      const inqRes = await fetch(`/api/inquiries/${inquiryId}`);
      if (inqRes.ok) {
        const latestInquiry = await inqRes.json();
        latestEmail = latestInquiry.snapshotEmail || latestEmail;
        latestCompanyName = latestInquiry.snapshotCompanyName || latestCompanyName;
      }
    } catch {}
    setEmailTo(latestEmail);
    setEmailSubject(`[견적서] ${quotation.quoteNumber}`);
    const defaultBody = `안녕하세요, ${latestCompanyName}님.\n\n요청하신 견적서를 첨부드립니다.\n\n견적번호: ${quotation.quoteNumber}\n\n검토 후 궁금하신 사항이 있으시면 언제든 연락 주시기 바랍니다.\n\n감사합니다.`;
    try {
      const settingsRes = await fetch("/api/company-settings");
      if (settingsRes.ok) {
        const settings = await settingsRes.json();
        setEmailCc(settings.autoCc || "");
        if (settings.emailTemplate) {
          const body = settings.emailTemplate
            .replace(/\{고객명\}/g, latestCompanyName)
            .replace(/\{견적번호\}/g, quotation.quoteNumber);
          setEmailBody(body);
        } else {
          setEmailBody(defaultBody);
        }
      } else {
        setEmailBody(defaultBody);
      }
    } catch {
      setEmailBody(defaultBody);
    }
    const previewUrl = `/api/quotations/${quotation.id}/download/pdf?inline=1&t=${Date.now()}`;
    setPdfPreviewUrl(previewUrl);
    setEmailOpen(true);
  };

  const handleSendEmail = async () => {
    if (!emailTo) {
      toast({ title: "수신자 이메일을 입력해주세요", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const res = await apiRequest("POST", `/api/quotations/${quotation.id}/send-email`, {
        to: emailTo,
        subject: emailSubject,
        body: `<div style="font-family: 'Malgun Gothic', sans-serif; padding: 20px; white-space: pre-line;">${emailBody}</div>`,
        cc: emailCc || undefined,
      });
      const result = await res.json();
      toast({ title: "이메일 전송 완료", description: result.message });
      setEmailOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/quotations", quotation.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/inquiries", inquiryId, "quotations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inquiries"] });
    } catch (e: any) {
      toast({ title: "이메일 전송 실패", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleSyncToInquiry = async () => {
    setSyncing(true);
    try {
      const res = await apiRequest("POST", `/api/quotations/${quotation.id}/sync-to-inquiry`);
      const result = await res.json();
      toast({ title: "인콰이어리 반영 완료", description: `판매가: ${result.totalSales?.toLocaleString()}원` });
      queryClient.invalidateQueries({ queryKey: ["/api/inquiries", inquiryId] });
      queryClient.invalidateQueries({ queryKey: ["/api/inquiries"] });
    } catch (e: any) {
      toast({ title: "반영 실패", description: e.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <>
    <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>견적서 이메일 전송</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-3">
            {!inquiry.snapshotEmail && (
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md p-2">
                <p className="text-xs text-amber-700 dark:text-amber-400">고객 이메일이 등록되어 있지 않습니다. 입력하시면 고객정보에 자동 저장됩니다.</p>
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">수신자 이메일</Label>
              <Input
                value={emailTo}
                onChange={e => setEmailTo(e.target.value)}
                placeholder="customer@example.com"
                className="text-sm"
                autoFocus={!inquiry.snapshotEmail}
                data-testid="input-email-to"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">CC</Label>
              <Input
                value={emailCc}
                onChange={e => setEmailCc(e.target.value)}
                placeholder="cc@example.com (쉼표로 구분)"
                className="text-sm"
                data-testid="input-email-cc"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">제목</Label>
              <Input
                value={emailSubject}
                onChange={e => setEmailSubject(e.target.value)}
                className="text-sm"
                data-testid="input-email-subject"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">본문</Label>
              <Textarea
                value={emailBody}
                onChange={e => setEmailBody(e.target.value)}
                rows={8}
                className="text-sm"
                data-testid="input-email-body"
              />
            </div>
            <p className="text-xs text-muted-foreground">PDF 견적서가 자동으로 첨부됩니다.</p>
          </div>
          <div className="border rounded-md overflow-hidden bg-muted/20">
            <div className="text-xs font-medium px-2 py-1 bg-muted border-b">견적서 미리보기</div>
            {pdfPreviewUrl && (
              <iframe
                src={pdfPreviewUrl}
                className="w-full h-[500px]"
                title="견적서 미리보기"
                data-testid="iframe-pdf-preview"
              />
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setEmailOpen(false)} data-testid="button-email-cancel">취소</Button>
          <Button onClick={handleSendEmail} disabled={sending} data-testid="button-email-send">
            {sending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
            전송
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <div className="flex items-center gap-2 flex-wrap border rounded-md px-3 py-2 bg-muted/30">
      <div className="flex items-center gap-1.5 text-xs">
        <span className="text-muted-foreground">견적일</span>
        <Input
          type="date"
          value={quoteDate}
          onChange={e => setQuoteDate(e.target.value)}
          className="h-7 text-xs w-32"
          data-testid="input-quote-date"
        />
      </div>
      <div className="flex items-center gap-1.5 text-xs">
        <span className="text-muted-foreground">유효</span>
        <span className="text-xs">{addDays(quoteDate, 30)}</span>
      </div>
      <Select value={status} onValueChange={setStatus}>
        <SelectTrigger className="h-7 text-xs w-20" data-testid="select-quote-status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="draft">작성중</SelectItem>
          <SelectItem value="sent">발송</SelectItem>
          <SelectItem value="accepted">수주</SelectItem>
        </SelectContent>
      </Select>
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleSaveHeader} disabled={updateMut.isPending} data-testid="button-save-header">
        <Check className="h-3 w-3 mr-1" />저장
      </Button>
      <div className="flex-1" />
      {inquiry.onedriveFolderId && (
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleExport} disabled={exporting || items.length === 0} data-testid="button-export-onedrive">
          {exporting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Upload className="h-3 w-3 mr-1" />}
          OneDrive
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs"
        onClick={() => window.open(`/api/quotations/${quotation.id}/download/pdf`, "_blank")}
        disabled={items.length === 0}
        data-testid="button-download-pdf"
      >
        <FileDown className="h-3 w-3 mr-1" />PDF
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs"
        onClick={() => window.open(`/api/quotations/${quotation.id}/download/xlsx`, "_blank")}
        disabled={items.length === 0}
        data-testid="button-download-xlsx"
      >
        <FileDown className="h-3 w-3 mr-1" />Excel
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs"
        onClick={handleSyncToInquiry}
        disabled={syncing || items.length === 0}
        data-testid="button-sync-to-inquiry"
      >
        {syncing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ArrowUpToLine className="h-3 w-3 mr-1" />}
        반영
      </Button>
      <Button
        size="sm"
        variant="default"
        className="h-7 text-xs"
        onClick={openEmailDialog}
        disabled={items.length === 0}
        data-testid="button-send-email"
      >
        <Mail className="h-3 w-3 mr-1" />이메일
      </Button>
    </div>
    </>
  );
}

function QuotationDetailInline({ quotationId, inquiryId, inquiry }: {
  quotationId: string;
  inquiryId: string;
  inquiry: Inquiry;
}) {
  const { data, isLoading } = useQuery<{ quotation: Quotation; items: QuotationItem[] }>({
    queryKey: ["/api/quotations", quotationId],
    queryFn: () => fetch(`/api/quotations/${quotationId}`).then(r => r.json()),
    enabled: !!quotationId,
  });

  const onRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/quotations", quotationId] });
  };

  const quotation = data?.quotation;
  const items = data?.items || [];

  if (isLoading || !quotation) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <QuotationHeaderBar quotation={quotation} items={items} inquiry={inquiry} inquiryId={inquiryId} />

      <div className="border-2 border-primary/20 rounded-lg p-3 bg-background">
        <ItemsTab quotation={quotation} items={items} onRefresh={onRefresh} />
      </div>

      <PricingTab quotation={quotation} items={items} inquiryId={inquiryId} onRefresh={onRefresh} />
    </div>
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
      const inqNum = inquiry.inquiryNumber?.replace(/^.*?(\d+)$/, "$1") || "0";
      const base = `Q-${year}-${inqNum}`;
      let quoteNumber: string;
      if (quotationList.length === 0) {
        quoteNumber = base;
      } else {
        let maxRev = 0;
        for (const q of quotationList) {
          const m = q.quoteNumber.match(/-r(\d+)$/);
          if (m) {
            maxRev = Math.max(maxRev, parseInt(m[1], 10));
          }
        }
        quoteNumber = `${base}-r${maxRev + 1}`;
      }
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
    onSuccess: (_data, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/inquiries", inquiryId, "quotations"] });
      if (selectedId === deletedId) setSelectedId(null);
      toast({ title: "견적서 삭제됨" });
    },
    onError: () => toast({ title: "삭제 실패", variant: "destructive" }),
  });

  const statusLabel: Record<string, string> = { draft: "작성중", sent: "발송", accepted: "수주" };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap flex-1">
          {isLoading && <span className="text-xs text-muted-foreground">불러오는 중...</span>}
          {quotationList.map(q => (
            <div key={q.id} className="flex items-center gap-1">
              <Button
                size="sm"
                variant={selectedId === q.id ? "default" : "outline"}
                className="text-xs px-3"
                onClick={() => setSelectedId(selectedId === q.id ? null : q.id)}
                data-testid={`quotation-row-${q.id}`}
              >
                <FileText className="h-3 w-3 mr-1" />
                {q.quoteNumber}
                <Badge
                  variant={q.status === "accepted" ? "default" : "secondary"}
                  className="text-[9px] ml-1.5 px-1"
                >
                  {statusLabel[q.status || "draft"] || q.status}
                </Badge>
              </Button>
              {selectedId === q.id && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm("이 견적서를 삭제하시겠습니까?")) deleteMut.mutate(q.id);
                  }}
                  data-testid={`button-delete-quotation-${q.id}`}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}
        </div>
        <Button size="sm" onClick={() => createMut.mutate()} disabled={createMut.isPending} data-testid="button-new-quotation">
          <Plus className="h-3 w-3 mr-1" />새 견적서
        </Button>
      </div>

      {!selectedId && quotationList.length === 0 && !isLoading && (
        <div className="text-sm text-muted-foreground text-center py-8 border rounded-md">
          아직 견적서가 없습니다. "새 견적서" 버튼으로 작성을 시작하세요.
        </div>
      )}

      {!selectedId && quotationList.length > 0 && (
        <div className="text-sm text-muted-foreground text-center py-8 border rounded-md">
          위에서 견적서를 선택하세요.
        </div>
      )}

      {selectedId && (
        <QuotationDetailInline
          quotationId={selectedId}
          inquiryId={inquiryId}
          inquiry={inquiry}
        />
      )}
    </div>
  );
}
