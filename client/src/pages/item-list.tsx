import { useQuery, useMutation } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Package, RefreshCw, Search, ChevronDown, ChevronUp, Save, X, Pencil, Plus, Upload } from "lucide-react";
import { useState, useMemo, Fragment, useCallback, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ItemMaster, ItemInventory, ItemDocument } from "@shared/schema";
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
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredOptions = useMemo(() => {
    if (!draft) return options;
    const q = draft.toLowerCase();
    return options.filter(o => o.toLowerCase().includes(q));
  }, [options, draft]);

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
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setDraft(value); }}>
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
          onChange={e => setDraft(e.target.value)}
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
}) {
  const [open, setOpen] = useState(false);
  const filteredOptions = useMemo(() => {
    if (!value) return options;
    const q = value.toLowerCase();
    return options.filter(o => o.toLowerCase().includes(q));
  }, [options, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Input
          value={value}
          onChange={e => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          data-testid={testId}
        />
      </PopoverTrigger>
      {open && filteredOptions.length > 0 && (
        <PopoverContent className="w-[200px] p-1" align="start" onOpenAutoFocus={e => e.preventDefault()}>
          <div className="max-h-[150px] overflow-auto">
            {filteredOptions.map(opt => (
              <div
                key={opt}
                className={`text-xs px-2 py-1 rounded cursor-pointer hover-elevate ${opt === value ? "bg-accent" : ""}`}
                onClick={() => { onChange(opt); setOpen(false); }}
                data-testid={`option-${testId}-${opt}`}
              >
                {opt}
              </div>
            ))}
          </div>
        </PopoverContent>
      )}
    </Popover>
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
            value={item.itemType || ""}
            onValueChange={val => patchMutation.mutate({ itemType: val })}
          >
            <SelectTrigger className="h-6 text-xs px-2 w-[100px] border-dashed" data-testid={`select-type-${item.itemCode}`}>
              <SelectValue placeholder="-" />
            </SelectTrigger>
            <SelectContent>
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
    </div>
  );
}

function AddItemDialog({
  open,
  onOpenChange,
  categories,
  category2s,
  itemTypes,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: string[];
  category2s: string[];
  itemTypes: string[];
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    category1: "",
    category2: "",
    itemCode: "",
    itemName: "",
    spec: "",
    cost: "",
    salesPrice: "",
    itemType: "",
    active: true,
  });

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("POST", "/api/items", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      toast({ title: "제품 추가 완료" });
      onOpenChange(false);
      setForm({
        category1: "",
        category2: "",
        itemCode: "",
        itemName: "",
        spec: "",
        cost: "",
        salesPrice: "",
        itemType: "",
        active: true,
      });
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
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">대분류 *</Label>
              <ComboboxInput
                value={form.category1}
                options={categories}
                onChange={val => setForm(f => ({ ...f, category1: val }))}
                placeholder="대분류 입력/선택"
                testId="input-add-category1"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">소분류</Label>
              <ComboboxInput
                value={form.category2}
                options={category2s}
                onChange={val => setForm(f => ({ ...f, category2: val }))}
                placeholder="소분류 입력/선택"
                testId="input-add-category2"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">품목코드 *</Label>
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
          <div className="space-y-1">
            <Label className="text-xs">사양</Label>
            <Input
              value={form.spec}
              onChange={e => setForm(f => ({ ...f, spec: e.target.value }))}
              placeholder="사양"
              data-testid="input-add-spec"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">원가</Label>
              <Input
                type="number"
                value={form.cost}
                onChange={e => setForm(f => ({ ...f, cost: e.target.value }))}
                placeholder="0"
                data-testid="input-add-cost"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">판매가</Label>
              <Input
                type="number"
                value={form.salesPrice}
                onChange={e => setForm(f => ({ ...f, salesPrice: e.target.value }))}
                placeholder="0"
                data-testid="input-add-salesprice"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs">제품유형</Label>
              <Select value={form.itemType} onValueChange={val => setForm(f => ({ ...f, itemType: val }))}>
                <SelectTrigger data-testid="select-add-itemtype">
                  <SelectValue placeholder="유형 선택" />
                </SelectTrigger>
                <SelectContent>
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
  const [typeFilter, setTypeFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

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

  const itemTypes = useMemo(() => {
    if (!items) return [];
    const set = new Set(items.map(i => i.itemType).filter(Boolean));
    return Array.from(set).sort() as string[];
  }, [items]);

  const filtered = useMemo(() => {
    if (!items) return [];
    return items.filter(item => {
      if (categoryFilter !== "all" && item.category1 !== categoryFilter) return false;
      if (typeFilter !== "all" && item.itemType !== typeFilter) return false;
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
  }, [items, search, categoryFilter, typeFilter]);

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
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[150px]" data-testid="select-category-filter">
            <SelectValue placeholder="카테고리" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 카테고리</SelectItem>
            {categories.map(c => (
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
                <TableHead className="w-[70px] text-xs h-9 px-3">대분류</TableHead>
                <TableHead className="w-[70px] text-xs h-9 px-3">소분류</TableHead>
                <TableHead className="w-[130px] text-xs h-9 px-3">품목코드</TableHead>
                <TableHead className="max-w-[180px] text-xs h-9 px-3">품목명</TableHead>
                <TableHead className="hidden md:table-cell max-w-[160px] text-xs h-9 px-3">사양</TableHead>
                <TableHead className="w-[70px] text-xs h-9 px-3">유형</TableHead>
                <TableHead className="text-right w-[100px] text-xs h-9 px-3">원가</TableHead>
                <TableHead className="text-right w-[100px] text-xs h-9 px-3">판매가</TableHead>
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
        itemTypes={itemTypes}
      />
    </div>
  );
}
