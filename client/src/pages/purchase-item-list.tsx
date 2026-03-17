import { useQuery, useMutation } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ShoppingCart, RefreshCw, Search, ChevronDown, ChevronUp, Save, X, Pencil, Plus, Trash2, Link2, Unlink, Upload, Star, Layers, ArrowUpDown, ArrowUp, ArrowDown, FileSpreadsheet, Check, ChevronsUpDown } from "lucide-react";
import { useState, useMemo, Fragment, useCallback, useRef, useEffect } from "react";
import { useDialogContainer } from "@/hooks/use-dialog-container";
import { Input } from "@/components/ui/input";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { PurchaseItem, Vendor } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

function VendorSearchSelect({ vendorId, vendors, onSelect, testId }: {
  vendorId: string | null;
  vendors: Vendor[];
  onSelect: (id: string | null) => void;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selectedVendor = vendors.find(v => v.id === vendorId);
  const filtered = vendors.filter(v =>
    !search || v.companyName.toLowerCase().includes(search.toLowerCase())
  );
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(""); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="h-6 text-xs px-2 w-[160px] border border-dashed rounded-md text-left truncate flex items-center justify-between hover:bg-muted/50"
          data-testid={testId}
        >
          <span className={selectedVendor ? "" : "text-muted-foreground"}>
            {selectedVendor?.companyName || "공급업체 선택"}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start">
        <div className="p-2 border-b">
          <Input
            placeholder="업체명 검색..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-7 text-xs"
            autoFocus
            data-testid={`${testId}-search`}
          />
        </div>
        <ScrollArea className="max-h-[200px]">
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted text-muted-foreground"
            onClick={() => { onSelect(null); setOpen(false); setSearch(""); }}
            data-testid={`${testId}-none`}
          >
            연결 해제
          </button>
          {filtered.map(v => (
            <button
              key={v.id}
              type="button"
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-muted ${v.id === vendorId ? "bg-primary/10 font-medium" : ""}`}
              onClick={() => { onSelect(v.id); setOpen(false); setSearch(""); }}
              data-testid={`${testId}-opt-${v.id}`}
            >
              {v.companyName}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">검색 결과 없음</div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

type PurchaseItemWithVendor = PurchaseItem & { vendor: Vendor | null };

function formatPrice(val: number | null | undefined) {
  if (!val) return "-";
  return val.toLocaleString("ko-KR") + "원";
}

function CategoryCombobox({
  value,
  options,
  allOptions,
  onSelect,
  placeholder = "선택...",
  testId,
  compact = false,
  container,
}: {
  value: string;
  options: string[];
  allOptions?: string[];
  onSelect: (val: string) => void;
  placeholder?: string;
  testId: string;
  compact?: boolean;
  container?: HTMLElement | null;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const primarySet = useMemo(() => new Set(options), [options]);
  const otherOptions = useMemo(() => {
    if (!allOptions) return [];
    return allOptions.filter(o => !primarySet.has(o));
  }, [allOptions, primarySet]);

  const filtered = useMemo(() => {
    if (!search) return options;
    const q = search.toLowerCase();
    return options.filter(o => o.toLowerCase().includes(q));
  }, [options, search]);

  const filteredOthers = useMemo(() => {
    if (!search) return otherOptions;
    const q = search.toLowerCase();
    return otherOptions.filter(o => o.toLowerCase().includes(q));
  }, [otherOptions, search]);

  const allCombined = useMemo(() => [...options, ...otherOptions], [options, otherOptions]);

  const handleSelect = (val: string) => {
    onSelect(val);
    setOpen(false);
    setSearch("");
  };

  const handleAddNew = () => {
    if (search.trim()) {
      onSelect(search.trim());
      setOpen(false);
      setSearch("");
    }
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(""); }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={compact
            ? "h-6 px-2 text-xs justify-between font-normal min-w-[80px] max-w-[140px]"
            : "h-9 px-3 text-sm justify-between font-normal w-full"
          }
          data-testid={testId}
        >
          <span className="truncate">{value || placeholder}</span>
          <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="start" onOpenAutoFocus={e => e.preventDefault()} {...(container ? { container } : {})}>
        <div className="flex flex-col">
          <div className="flex items-center border-b px-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              className="flex h-8 w-full bg-transparent py-1 px-2 text-xs outline-none placeholder:text-muted-foreground"
              placeholder="검색 또는 새 값 입력..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && search.trim()) {
                  if (filtered.length > 0) {
                    handleSelect(filtered[0]);
                  } else {
                    handleAddNew();
                  }
                }
              }}
              data-testid={`${testId}-search`}
            />
          </div>
          <div className="max-h-[200px] overflow-y-auto p-1">
            {filtered.length === 0 && filteredOthers.length === 0 && !search.trim() && (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">항목 없음</div>
            )}
            {filtered.map(opt => (
              <button
                key={opt}
                className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground"
                onClick={() => handleSelect(opt)}
                data-testid={`${testId}-option-${opt}`}
              >
                <Check className={`mr-2 h-3 w-3 ${value === opt ? "opacity-100" : "opacity-0"}`} />
                {opt}
              </button>
            ))}
            {filteredOthers.length > 0 && (
              <>
                {filtered.length > 0 && <div className="border-t my-1" />}
                <div className="px-2 py-1 text-[10px] text-muted-foreground">기타</div>
                {filteredOthers.map(opt => (
                  <button
                    key={opt}
                    className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground text-muted-foreground"
                    onClick={() => handleSelect(opt)}
                    data-testid={`${testId}-option-${opt}`}
                  >
                    <Check className={`mr-2 h-3 w-3 ${value === opt ? "opacity-100" : "opacity-0"}`} />
                    {opt}
                  </button>
                ))}
              </>
            )}
            {search.trim() && !allCombined.includes(search.trim()) && (
              <button
                className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground text-blue-600 dark:text-blue-400"
                onClick={handleAddNew}
                data-testid={`${testId}-add-new`}
              >
                <Plus className="mr-2 h-3 w-3" />
                "{search.trim()}" 추가
              </button>
            )}
          </div>
        </div>
      </PopoverContent>
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

function VendorBadge({ item }: { item: PurchaseItemWithVendor }) {
  if (item.vendor) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 text-xs text-green-700 dark:text-green-400" data-testid={`vendor-linked-${item.id}`}>
            <Link2 className="h-3 w-3 shrink-0" />
            <span className="truncate">{item.vendor.companyName}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>공급업체 연결됨: {item.vendor.companyName}</p>
          {item.vendor.contactName && <p>담당자: {item.vendor.contactName}</p>}
          {item.vendor.phone && <p>전화: {item.vendor.phone}</p>}
        </TooltipContent>
      </Tooltip>
    );
  }

  if (item.defaultVendor) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 text-xs text-foreground/50" data-testid={`vendor-unlinked-${item.id}`}>
            <Unlink className="h-3 w-3 shrink-0 text-orange-400" />
            <span className="truncate">{item.defaultVendor}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>미연결: "{item.defaultVendor}"</p>
          <p className="text-xs text-muted-foreground">공급업체 목록에 매칭되는 업체가 없습니다</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return <span className="text-xs text-foreground/30">-</span>;
}

function PurchaseItemDetailRow({ item, vendors, categories, category2Map, allCategory2 }: { item: PurchaseItemWithVendor; vendors: Vendor[]; categories: string[]; category2Map: Map<string, string[]>; allCategory2: string[] }) {
  const { toast } = useToast();

  const patchMutation = useMutation({
    mutationFn: async (fields: Record<string, any>) => {
      const res = await apiRequest("PATCH", `/api/purchase-items/${item.id}`, fields);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-items"] });
      toast({ title: "저장 완료" });
    },
    onError: (err: Error) => {
      toast({ title: "저장 실패", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/purchase-items/${item.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-items"] });
      toast({ title: "삭제 완료" });
    },
    onError: (err: Error) => {
      toast({ title: "삭제 실패", description: err.message, variant: "destructive" });
    },
  });

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  return (
    <div className="relative bg-blue-50/60 dark:bg-blue-950/20 border-l-[3px] border-l-blue-500">
      <div className="px-4 py-2.5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
        {patchMutation.isPending && (
          <div className="flex items-center gap-1 text-blue-600">
            <RefreshCw className="h-3 w-3 animate-spin" />
            <span>저장 중...</span>
          </div>
        )}

        <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
          <span className="text-muted-foreground">대분류</span>
          <CategoryCombobox
            value={item.category1}
            options={categories}
            onSelect={val => patchMutation.mutate({ category1: val })}
            testId={`combo-cat1-${item.id}`}
            compact
          />
        </div>

        <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
          <span className="text-muted-foreground">소분류</span>
          <CategoryCombobox
            value={item.category2 || ""}
            options={category2Map.get(item.category1) || []}
            allOptions={allCategory2}
            onSelect={val => patchMutation.mutate({ category2: val })}
            placeholder="소분류..."
            testId={`combo-cat2-${item.id}`}
            compact
          />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">품명</span>
          <InlineEdit
            value={item.itemName}
            onSave={val => patchMutation.mutate({ itemName: val })}
            testId={`pname-${item.id}`}
            className="font-medium"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">규격</span>
          <InlineEdit
            value={item.spec || ""}
            onSave={val => patchMutation.mutate({ spec: val })}
            testId={`pspec-${item.id}`}
          />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">브랜드</span>
          <InlineEdit
            value={item.brand || ""}
            onSave={val => patchMutation.mutate({ brand: val })}
            testId={`pbrand-${item.id}`}
          />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">원산지</span>
          <InlineEdit
            value={item.originCountry || ""}
            onSave={val => patchMutation.mutate({ originCountry: val })}
            testId={`porigin-${item.id}`}
          />
        </div>

        <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
          <span className="text-muted-foreground">공급업체</span>
          <VendorSearchSelect
            vendorId={item.vendorId}
            vendors={vendors}
            onSelect={val => patchMutation.mutate({ vendorId: val })}
            testId={`select-vendor-${item.id}`}
          />
          {item.defaultVendor && !item.vendorId && (
            <span className="text-muted-foreground">(원본: {item.defaultVendor})</span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">단가</span>
          <InlineEdit
            value={String(item.cost || 0)}
            type="number"
            onSave={val => patchMutation.mutate({ cost: parseInt(val, 10) || 0 })}
            testId={`pcost-${item.id}`}
          />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">리드타임</span>
          <InlineEdit
            value={String(item.leadTimeDays || "")}
            onSave={val => patchMutation.mutate({ leadTimeDays: parseInt(val, 10) || null })}
            testId={`plead-${item.id}`}
          />
          {item.leadTimeDays ? <span className="text-muted-foreground">일</span> : null}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">MOQ</span>
          <InlineEdit
            value={String(item.moq || "")}
            onSave={val => patchMutation.mutate({ moq: parseInt(val, 10) || null })}
            testId={`pmoq-${item.id}`}
          />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">안전재고</span>
          <InlineEdit
            value={String(item.safetyStock || "")}
            onSave={val => patchMutation.mutate({ safetyStock: parseInt(val, 10) || null })}
            testId={`psafety-${item.id}`}
          />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">비고</span>
          <InlineEdit
            value={item.remark || ""}
            onSave={val => patchMutation.mutate({ remark: val })}
            testId={`premark-${item.id}`}
          />
        </div>

        <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
          <span className="text-muted-foreground">활성</span>
          <Switch
            checked={item.active ?? true}
            onCheckedChange={val => patchMutation.mutate({ active: val })}
            className="scale-75"
            data-testid={`switch-pactive-${item.id}`}
          />
        </div>

        {item.isStockItem && (
          <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-normal">재고품</Badge>
        )}

        <div className="ml-auto" onClick={e => e.stopPropagation()}>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-destructive hover:text-destructive"
            onClick={() => setShowDeleteConfirm(true)}
            data-testid={`button-delete-${item.id}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>구매품 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              "{item.itemName}" ({item.itemCode})을(를) 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const EMPTY_FORM: Record<string, string> = {
  category1: "",
  category2: "",
  itemName: "",
  brand: "",
  originCountry: "",
  itemCode: "",
  spec: "",
  defaultVendor: "",
  cost: "",
  currency: "won",
  leadTimeDays: "",
  itemType: "",
  unit: "ea",
  moq: "",
  safetyStock: "",
  remark: "",
};

export default function PurchaseItemList() {
  const { toast } = useToast();
  const { ref: dialogRef, container } = useDialogContainer();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [category2Filter, setCategory2Filter] = useState("all");
  const [vendorFilter, setVendorFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [sortField, setSortField] = useState<"category1" | "category2" | "itemCode" | "itemName" | "cost" | "leadTimeDays" | null>(null);
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

  const { data: items, isLoading } = useQuery<PurchaseItemWithVendor[]>({
    queryKey: ["/api/purchase-items"],
  });

  const { data: vendorList } = useQuery<Vendor[]>({
    queryKey: ["/api/vendors"],
  });

  const vendors = vendorList || [];

  const { data: bomLinks = [] } = useQuery<Array<{ purchaseItemId: string; itemMasterId: string; itemName: string; itemCode: string }>>({
    queryKey: ["/api/purchase-items/bom-links"],
  });

  const bomLinkMap = useMemo(() => {
    const m = new Map<string, Array<{ itemName: string; itemCode: string }>>();
    for (const link of bomLinks) {
      const arr = m.get(link.purchaseItemId) || [];
      arr.push({ itemName: link.itemName, itemCode: link.itemCode });
      m.set(link.purchaseItemId, arr);
    }
    return m;
  }, [bomLinks]);

  const toggleFavMutation = useMutation({
    mutationFn: async ({ id, isFavorite }: { id: string; isFavorite: boolean }) => {
      await apiRequest("PATCH", `/api/purchase-items/${id}`, { isFavorite });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-items"] });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/purchase-items/sync-onedrive");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "동기화 완료", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-items"] });
    },
    onError: (err: Error) => {
      toast({ title: "동기화 실패", description: err.message, variant: "destructive" });
    },
  });

  const writeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/purchase-items/write-onedrive");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "저장 완료", description: data.message });
    },
    onError: (err: Error) => {
      toast({ title: "저장 실패", description: err.message, variant: "destructive" });
    },
  });

  const autoLinkMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/purchase-items/auto-link-vendors");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "자동 연결 완료", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-items"] });
    },
    onError: (err: Error) => {
      toast({ title: "자동 연결 실패", description: err.message, variant: "destructive" });
    },
  });

  const [openingExcel, setOpeningExcel] = useState(false);
  const openExcel = async () => {
    setOpeningExcel(true);
    try {
      const res = await apiRequest("GET", "/api/purchase-items/excel-url");
      const data = await res.json();
      if (data.webUrl) {
        window.open(data.webUrl, "_blank");
      }
    } catch (err: any) {
      toast({ title: "엑셀 열기 실패", description: err.message, variant: "destructive" });
    } finally {
      setOpeningExcel(false);
    }
  };

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("POST", "/api/purchase-items", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-items"] });
      toast({ title: "추가 완료" });
      setShowAddDialog(false);
      setForm(EMPTY_FORM);
    },
    onError: (err: Error) => {
      toast({ title: "추가 실패", description: err.message, variant: "destructive" });
    },
  });

  const categories = useMemo(() => {
    if (!items) return [];
    const set = new Set(items.map(i => i.category1));
    return Array.from(set).sort();
  }, [items]);

  const category2Options = useMemo(() => {
    if (!items) return [];
    const filtered = categoryFilter !== "all" ? items.filter(i => i.category1 === categoryFilter) : items;
    const set = new Set(filtered.map(i => i.category2).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [items, categoryFilter]);

  const category2Map = useMemo(() => {
    if (!items) return new Map<string, string[]>();
    const m = new Map<string, string[]>();
    for (const item of items) {
      if (!item.category2) continue;
      const arr = m.get(item.category1) || [];
      if (!arr.includes(item.category2)) arr.push(item.category2);
      m.set(item.category1, arr);
    }
    for (const [k, v] of m) {
      m.set(k, v.sort());
    }
    return m;
  }, [items]);

  const allCategory2 = useMemo(() => {
    if (!items) return [];
    const set = new Set(items.map(i => i.category2).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    if (!items) return [];
    let list = items.filter(item => {
      if (categoryFilter !== "all" && item.category1 !== categoryFilter) return false;
      if (category2Filter !== "all" && (item.category2 || "") !== category2Filter) return false;
      if (vendorFilter === "linked" && !item.vendorId) return false;
      if (vendorFilter === "unlinked" && item.vendorId) return false;
      const isActive = item.active ?? true;
      if (activeFilter === "active" && !isActive) return false;
      if (activeFilter === "inactive" && isActive) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          item.itemCode.toLowerCase().includes(q) ||
          item.itemName.toLowerCase().includes(q) ||
          (item.spec || "").toLowerCase().includes(q) ||
          (item.defaultVendor || "").toLowerCase().includes(q) ||
          (item.vendor?.companyName || "").toLowerCase().includes(q) ||
          (item.brand || "").toLowerCase().includes(q) ||
          (item.remark || "").toLowerCase().includes(q)
        );
      }
      return true;
    });

    if (sortField) {
      const dir = sortDir === "asc" ? 1 : -1;
      list = [...list].sort((a, b) => {
        if (sortField === "cost" || sortField === "leadTimeDays") {
          return ((a[sortField] || 0) - (b[sortField] || 0)) * dir;
        }
        return (a[sortField] || "").localeCompare(b[sortField] || "", "ko") * dir;
      });
    }

    return list;
  }, [items, search, categoryFilter, category2Filter, vendorFilter, activeFilter, sortField, sortDir]);

  const stats = useMemo(() => {
    if (!items) return { total: 0, active: 0, categories: 0, linked: 0, unlinked: 0 };
    return {
      total: items.length,
      active: items.filter(i => i.active).length,
      categories: new Set(items.map(i => i.category1)).size,
      linked: items.filter(i => i.vendorId).length,
      unlinked: items.filter(i => !i.vendorId && i.defaultVendor).length,
    };
  }, [items]);

  const handleSubmitAdd = () => {
    if (!form.itemName || !form.itemCode || !form.category1) {
      toast({ title: "필수 항목을 입력하세요", description: "대분류, 품목코드, 품명은 필수입니다.", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      ...form,
      cost: form.cost ? parseInt(form.cost, 10) : 0,
      leadTimeDays: form.leadTimeDays ? parseInt(form.leadTimeDays, 10) : null,
      moq: form.moq ? parseInt(form.moq, 10) : null,
      safetyStock: form.safetyStock ? parseInt(form.safetyStock, 10) : null,
      isStockItem: false,
      active: true,
    });
  };

  return (
    <div className="h-full overflow-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <ShoppingCart className="h-5 w-5" />
            구매품관리
          </h1>
          <p className="text-sm text-muted-foreground mt-1" data-testid="text-purchase-item-stats">
            전체 {stats.total}개 | 활성 {stats.active}개 | {stats.categories}개 카테고리 | 
            <span className="text-green-600 dark:text-green-400"> 연결 {stats.linked}</span> / 
            <span className="text-orange-500"> 미연결 {stats.unlinked}</span>
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <Button
            variant="outline"
            onClick={() => { setForm(EMPTY_FORM); setShowAddDialog(true); }}
            data-testid="button-add-purchase-item"
          >
            <Plus className="h-4 w-4" />
            <span>품목 추가</span>
          </Button>
          <Button
            variant="outline"
            onClick={openExcel}
            disabled={openingExcel}
            data-testid="button-open-purchase-excel"
          >
            <FileSpreadsheet className={openingExcel ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            <span>{openingExcel ? "여는 중..." : "엑셀 열기"}</span>
          </Button>
          <Button
            variant="outline"
            onClick={() => autoLinkMutation.mutate()}
            disabled={autoLinkMutation.isPending}
            data-testid="button-auto-link-vendors"
          >
            <Link2 className={autoLinkMutation.isPending ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            <span>{autoLinkMutation.isPending ? "연결 중..." : "공급업체 자동연결"}</span>
          </Button>
          <Button
            variant="outline"
            onClick={() => writeMutation.mutate()}
            disabled={writeMutation.isPending}
            data-testid="button-write-purchase-onedrive"
          >
            <Upload className={writeMutation.isPending ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            <span>{writeMutation.isPending ? "저장 중..." : "OneDrive에 저장"}</span>
          </Button>
          <Button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            data-testid="button-sync-purchase-items"
          >
            <RefreshCw className={syncMutation.isPending ? "animate-spin" : ""} />
            <span>{syncMutation.isPending ? "동기화 중..." : "OneDrive 동기화"}</span>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="품목코드, 품명, 공급업체, 브랜드 검색..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-purchase-items"
          />
        </div>
        <Select value={categoryFilter} onValueChange={handleCategoryFilterChange}>
          <SelectTrigger className="w-[160px]" data-testid="select-purchase-category-filter">
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
          <SelectTrigger className="w-[160px]" data-testid="select-purchase-category2-filter">
            <SelectValue placeholder="소분류" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 소분류</SelectItem>
            {category2Options.map(c => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
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
        <Select value={vendorFilter} onValueChange={setVendorFilter}>
          <SelectTrigger className="w-[140px]" data-testid="select-vendor-filter">
            <SelectValue placeholder="공급업체" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="linked">연결됨</SelectItem>
            <SelectItem value="unlinked">미연결</SelectItem>
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
          <ShoppingCart className="h-12 w-12 mb-4 opacity-50" />
          <p className="text-lg font-medium">구매품이 없습니다</p>
          <p className="text-sm mt-1">OneDrive 동기화 버튼을 눌러 purchaselist.xlsx에서 구매품을 가져오세요</p>
        </div>
      ) : (
        <div className="rounded-lg overflow-hidden border border-border/40">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 border-b border-border/40">
                <TableHead className="w-[90px] text-xs h-9 px-3 cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("category1")} data-testid="sort-category1">
                  <span className="inline-flex items-center gap-1">대분류 {sortField === "category1" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}</span>
                </TableHead>
                <TableHead className="w-[90px] text-xs h-9 px-3 cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("category2")} data-testid="sort-category2">
                  <span className="inline-flex items-center gap-1">소분류 {sortField === "category2" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}</span>
                </TableHead>
                <TableHead className="w-[150px] text-xs h-9 px-3 cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("itemCode")} data-testid="sort-itemCode">
                  <span className="inline-flex items-center gap-1">품목코드 {sortField === "itemCode" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}</span>
                </TableHead>
                <TableHead className="max-w-[180px] text-xs h-9 px-3 cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("itemName")} data-testid="sort-itemName">
                  <span className="inline-flex items-center gap-1">품명 {sortField === "itemName" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}</span>
                </TableHead>
                <TableHead className="hidden md:table-cell max-w-[140px] text-xs h-9 px-3">규격</TableHead>
                <TableHead className="hidden lg:table-cell w-[130px] text-xs h-9 px-3">공급업체</TableHead>
                <TableHead className="text-right w-[100px] text-xs h-9 px-3 cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("cost")} data-testid="sort-cost">
                  <span className="inline-flex items-center gap-1 justify-end w-full">단가 {sortField === "cost" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}</span>
                </TableHead>
                <TableHead className="hidden lg:table-cell text-center w-[60px] text-xs h-9 px-3 cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort("leadTimeDays")} data-testid="sort-leadTimeDays">
                  <span className="inline-flex items-center gap-1">L/T {sortField === "leadTimeDays" ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}</span>
                </TableHead>
                <TableHead className="hidden xl:table-cell w-[80px] text-xs h-9 px-3">유형</TableHead>
                <TableHead className="text-center w-[28px] text-xs h-9 px-1"><Layers className="h-3 w-3 mx-auto text-muted-foreground" /></TableHead>
                <TableHead className="text-center w-[28px] text-xs h-9 px-1"><Star className="h-3 w-3 mx-auto text-muted-foreground" /></TableHead>
                <TableHead className="text-center w-[35px] text-xs h-9 px-1"></TableHead>
                <TableHead className="w-[28px] h-9 px-1"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(item => {
                const isExpanded = expandedId === item.id;
                return (
                  <Fragment key={item.id}>
                    <TableRow
                      className={`cursor-pointer transition-colors border-b border-border/20 ${isExpanded ? "bg-blue-50/40 dark:bg-blue-950/10" : "hover:bg-muted/20"}`}
                      onClick={() => setExpandedId(isExpanded ? null : item.id)}
                      data-testid={`row-purchase-item-${item.id}`}
                    >
                      <TableCell className="text-xs py-1.5 px-3 text-foreground" data-testid={`text-pcat1-${item.id}`}>
                        {item.category1}
                      </TableCell>
                      <TableCell className="text-xs py-1.5 px-3 text-foreground/70">
                        {item.category2 || "-"}
                      </TableCell>
                      <TableCell className="text-xs py-1.5 px-3 text-foreground max-w-[150px] truncate font-mono" data-testid={`text-pcode-${item.id}`}>
                        {item.itemCode}
                      </TableCell>
                      <TableCell className="text-xs py-1.5 px-3 text-foreground max-w-[180px] truncate" data-testid={`text-pname-${item.id}`}>
                        {item.itemName}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs py-1.5 px-3 text-foreground/70 max-w-[140px] truncate">
                        {item.spec || "-"}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs py-1.5 px-3 max-w-[130px]" data-testid={`text-pvendor-${item.id}`}>
                        <VendorBadge item={item} />
                      </TableCell>
                      <TableCell className="text-right text-xs py-1.5 px-3 text-foreground whitespace-nowrap" data-testid={`text-pcost-${item.id}`}>
                        {formatPrice(item.cost)}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-center text-xs py-1.5 px-3 text-foreground/70">
                        {item.leadTimeDays ? `${item.leadTimeDays}일` : "-"}
                      </TableCell>
                      <TableCell className="hidden xl:table-cell text-xs py-1.5 px-3 text-foreground/70">
                        {item.itemType || "-"}
                      </TableCell>
                      <TableCell className="text-center py-1.5 px-1">
                        {(() => {
                          const links = bomLinkMap.get(item.id);
                          if (links && links.length > 0) {
                            return (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span data-testid={`icon-bom-linked-${item.id}`}>
                                    <Layers className="h-3.5 w-3.5 text-blue-500 mx-auto" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs max-w-[200px]">
                                  <div className="font-medium mb-0.5">연결된 판매제품:</div>
                                  {links.map((l, i) => (
                                    <div key={i}>{l.itemName} ({l.itemCode})</div>
                                  ))}
                                </TooltipContent>
                              </Tooltip>
                            );
                          }
                          return (
                            <span data-testid={`icon-bom-none-${item.id}`}>
                              <Layers className="h-3.5 w-3.5 text-muted-foreground/20 mx-auto" />
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-center py-1.5 px-1" onClick={e => e.stopPropagation()}>
                        <button
                          className="p-0.5 hover:scale-110 transition-transform"
                          onClick={() => toggleFavMutation.mutate({ id: item.id, isFavorite: !item.isFavorite })}
                          data-testid={`button-fav-${item.id}`}
                        >
                          <Star className={`h-3.5 w-3.5 ${item.isFavorite ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30 hover:text-yellow-400"}`} />
                        </button>
                      </TableCell>
                      <TableCell className="text-center py-1.5 px-1">
                        <div className={`w-1.5 h-1.5 rounded-full mx-auto ${item.active ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"}`} />
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
                          <PurchaseItemDetailRow item={item} vendors={vendors} categories={categories} category2Map={category2Map} allCategory2={allCategory2} />
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

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>구매품 추가</DialogTitle>
          </DialogHeader>
          <div ref={dialogRef} className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">대분류 *</Label>
              <CategoryCombobox
                value={form.category1}
                options={categories}
                onSelect={val => setForm(f => ({ ...f, category1: val, category2: "" }))}
                placeholder="대분류 선택..."
                testId="combo-add-category1"
                container={container}
              />
            </div>
            <div>
              <Label className="text-xs">소분류</Label>
              <CategoryCombobox
                value={form.category2}
                options={form.category1 ? (category2Map.get(form.category1) || []) : []}
                allOptions={allCategory2}
                onSelect={val => setForm(f => ({ ...f, category2: val }))}
                placeholder="소분류 선택..."
                testId="combo-add-category2"
                container={container}
              />
            </div>
            <div>
              <Label className="text-xs">품목코드 *</Label>
              <Input value={form.itemCode} onChange={e => setForm(f => ({ ...f, itemCode: e.target.value }))} placeholder="AIVE-01" data-testid="input-add-itemcode" />
            </div>
            <div>
              <Label className="text-xs">품명 *</Label>
              <Input value={form.itemName} onChange={e => setForm(f => ({ ...f, itemName: e.target.value }))} placeholder="Light Cover" data-testid="input-add-itemname" />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">규격</Label>
              <Input value={form.spec} onChange={e => setForm(f => ({ ...f, spec: e.target.value }))} data-testid="input-add-spec" />
            </div>
            <div>
              <Label className="text-xs">브랜드</Label>
              <Input value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} data-testid="input-add-brand" />
            </div>
            <div>
              <Label className="text-xs">원산지</Label>
              <Input value={form.originCountry} onChange={e => setForm(f => ({ ...f, originCountry: e.target.value }))} placeholder="KOR" data-testid="input-add-origin" />
            </div>
            <div>
              <Label className="text-xs">공급업체</Label>
              <Input value={form.defaultVendor} onChange={e => setForm(f => ({ ...f, defaultVendor: e.target.value }))} data-testid="input-add-vendor" />
            </div>
            <div>
              <Label className="text-xs">단가</Label>
              <Input type="number" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))} data-testid="input-add-cost" />
            </div>
            <div>
              <Label className="text-xs">리드타임 (일)</Label>
              <Input type="number" value={form.leadTimeDays} onChange={e => setForm(f => ({ ...f, leadTimeDays: e.target.value }))} data-testid="input-add-leadtime" />
            </div>
            <div>
              <Label className="text-xs">유형</Label>
              <Input value={form.itemType} onChange={e => setForm(f => ({ ...f, itemType: e.target.value }))} placeholder="assembly" data-testid="input-add-itemtype" />
            </div>
            <div>
              <Label className="text-xs">단위</Label>
              <Input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} placeholder="ea" data-testid="input-add-unit" />
            </div>
            <div>
              <Label className="text-xs">MOQ</Label>
              <Input type="number" value={form.moq} onChange={e => setForm(f => ({ ...f, moq: e.target.value }))} data-testid="input-add-moq" />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">비고</Label>
              <Input value={form.remark} onChange={e => setForm(f => ({ ...f, remark: e.target.value }))} data-testid="input-add-remark" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)} data-testid="button-cancel-add">취소</Button>
            <Button onClick={handleSubmitAdd} disabled={createMutation.isPending} data-testid="button-submit-add">
              {createMutation.isPending ? "추가 중..." : "추가"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
