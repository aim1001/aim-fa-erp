import { useQuery, useMutation } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Package, RefreshCw, Search, ChevronDown, ChevronUp, Save, X, Pencil, Plus, Upload, Trash2, Layers, PlusCircle, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { useState, useMemo, Fragment, useCallback, useRef, useEffect } from "react";
import { useDialogContainer } from "@/hooks/use-dialog-container";
import { Input } from "@/components/ui/input";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ItemMaster, ItemInventory, ItemDocument, ItemComponent, PurchaseItem } from "@shared/schema";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type ItemWithDetails = ItemMaster & {
  inventory: ItemInventory[];
  documents: ItemDocument[];
};

function formatPrice(val: number | null) {
  if (!val) return "-";
  return val.toLocaleString("ko-KR") + "원";
}

function getStockQty(inventory: ItemInventory[], type: string): number {
  const found = inventory.find(i => i.stockType === type);
  return found?.qty ?? 0;
}

function InlineCombobox({
  value,
  options,
  onSave,
  testId,
  className = "",
}: {
  value: string;
  options: string[];
  onSave: (val: string) => void;
  testId: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [isTyping, setIsTyping] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredOptions = useMemo(() => {
    if (!isTyping || !draft) return options;
    const q = draft.toLowerCase();
    return options.filter(o => o.toLowerCase().includes(q));
  }, [options, draft, isTyping]);

  const handleSelect = useCallback((val: string) => {
    setOpen(false);
    if (val !== value) onSave(val);
  }, [value, onSave]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      setOpen(false);
      if (draft !== value) onSave(draft);
    }
    if (e.key === "Escape") {
      setOpen(false);
      setDraft(value);
    }
  }, [draft, value, onSave]);

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) { setDraft(value); setIsTyping(false); } else { setIsTyping(false); } }}>
      <PopoverTrigger asChild>
        <span
          className={`cursor-pointer group/edit inline-flex items-center gap-1 ${className}`}
          onClick={e => e.stopPropagation()}
          data-testid={`field-${testId}`}
        >
          <span>{value || "-"}</span>
          <Pencil className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover/edit:opacity-100 transition-opacity shrink-0" />
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-2" align="start" onClick={e => e.stopPropagation()}>
        <Input
          ref={inputRef}
          className="h-7 text-xs px-2 mb-1"
          value={draft}
          onChange={e => { setDraft(e.target.value); setIsTyping(true); }}
          onKeyDown={handleKeyDown}
          placeholder="직접 입력..."
          autoFocus
          data-testid={`input-combo-${testId}`}
        />
        <div className="max-h-[150px] overflow-auto">
          {filteredOptions.map(opt => (
            <div
              key={opt}
              className={`text-xs px-2 py-1 rounded cursor-pointer hover-elevate ${opt === value ? "bg-accent" : ""}`}
              onClick={() => handleSelect(opt)}
              data-testid={`option-combo-${testId}-${opt}`}
            >
              {opt}
            </div>
          ))}
          {filteredOptions.length === 0 && draft && (
            <div
              className="text-xs px-2 py-1 rounded cursor-pointer text-blue-600 hover-elevate"
              onClick={() => handleSelect(draft)}
              data-testid={`option-combo-new-${testId}`}
            >
              "{draft}" 새로 추가
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ComboboxInput({
  value,
  options,
  onChange,
  placeholder,
  testId,
}: {
  value: string;
  options: string[];
  onChange: (val: string) => void;
  placeholder?: string;
  testId: string;
  container?: HTMLElement | null; // kept for API compatibility
}) {
  const [open, setOpen] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const filteredOptions = useMemo(() => {
    if (!isTyping || !value) return options;
    const q = value.toLowerCase();
    return options.filter(o => o.toLowerCase().includes(q));
  }, [options, value, isTyping]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setIsTyping(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        value={value}
        onChange={e => { onChange(e.target.value); setIsTyping(true); setOpen(true); }}
        onFocus={() => { setIsTyping(false); setOpen(true); }}
        placeholder={placeholder}
        data-testid={testId}
      />
      {open && (
        <div className="absolute z-50 top-full left-0 w-full min-w-[180px] bg-popover border rounded-md shadow-md mt-1 max-h-[160px] overflow-auto">
          {filteredOptions.length > 0 ? (
            filteredOptions.map(opt => (
              <div
                key={opt}
                className={`text-xs px-2 py-1.5 cursor-pointer hover:bg-accent ${opt === value ? "bg-accent font-medium" : ""}`}
                onMouseDown={e => { e.preventDefault(); onChange(opt); setOpen(false); setIsTyping(false); }}
                data-testid={`option-${testId}-${opt}`}
              >
                {opt}
              </div>
            ))
          ) : (
            <div className="text-xs px-2 py-2 text-muted-foreground">
              {value ? `"${value}" 직접 입력` : "직접 입력하세요"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InlineEdit({
  value,
  onSave,
  type = "text",
  testId,
  className = "",
}: {
  value: string;
  onSave: (val: string) => void;
  type?: "text" | "number";
  testId: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const handleSave = useCallback(() => {
    setEditing(false);
    if (draft !== value) onSave(draft);
  }, [draft, value, onSave]);

  const handleCancel = useCallback(() => {
    setEditing(false);
    setDraft(value);
  }, [value]);

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          className="h-6 text-xs px-1.5 w-full min-w-[60px]"
          type={type}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") handleCancel();
          }}
          onBlur={handleSave}
          autoFocus
          data-testid={`input-edit-${testId}`}
        />
        <Button size="icon" variant="ghost" className="h-5 w-5 shrink-0" onClick={handleSave} data-testid={`button-save-${testId}`}>
          <Save className="h-2.5 w-2.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-5 w-5 shrink-0" onClick={handleCancel} data-testid={`button-cancel-${testId}`}>
          <X className="h-2.5 w-2.5" />
        </Button>
      </div>
    );
  }

  return (
    <span
      className={`cursor-pointer group/edit inline-flex items-center gap-1 ${className}`}
      onClick={e => { e.stopPropagation(); setEditing(true); setDraft(value); }}
      data-testid={`field-${testId}`}
    >
      <span>{type === "number" ? formatPrice(Number(value) || null) : (value || "-")}</span>
      <Pencil className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover/edit:opacity-100 transition-opacity shrink-0" />
    </span>
  );
}

function ItemDetailRow({
  item,
  itemTypes,
  categories,
  category2s,
}: {
  item: ItemWithDetails;
  itemTypes: string[];
  categories: string[];
  category2s: string[];
}) {
  const { toast } = useToast();

  const patchMutation = useMutation({
    mutationFn: async (fields: Record<string, any>) => {
      const res = await apiRequest("PATCH", `/api/items/${item.id}`, fields);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      toast({ title: "저장 완료" });
    },
    onError: (err: Error) => {
      toast({ title: "저장 실패", description: err.message, variant: "destructive" });
    },
  });

  const margin = item.cost && item.salesPrice ? item.salesPrice - item.cost : null;
  const marginPct = margin && item.salesPrice ? Math.round((margin / item.salesPrice) * 100) : null;

  return (
    <div className="relative bg-blue-50/60 dark:bg-blue-950/20 border-l-[3px] border-l-blue-500">
      <div className="px-4 py-2.5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
        {patchMutation.isPending && (
          <div className="flex items-center gap-1 text-blue-600">
            <RefreshCw className="h-3 w-3 animate-spin" />
            <span>저장 중...</span>
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">대분류</span>
          <InlineCombobox
            value={item.category1}
            options={categories}
            onSave={val => patchMutation.mutate({ category1: val })}
            testId={`cat1-edit-${item.itemCode}`}
            className="font-medium"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">소분류</span>
          <InlineCombobox
            value={item.category2 || ""}
            options={category2s}
            onSave={val => patchMutation.mutate({ category2: val })}
            testId={`cat2-edit-${item.itemCode}`}
          />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">품목명</span>
          <InlineEdit
            value={item.itemName}
            onSave={val => patchMutation.mutate({ itemName: val })}
            testId={`name-${item.itemCode}`}
            className="font-medium"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">사양</span>
          <InlineEdit
            value={item.spec || ""}
            onSave={val => patchMutation.mutate({ spec: val })}
            testId={`spec-${item.itemCode}`}
          />
        </div>

        <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
          <span className="text-muted-foreground">유형</span>
          <Select
            value={item.itemType || "__none__"}
            onValueChange={val => patchMutation.mutate({ itemType: val === "__none__" ? null : val })}
          >
            <SelectTrigger className="h-6 text-xs px-2 w-[100px] border-dashed" data-testid={`select-type-${item.itemCode}`}>
              <SelectValue placeholder="-" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__" className="text-muted-foreground">(없음)</SelectItem>
              {itemTypes.map(t => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">원가</span>
          <InlineEdit
            value={String(item.cost || 0)}
            type="number"
            onSave={val => patchMutation.mutate({ cost: parseInt(val, 10) || 0 })}
            testId={`cost-${item.itemCode}`}
          />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">판매가</span>
          <InlineEdit
            value={String(item.salesPrice || 0)}
            type="number"
            onSave={val => patchMutation.mutate({ salesPrice: parseInt(val, 10) || 0 })}
            testId={`price-${item.itemCode}`}
            className="font-medium text-blue-700 dark:text-blue-400"
          />
        </div>

        {margin !== null && (
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">마진</span>
            <span className="font-medium text-green-700 dark:text-green-400" data-testid={`text-detail-margin-${item.itemCode}`}>
              {formatPrice(margin)} ({marginPct}%)
            </span>
          </div>
        )}

        <div className="flex items-center gap-1.5 ml-auto" onClick={e => e.stopPropagation()}>
          <span className="text-muted-foreground">활성</span>
          <Switch
            checked={item.active ?? true}
            onCheckedChange={val => patchMutation.mutate({ active: val })}
            className="scale-75"
            data-testid={`switch-active-${item.itemCode}`}
          />
        </div>

        {item.inventory.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">재고</span>
            {item.inventory.map(inv => (
              <Badge key={inv.id} variant="outline" className="text-[10px] h-4 px-1.5 font-normal">
                {inv.stockType} {inv.qty}
              </Badge>
            ))}
          </div>
        )}

        {item.documents.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">문서</span>
            {item.documents.map(doc => (
              <Badge key={doc.id} variant="secondary" className="text-[10px] h-4 px-1.5 font-normal">
                {doc.docType}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <ComponentSection itemId={item.id} itemCost={item.cost} patchItemCost={(cost: number) => patchMutation.mutate({ cost })} />
    </div>
  );
}

function ComponentSection({
  itemId,
  itemCost,
  patchItemCost,
}: {
  itemId: string;
  itemCost: number | null;
  patchItemCost: (cost: number) => void;
}) {
  const { toast } = useToast();
  const [showAddDialog, setShowAddDialog] = useState(false);

  const { data: components = [], isLoading } = useQuery<ItemComponent[]>({
    queryKey: ["/api/items", itemId, "components"],
    queryFn: async () => {
      const res = await fetch(`/api/items/${itemId}/components`, { credentials: "include" });
      if (!res.ok) throw new Error("구성품 로드 실패");
      return res.json();
    },
  });

  const { data: purchaseItems = [] } = useQuery<PurchaseItem[]>({
    queryKey: ["/api/purchase-items"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (compId: string) => {
      await apiRequest("DELETE", `/api/items/${itemId}/components/${compId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items", itemId, "components"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-items/bom-links"] });
      toast({ title: "구성품 삭제 완료" });
    },
  });

  const patchCompMutation = useMutation({
    mutationFn: async ({ compId, fields }: { compId: string; fields: Record<string, any> }) => {
      const res = await apiRequest("PATCH", `/api/items/${itemId}/components/${compId}`, fields);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items", itemId, "components"] });
    },
  });

  const purchaseItemMap = useMemo(() => {
    const m = new Map<string, PurchaseItem>();
    purchaseItems.forEach(pi => m.set(pi.id, pi));
    return m;
  }, [purchaseItems]);

  const getEffectiveCost = (comp: ItemComponent) => {
    if (comp.unitCost !== null && comp.unitCost !== undefined) return comp.unitCost;
    if (comp.purchaseItemId) {
      const pi = purchaseItemMap.get(comp.purchaseItemId);
      return pi?.cost ?? 0;
    }
    return 0;
  };

  const totalCost = components.reduce((sum, c) => sum + getEffectiveCost(c) * c.quantity, 0);

  return (
    <div className="border-t border-blue-200/50 dark:border-blue-800/30 px-4 py-2" onClick={e => e.stopPropagation()}>
      <div className="flex items-center gap-2 mb-1.5">
        <Layers className="h-3.5 w-3.5 text-blue-500" />
        <span className="text-xs font-medium text-blue-700 dark:text-blue-400">구성품 (BOM)</span>
        <Badge variant="outline" className="text-[10px] h-4 px-1.5">{components.length}건</Badge>
        <Button
          size="sm"
          variant="ghost"
          className="h-5 px-1.5 text-[10px] ml-auto"
          onClick={() => setShowAddDialog(true)}
          data-testid={`button-add-component-${itemId}`}
        >
          <PlusCircle className="h-3 w-3 mr-0.5" />추가
        </Button>
      </div>

      {isLoading && <div className="text-[10px] text-muted-foreground">로딩 중...</div>}

      {components.length > 0 && (
        <div className="space-y-0.5">
          <div className="grid grid-cols-[1fr_80px_80px_80px_24px] gap-1 text-[10px] text-muted-foreground px-1">
            <span>품명</span>
            <span className="text-right">단가</span>
            <span className="text-center">수량</span>
            <span className="text-right">소계</span>
            <span></span>
          </div>
          {components.map(comp => {
            const effCost = getEffectiveCost(comp);
            const subtotal = effCost * comp.quantity;
            return (
              <div key={comp.id} className={`grid grid-cols-[1fr_80px_80px_80px_24px] gap-1 items-center text-xs px-1 py-0.5 rounded ${comp.isAdjustment ? "bg-orange-50 dark:bg-orange-950/20" : "bg-white/50 dark:bg-gray-900/30"}`}>
                <div className="flex items-center gap-1 min-w-0">
                  {comp.purchaseItemId && (
                    <Tooltip>
                      <TooltipTrigger>
                        <Badge variant="outline" className="text-[9px] h-3.5 px-1 shrink-0 bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400">연결</Badge>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        구매품 연결됨: {purchaseItemMap.get(comp.purchaseItemId)?.itemCode || comp.purchaseItemId}
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {comp.isAdjustment && (
                    <Badge variant="outline" className="text-[9px] h-3.5 px-1 shrink-0 bg-orange-50 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400">조정</Badge>
                  )}
                  <span className="truncate" data-testid={`text-comp-name-${comp.id}`}>{comp.itemName}</span>
                  {comp.spec && <span className="text-muted-foreground truncate">({comp.spec})</span>}
                </div>
                <span className="text-right tabular-nums" data-testid={`text-comp-cost-${comp.id}`}>{effCost.toLocaleString()}</span>
                <div className="text-center">
                  <input
                    type="number"
                    className="w-12 text-center text-xs bg-transparent border-b border-dashed border-gray-300 dark:border-gray-600 focus:outline-none focus:border-blue-500"
                    defaultValue={comp.quantity}
                    min={1}
                    onBlur={e => {
                      const newQty = parseInt(e.target.value, 10) || 1;
                      if (newQty !== comp.quantity) {
                        patchCompMutation.mutate({ compId: comp.id, fields: { quantity: newQty } });
                      }
                    }}
                    onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    data-testid={`input-comp-qty-${comp.id}`}
                  />
                </div>
                <span className="text-right tabular-nums font-medium" data-testid={`text-comp-subtotal-${comp.id}`}>{subtotal.toLocaleString()}</span>
                <button
                  className="text-destructive/50 hover:text-destructive p-0.5"
                  onClick={() => deleteMutation.mutate(comp.id)}
                  data-testid={`button-delete-comp-${comp.id}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            );
          })}
          <div className="grid grid-cols-[1fr_80px_80px_80px_24px] gap-1 text-xs px-1 pt-1 border-t border-dashed border-blue-200/50 dark:border-blue-800/30">
            <span className="font-medium">합계 원가</span>
            <span></span>
            <span></span>
            <span className="text-right font-bold tabular-nums text-blue-700 dark:text-blue-400" data-testid={`text-bom-total-${itemId}`}>
              {totalCost.toLocaleString()}
            </span>
            <span></span>
          </div>
          {totalCost !== (itemCost || 0) && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] text-muted-foreground">현재 원가: {(itemCost || 0).toLocaleString()}원</span>
              <Button
                size="sm"
                variant="outline"
                className="h-5 px-2 text-[10px]"
                onClick={() => patchItemCost(totalCost)}
                data-testid={`button-apply-bom-cost-${itemId}`}
              >
                원가 적용 ({totalCost.toLocaleString()})
              </Button>
            </div>
          )}
        </div>
      )}

      {components.length === 0 && !isLoading && (
        <div className="text-[10px] text-muted-foreground py-1">
          등록된 구성품이 없습니다.
          <button className="text-blue-500 hover:underline ml-1" onClick={() => setShowAddDialog(true)} data-testid={`link-add-component-${itemId}`}>
            추가하기
          </button>
        </div>
      )}

      <AddComponentDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        itemId={itemId}
        purchaseItems={purchaseItems}
      />
    </div>
  );
}

function AddComponentDialog({
  open,
  onOpenChange,
  itemId,
  purchaseItems,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  itemId: string;
  purchaseItems: PurchaseItem[];
}) {
  const { toast } = useToast();
  const { ref: dialogRef, container } = useDialogContainer();
  const [mode, setMode] = useState<"search" | "manual">("search");
  const [search, setSearch] = useState("");
  const [selectedPI, setSelectedPI] = useState<PurchaseItem | null>(null);
  const [manualName, setManualName] = useState("");
  const [manualSpec, setManualSpec] = useState("");
  const [manualCost, setManualCost] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [isAdjustment, setIsAdjustment] = useState(false);
  const [remark, setRemark] = useState("");

  const resetForm = () => {
    setMode("search");
    setSearch("");
    setSelectedPI(null);
    setManualName("");
    setManualSpec("");
    setManualCost("");
    setQuantity("1");
    setIsAdjustment(false);
    setRemark("");
  };

  const filteredPI = useMemo(() => {
    if (!search) return purchaseItems.slice(0, 20);
    const q = search.toLowerCase();
    return purchaseItems.filter(pi =>
      pi.itemName.toLowerCase().includes(q) ||
      pi.itemCode.toLowerCase().includes(q) ||
      (pi.spec && pi.spec.toLowerCase().includes(q))
    ).slice(0, 20);
  }, [purchaseItems, search]);

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("POST", `/api/items/${itemId}/components`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items", itemId, "components"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-items/bom-links"] });
      toast({ title: "구성품 추가 완료" });
      resetForm();
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "추가 실패", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (mode === "search" && selectedPI) {
      createMutation.mutate({
        purchaseItemId: selectedPI.id,
        itemName: selectedPI.itemName,
        spec: selectedPI.spec || "",
        quantity: parseInt(quantity, 10) || 1,
        unitCost: null,
        isAdjustment: false,
        remark,
      });
    } else if (mode === "manual" && manualName) {
      createMutation.mutate({
        purchaseItemId: null,
        itemName: manualName,
        spec: manualSpec,
        quantity: parseInt(quantity, 10) || 1,
        unitCost: parseInt(manualCost, 10) || 0,
        isAdjustment,
        remark,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetForm(); }}>
      <DialogContent className="max-w-md" data-testid="dialog-add-component">
        <DialogHeader>
          <DialogTitle className="text-sm">구성품 추가</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            구매품을 검색하거나 직접 입력하여 추가합니다.
          </DialogDescription>
        </DialogHeader>

        <div ref={dialogRef} className="flex gap-1 mb-3">
          <Button
            size="sm"
            variant={mode === "search" ? "default" : "outline"}
            className="h-7 text-xs"
            onClick={() => setMode("search")}
            data-testid="button-mode-search"
          >
            구매품 검색
          </Button>
          <Button
            size="sm"
            variant={mode === "manual" ? "default" : "outline"}
            className="h-7 text-xs"
            onClick={() => setMode("manual")}
            data-testid="button-mode-manual"
          >
            직접 입력
          </Button>
        </div>

        {mode === "search" && (
          <div className="space-y-2">
            <Input
              placeholder="구매품 검색 (품명/코드)"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 text-xs"
              data-testid="input-search-purchase-item"
            />
            <div className="max-h-40 overflow-y-auto border rounded space-y-0">
              {filteredPI.map(pi => (
                <div
                  key={pi.id}
                  className={`flex items-center justify-between px-2 py-1.5 text-xs cursor-pointer hover:bg-muted/50 ${selectedPI?.id === pi.id ? "bg-blue-50 dark:bg-blue-950/30" : ""}`}
                  onClick={() => setSelectedPI(pi)}
                  data-testid={`option-pi-${pi.id}`}
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-mono text-[10px] text-muted-foreground mr-1">{pi.itemCode}</span>
                    <span className="font-medium">{pi.itemName}</span>
                    {pi.spec && <span className="text-muted-foreground ml-1">({pi.spec})</span>}
                  </div>
                  <span className="shrink-0 text-muted-foreground ml-2">{(pi.cost || 0).toLocaleString()}원</span>
                </div>
              ))}
              {filteredPI.length === 0 && (
                <div className="text-[10px] text-muted-foreground text-center py-3">검색 결과가 없습니다</div>
              )}
            </div>
            {selectedPI && (
              <div className="text-xs bg-blue-50 dark:bg-blue-950/20 rounded p-2">
                선택: <span className="font-medium">{selectedPI.itemName}</span>
                <span className="text-muted-foreground ml-1">({selectedPI.itemCode})</span>
                <span className="ml-2">{(selectedPI.cost || 0).toLocaleString()}원</span>
              </div>
            )}
          </div>
        )}

        {mode === "manual" && (
          <div className="space-y-2">
            <div>
              <Label className="text-xs">품명 *</Label>
              <Input value={manualName} onChange={e => setManualName(e.target.value)} className="h-8 text-xs" data-testid="input-comp-name" />
            </div>
            <div>
              <Label className="text-xs">사양</Label>
              <Input value={manualSpec} onChange={e => setManualSpec(e.target.value)} className="h-8 text-xs" data-testid="input-comp-spec" />
            </div>
            <div>
              <Label className="text-xs">단가</Label>
              <Input type="number" value={manualCost} onChange={e => setManualCost(e.target.value)} className="h-8 text-xs" data-testid="input-comp-cost" />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={isAdjustment} onCheckedChange={setIsAdjustment} className="scale-75" data-testid="switch-adjustment" />
              <Label className="text-xs">조정 항목 (금액 조정용)</Label>
            </div>
          </div>
        )}

        <div className="flex gap-2 mt-2">
          <div className="flex-1">
            <Label className="text-xs">수량</Label>
            <Input type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)} className="h-8 text-xs" data-testid="input-comp-quantity" />
          </div>
          <div className="flex-1">
            <Label className="text-xs">비고</Label>
            <Input value={remark} onChange={e => setRemark(e.target.value)} className="h-8 text-xs" data-testid="input-comp-remark" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => { onOpenChange(false); resetForm(); }} data-testid="button-cancel-component">취소</Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={createMutation.isPending || (mode === "search" && !selectedPI) || (mode === "manual" && !manualName)}
            data-testid="button-submit-component"
          >
            {createMutation.isPending ? "저장 중..." : "추가"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const TRUNCATE_OPTIONS = [
  { label: "절사없음", value: 0 },
  { label: "천원", value: 1000 },
  { label: "만원", value: 10000 },
  { label: "십만원", value: 100000 },
];

function applyTruncate(val: number, unit: number): number {
  if (!unit) return val;
  return Math.floor(val / unit) * unit;
}

function AddItemDialog({
  open,
  onOpenChange,
  categories,
  category2s,
  category2sByCategory1,
  itemTypes,
  existingItems,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: string[];
  category2s: string[];
  category2sByCategory1: Map<string, string[]>;
  itemTypes: string[];
  existingItems: ItemWithDetails[];
}) {
  const { toast } = useToast();
  const { ref: dialogRef, container } = useDialogContainer();

  const emptyForm = {
    category1: "",
    category2: "",
    itemCode: "",
    itemName: "",
    spec: "",
    cost: "",
    salesPrice: "",
    marginPct: "",
    truncateUnit: 0,
    itemType: "",
    active: true,
  };
  const [form, setForm] = useState(emptyForm);

  // 선택된 대분류 기준 소분류 목록
  const filteredCategory2s = useMemo(() => {
    if (!form.category1) return category2s;
    return category2sByCategory1.get(form.category1) || [];
  }, [form.category1, category2s, category2sByCategory1]);

  // 대분류 기반 품목코드 자동 생성
  const autoGenerateCode = useCallback((cat1: string) => {
    if (!cat1) return "";
    const prefix = cat1.slice(0, 3).toUpperCase();
    const existing = existingItems
      .filter(i => i.itemCode.startsWith(prefix + "-"))
      .map(i => parseInt(i.itemCode.replace(prefix + "-", "")) || 0)
      .filter(n => !isNaN(n));
    const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
    return `${prefix}-${String(next).padStart(3, "0")}`;
  }, [existingItems]);

  // 마진 계산
  const cost = parseInt(form.cost) || 0;
  const salesPrice = parseInt(form.salesPrice) || 0;
  const margin = cost && salesPrice ? salesPrice - cost : null;
  const marginPct = margin !== null && salesPrice ? Math.round((margin / salesPrice) * 100) : null;

  // 원가 변경 → 마진율 있으면 판매가 재계산
  const handleCostChange = (val: string) => {
    const c = parseInt(val) || 0;
    const pct = parseFloat(form.marginPct);
    if (c && !isNaN(pct) && pct > 0) {
      const raw = Math.round(c / (1 - pct / 100));
      const sp = applyTruncate(raw, form.truncateUnit);
      setForm(f => ({ ...f, cost: val, salesPrice: String(sp) }));
    } else {
      setForm(f => ({ ...f, cost: val }));
    }
  };

  // 판매가 변경 → 마진율 자동계산
  const handleSalesPriceChange = (val: string) => {
    const sp = parseInt(val) || 0;
    const c = parseInt(form.cost) || 0;
    if (sp && c) {
      const pct = Math.round(((sp - c) / sp) * 100);
      setForm(f => ({ ...f, salesPrice: val, marginPct: String(pct) }));
    } else {
      setForm(f => ({ ...f, salesPrice: val }));
    }
  };

  // 마진율 변경 → 원가 있으면 판매가 재계산
  const handleMarginPctChange = (val: string) => {
    const pct = parseFloat(val);
    const c = parseInt(form.cost) || 0;
    if (c && !isNaN(pct) && pct > 0 && pct < 100) {
      const raw = Math.round(c / (1 - pct / 100));
      const sp = applyTruncate(raw, form.truncateUnit);
      setForm(f => ({ ...f, marginPct: val, salesPrice: String(sp) }));
    } else {
      setForm(f => ({ ...f, marginPct: val }));
    }
  };

  // 절사 변경 → 판매가 재계산
  const handleTruncateChange = (unit: number) => {
    const sp = parseInt(form.salesPrice) || 0;
    const newSp = sp ? applyTruncate(sp, unit) : sp;
    setForm(f => ({ ...f, truncateUnit: unit, salesPrice: newSp ? String(newSp) : f.salesPrice }));
  };

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("POST", "/api/items", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      toast({ title: "제품 추가 완료" });
      onOpenChange(false);
      setForm(emptyForm);
    },
    onError: (err: Error) => {
      toast({ title: "추가 실패", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!form.category1 || !form.itemCode || !form.itemName) {
      toast({ title: "필수 항목을 입력하세요", description: "대분류, 품목코드, 품목명은 필수입니다", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      category1: form.category1,
      category2: form.category2 || null,
      itemCode: form.itemCode,
      itemName: form.itemName,
      spec: form.spec || null,
      cost: form.cost ? parseInt(form.cost, 10) : null,
      salesPrice: form.salesPrice ? parseInt(form.salesPrice, 10) : null,
      itemType: form.itemType || null,
      active: form.active,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="dialog-add-item">
        <DialogHeader>
          <DialogTitle data-testid="text-dialog-title">제품 추가</DialogTitle>
          <DialogDescription>새 판매제품을 수동으로 등록합니다.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3" ref={dialogRef}>
          {/* 대분류 / 소분류 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">대분류 *</Label>
              <ComboboxInput
                value={form.category1}
                options={categories}
                onChange={val => {
                  const code = autoGenerateCode(val);
                  setForm(f => ({ ...f, category1: val, category2: "", itemCode: f.itemCode || code }));
                }}
                placeholder="대분류 입력/선택"
                testId="input-add-category1"
                container={container}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">
                소분류
                {form.category1 && filteredCategory2s.length === 0 && (
                  <span className="ml-1 text-[10px] text-muted-foreground">(직접 입력)</span>
                )}
              </Label>
              <ComboboxInput
                value={form.category2}
                options={filteredCategory2s}
                onChange={val => setForm(f => ({ ...f, category2: val }))}
                placeholder={form.category1 ? "소분류 입력/선택" : "대분류 먼저 선택"}
                testId="input-add-category2"
                container={container}
              />
            </div>
          </div>

          {/* 품목코드 / 품목명 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                품목코드 *
                {form.category1 && (
                  <button
                    type="button"
                    className="text-[10px] text-blue-500 hover:underline"
                    onClick={() => setForm(f => ({ ...f, itemCode: autoGenerateCode(f.category1) }))}
                    data-testid="button-auto-code"
                  >
                    자동생성
                  </button>
                )}
              </Label>
              <Input
                value={form.itemCode}
                onChange={e => setForm(f => ({ ...f, itemCode: e.target.value }))}
                placeholder="품목코드"
                data-testid="input-add-itemcode"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">품목명 *</Label>
              <Input
                value={form.itemName}
                onChange={e => setForm(f => ({ ...f, itemName: e.target.value }))}
                placeholder="품목명"
                data-testid="input-add-itemname"
              />
            </div>
          </div>

          {/* 사양 */}
          <div className="space-y-1">
            <Label className="text-xs">사양</Label>
            <Input
              value={form.spec}
              onChange={e => setForm(f => ({ ...f, spec: e.target.value }))}
              placeholder="사양"
              data-testid="input-add-spec"
            />
          </div>

          {/* 원가 / 마진율 / 절사 */}
          <div className="grid grid-cols-[1fr_80px_100px] gap-2">
            <div className="space-y-1">
              <Label className="text-xs">원가</Label>
              <Input
                type="number"
                value={form.cost}
                onChange={e => handleCostChange(e.target.value)}
                placeholder="0"
                data-testid="input-add-cost"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">마진율 %</Label>
              <Input
                type="number"
                value={form.marginPct}
                onChange={e => handleMarginPctChange(e.target.value)}
                placeholder="0"
                min={0}
                max={99}
                data-testid="input-add-margin-pct"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">절사</Label>
              <Select value={String(form.truncateUnit)} onValueChange={v => handleTruncateChange(Number(v))}>
                <SelectTrigger className="h-9 text-xs" data-testid="select-truncate">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRUNCATE_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 판매가 */}
          <div className="space-y-1">
            <Label className="text-xs">판매가</Label>
            <Input
              type="number"
              value={form.salesPrice}
              onChange={e => handleSalesPriceChange(e.target.value)}
              placeholder="0"
              data-testid="input-add-salesprice"
            />
          </div>

          {/* 마진 표시 */}
          {cost > 0 && salesPrice > 0 && (
            <div className={`text-xs rounded px-3 py-2 flex items-center gap-3 ${margin !== null && margin >= 0 ? "bg-green-50 dark:bg-green-950/20" : "bg-red-50 dark:bg-red-950/20"}`}>
              <span className="text-muted-foreground">마진</span>
              <span className={`font-semibold ${margin !== null && margin >= 0 ? "text-green-700 dark:text-green-400" : "text-red-600"}`}>
                {margin !== null ? margin.toLocaleString() + "원" : "-"}
              </span>
              <span className="text-muted-foreground">마진율</span>
              <span className={`font-semibold ${marginPct !== null && marginPct >= 0 ? "text-green-700 dark:text-green-400" : "text-red-600"}`}>
                {marginPct !== null ? marginPct + "%" : "-"}
              </span>
            </div>
          )}

          {/* 유형 / 활성 */}
          <div className="grid grid-cols-2 gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs">제품유형</Label>
              <Select value={form.itemType || "__none__"} onValueChange={val => setForm(f => ({ ...f, itemType: val === "__none__" ? "" : val }))}>
                <SelectTrigger data-testid="select-add-itemtype">
                  <SelectValue placeholder="유형 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" className="text-muted-foreground">(없음)</SelectItem>
                  {itemTypes.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pb-1">
              <Label className="text-xs">활성</Label>
              <Switch
                checked={form.active}
                onCheckedChange={val => setForm(f => ({ ...f, active: val }))}
                data-testid="switch-add-active"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-add">
            취소
          </Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending} data-testid="button-submit-add">
            {createMutation.isPending ? "추가 중..." : "추가"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ItemList() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [category2Filter, setCategory2Filter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [sortField, setSortField] = useState<"category1" | "category2" | "itemCode" | "itemName" | "cost" | "salesPrice" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const handleCategoryFilterChange = (val: string) => {
    setCategoryFilter(val);
    setCategory2Filter("all");
  };

  const { data: items, isLoading } = useQuery<ItemWithDetails[]>({
    queryKey: ["/api/items"],
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/items/sync-onedrive");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "동기화 완료", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
    },
    onError: (err: Error) => {
      toast({ title: "동기화 실패", description: err.message, variant: "destructive" });
    },
  });

  const writeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/items/write-onedrive");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "저장 완료", description: data.message });
    },
    onError: (err: Error) => {
      toast({ title: "저장 실패", description: err.message, variant: "destructive" });
    },
  });

  const categories = useMemo(() => {
    if (!items) return [];
    const set = new Set(items.map(i => i.category1));
    return Array.from(set).sort();
  }, [items]);

  const category2s = useMemo(() => {
    if (!items) return [];
    const set = new Set(items.map(i => i.category2).filter(Boolean));
    return Array.from(set).sort() as string[];
  }, [items]);

  const category2sByCategory1 = useMemo(() => {
    if (!items) return new Map<string, string[]>();
    const map = new Map<string, string[]>();
    items.forEach(i => {
      if (!i.category2) return;
      const list = map.get(i.category1) || [];
      if (!list.includes(i.category2)) list.push(i.category2);
      map.set(i.category1, list);
    });
    map.forEach((v, k) => map.set(k, v.sort()));
    return map;
  }, [items]);

  const category2Options = useMemo(() => {
    if (!items) return [];
    const base = categoryFilter !== "all" ? items.filter(i => i.category1 === categoryFilter) : items;
    const set = new Set(base.map(i => i.category2).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [items, categoryFilter]);

  const itemTypes = useMemo(() => {
    if (!items) return [];
    const set = new Set(items.map(i => i.itemType).filter(Boolean));
    return Array.from(set).sort() as string[];
  }, [items]);

  const filtered = useMemo(() => {
    if (!items) return [];
    let list = items.filter(item => {
      if (categoryFilter !== "all" && item.category1 !== categoryFilter) return false;
      if (category2Filter !== "all" && (item.category2 || "") !== category2Filter) return false;
      if (typeFilter !== "all" && item.itemType !== typeFilter) return false;
      const isActive = item.active ?? true;
      if (activeFilter === "active" && !isActive) return false;
      if (activeFilter === "inactive" && isActive) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          item.itemCode.toLowerCase().includes(q) ||
          item.itemName.toLowerCase().includes(q) ||
          (item.spec || "").toLowerCase().includes(q) ||
          (item.category2 || "").toLowerCase().includes(q)
        );
      }
      return true;
    });

    if (sortField) {
      const dir = sortDir === "asc" ? 1 : -1;
      list = [...list].sort((a, b) => {
        if (sortField === "cost" || sortField === "salesPrice") {
          return ((a[sortField] || 0) - (b[sortField] || 0)) * dir;
        }
        return (a[sortField] || "").localeCompare(b[sortField] || "", "ko") * dir;
      });
    }

    return list;
  }, [items, search, categoryFilter, category2Filter, typeFilter, activeFilter, sortField, sortDir]);

  const stats = useMemo(() => {
    if (!items) return { total: 0, active: 0, categories: 0 };
    return {
      total: items.length,
      active: items.filter(i => i.active).length,
      categories: new Set(items.map(i => i.category1)).size,
    };
  }, [items]);

  return (
    <div className="h-full overflow-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <Package className="h-5 w-5" />
            판매제품관리
          </h1>
          <p className="text-sm text-muted-foreground mt-1" data-testid="text-item-stats">
            전체 {stats.total}개 | 활성 {stats.active}개 | {stats.categories}개 카테고리
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => setAddDialogOpen(true)}
            data-testid="button-add-item"
          >
            <Plus />
            <span>제품 추가</span>
          </Button>
          <Button
            variant="outline"
            onClick={() => writeMutation.mutate()}
            disabled={writeMutation.isPending}
            data-testid="button-write-items-onedrive"
          >
            <Upload className={writeMutation.isPending ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            <span>{writeMutation.isPending ? "저장 중..." : "OneDrive에 저장"}</span>
          </Button>
          <Button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            data-testid="button-sync-items"
          >
            <RefreshCw className={syncMutation.isPending ? "animate-spin" : ""} />
            <span>{syncMutation.isPending ? "동기화 중..." : "OneDrive 동기화"}</span>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="품목코드, 품목명, 사양 검색..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-items"
          />
        </div>
        <Select value={categoryFilter} onValueChange={handleCategoryFilterChange}>
          <SelectTrigger className="w-[150px]" data-testid="select-category-filter">
            <SelectValue placeholder="대분류" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 대분류</SelectItem>
            {categories.map(c => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={category2Filter} onValueChange={setCategory2Filter}>
          <SelectTrigger className="w-[150px]" data-testid="select-category2-filter">
            <SelectValue placeholder="소분류" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 소분류</SelectItem>
            {category2Options.map(c => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[150px]" data-testid="select-type-filter">
            <SelectValue placeholder="제품유형" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 유형</SelectItem>
            {itemTypes.map(t => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          {(["all", "active", "inactive"] as const).map(s => (
            <Button
              key={s}
              variant={activeFilter === s ? "default" : "ghost"}
              size="sm"
              className="h-8 text-xs"
              onClick={() => setActiveFilter(s)}
              data-testid={`button-active-filter-${s}`}
            >
              {s === "all" ? "전체" : s === "active" ? "사용" : "미사용"}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Package className="h-12 w-12 mb-4 opacity-50" />
          <p className="text-lg font-medium">제품이 없습니다</p>
          <p className="text-sm mt-1">OneDrive 동기화 버튼을 눌러 listprice.xlsx에서 제품을 가져오세요</p>
        </div>
      ) : (
        <div className="rounded-lg overflow-hidden border border-border/40">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 border-b border-border/40">
                <TableHead className="w-[70px] text-xs h-9 px-3 cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("category1")} data-testid="sort-category1">
                  <span className="inline-flex items-center gap-1">대분류 {sortField === "category1" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}</span>
                </TableHead>
                <TableHead className="w-[70px] text-xs h-9 px-3 cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("category2")} data-testid="sort-category2">
                  <span className="inline-flex items-center gap-1">소분류 {sortField === "category2" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}</span>
                </TableHead>
                <TableHead className="w-[130px] text-xs h-9 px-3 cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("itemCode")} data-testid="sort-itemCode">
                  <span className="inline-flex items-center gap-1">품목코드 {sortField === "itemCode" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}</span>
                </TableHead>
                <TableHead className="max-w-[180px] text-xs h-9 px-3 cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("itemName")} data-testid="sort-itemName">
                  <span className="inline-flex items-center gap-1">품목명 {sortField === "itemName" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}</span>
                </TableHead>
                <TableHead className="hidden md:table-cell max-w-[160px] text-xs h-9 px-3">사양</TableHead>
                <TableHead className="w-[70px] text-xs h-9 px-3">유형</TableHead>
                <TableHead className="text-right w-[100px] text-xs h-9 px-3 cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("cost")} data-testid="sort-cost">
                  <span className="inline-flex items-center gap-1 justify-end w-full">원가 {sortField === "cost" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}</span>
                </TableHead>
                <TableHead className="text-right w-[100px] text-xs h-9 px-3 cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("salesPrice")} data-testid="sort-salesPrice">
                  <span className="inline-flex items-center gap-1 justify-end w-full">판매가 {sortField === "salesPrice" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}</span>
                </TableHead>
                <TableHead className="text-right w-[90px] text-xs h-9 px-3 hidden lg:table-cell">마진</TableHead>
                <TableHead className="text-center w-[45px] text-xs h-9 px-2">재고</TableHead>
                <TableHead className="text-center w-[35px] text-xs h-9 px-1"></TableHead>
                <TableHead className="w-[28px] h-9 px-1"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(item => {
                const isExpanded = expandedId === item.id;
                const margin = item.cost && item.salesPrice ? item.salesPrice - item.cost : null;
                const marginPct = margin && item.salesPrice ? Math.round((margin / item.salesPrice) * 100) : null;
                return (
                  <Fragment key={item.id}>
                    <TableRow
                      className={`cursor-pointer transition-colors border-b border-border/20 ${isExpanded ? "bg-blue-50/40 dark:bg-blue-950/10" : "hover:bg-muted/20"}`}
                      onClick={() => setExpandedId(isExpanded ? null : item.id)}
                      data-testid={`row-item-${item.itemCode}`}
                    >
                      <TableCell className="text-xs py-1.5 px-3 text-foreground" data-testid={`text-cat1-${item.itemCode}`}>
                        {item.category1}
                      </TableCell>
                      <TableCell className="text-xs py-1.5 px-3 text-foreground/70" data-testid={`text-cat2-${item.itemCode}`}>
                        {item.category2 || "-"}
                      </TableCell>
                      <TableCell className="text-xs py-1.5 px-3 text-foreground max-w-[130px] truncate" data-testid={`text-code-${item.itemCode}`}>
                        {item.itemCode}
                      </TableCell>
                      <TableCell className="text-xs py-1.5 px-3 text-foreground max-w-[180px] truncate" data-testid={`text-name-${item.itemCode}`}>
                        {item.itemName}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs py-1.5 px-3 text-foreground/70 max-w-[160px] truncate">
                        {item.spec || "-"}
                      </TableCell>
                      <TableCell className="text-xs py-1.5 px-3 text-foreground/70" data-testid={`text-type-${item.itemCode}`}>
                        {item.itemType || "-"}
                      </TableCell>
                      <TableCell className="text-right text-xs py-1.5 px-3 text-foreground whitespace-nowrap" data-testid={`text-cost-${item.itemCode}`}>
                        {formatPrice(item.cost)}
                      </TableCell>
                      <TableCell className="text-right text-xs py-1.5 px-3 text-foreground whitespace-nowrap" data-testid={`text-price-${item.itemCode}`}>
                        {formatPrice(item.salesPrice)}
                      </TableCell>
                      <TableCell className="text-right text-xs py-1.5 px-3 whitespace-nowrap hidden lg:table-cell" data-testid={`text-margin-${item.itemCode}`}>
                        {marginPct !== null ? (
                          <span className={marginPct >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                            {marginPct}%
                          </span>
                        ) : "-"}
                      </TableCell>
                      <TableCell className="text-center text-xs py-1.5 px-2 text-foreground">
                        {getStockQty(item.inventory, "AVAILABLE") > 0 ? (
                          <span data-testid={`text-stock-${item.itemCode}`}>
                            {getStockQty(item.inventory, "AVAILABLE")}
                          </span>
                        ) : (
                          <span className="text-foreground/30">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center py-1.5 px-1">
                        <div className={`w-1.5 h-1.5 rounded-full mx-auto ${item.active ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"}`} data-testid={`indicator-active-${item.itemCode}`} />
                      </TableCell>
                      <TableCell className="py-1.5 px-1">
                        {isExpanded ? (
                          <ChevronUp className="h-3 w-3 text-foreground/40" />
                        ) : (
                          <ChevronDown className="h-3 w-3 text-foreground/40" />
                        )}
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow className="hover:bg-transparent border-b border-border/20">
                        <TableCell colSpan={12} className="p-0">
                          <ItemDetailRow
                            item={item}
                            itemTypes={itemTypes}
                            categories={categories}
                            category2s={category2s}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <AddItemDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        categories={categories}
        category2s={category2s}
        category2sByCategory1={category2sByCategory1}
        itemTypes={itemTypes}
        existingItems={items || []}
      />
    </div>
  );
}
