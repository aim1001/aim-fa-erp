import { useQuery, useMutation } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ShoppingCart, RefreshCw, Search, ChevronDown, ChevronUp, Save, X, Pencil, Plus, Trash2 } from "lucide-react";
import { useState, useMemo, Fragment, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { PurchaseItem } from "@shared/schema";
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

function formatPrice(val: number | null | undefined) {
  if (!val) return "-";
  return val.toLocaleString("ko-KR") + "원";
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

function PurchaseItemDetailRow({ item }: { item: PurchaseItem }) {
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

        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">공급업체</span>
          <InlineEdit
            value={item.defaultVendor || ""}
            onSave={val => patchMutation.mutate({ defaultVendor: val })}
            testId={`pvendor-${item.id}`}
            className="font-medium text-blue-700 dark:text-blue-400"
          />
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
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: items, isLoading } = useQuery<PurchaseItem[]>({
    queryKey: ["/api/purchase-items"],
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

  const filtered = useMemo(() => {
    if (!items) return [];
    return items.filter(item => {
      if (categoryFilter !== "all" && item.category1 !== categoryFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          item.itemCode.toLowerCase().includes(q) ||
          item.itemName.toLowerCase().includes(q) ||
          (item.spec || "").toLowerCase().includes(q) ||
          (item.defaultVendor || "").toLowerCase().includes(q) ||
          (item.brand || "").toLowerCase().includes(q) ||
          (item.remark || "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [items, search, categoryFilter]);

  const stats = useMemo(() => {
    if (!items) return { total: 0, active: 0, categories: 0 };
    return {
      total: items.length,
      active: items.filter(i => i.active).length,
      categories: new Set(items.map(i => i.category1)).size,
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
            전체 {stats.total}개 | 활성 {stats.active}개 | {stats.categories}개 카테고리
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => { setForm(EMPTY_FORM); setShowAddDialog(true); }}
            data-testid="button-add-purchase-item"
          >
            <Plus className="h-4 w-4" />
            <span>품목 추가</span>
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

      <div className="flex flex-wrap gap-2">
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
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[160px]" data-testid="select-purchase-category-filter">
            <SelectValue placeholder="카테고리" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 카테고리</SelectItem>
            {categories.map(c => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
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
          <ShoppingCart className="h-12 w-12 mb-4 opacity-50" />
          <p className="text-lg font-medium">구매품이 없습니다</p>
          <p className="text-sm mt-1">OneDrive 동기화 버튼을 눌러 purchaselist.xlsx에서 구매품을 가져오세요</p>
        </div>
      ) : (
        <div className="rounded-lg overflow-hidden border border-border/40">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 border-b border-border/40">
                <TableHead className="w-[90px] text-xs h-9 px-3">대분류</TableHead>
                <TableHead className="w-[90px] text-xs h-9 px-3">소분류</TableHead>
                <TableHead className="w-[150px] text-xs h-9 px-3">품목코드</TableHead>
                <TableHead className="max-w-[180px] text-xs h-9 px-3">품명</TableHead>
                <TableHead className="hidden md:table-cell max-w-[140px] text-xs h-9 px-3">규격</TableHead>
                <TableHead className="hidden lg:table-cell w-[100px] text-xs h-9 px-3">공급업체</TableHead>
                <TableHead className="text-right w-[100px] text-xs h-9 px-3">단가</TableHead>
                <TableHead className="hidden lg:table-cell text-center w-[60px] text-xs h-9 px-3">L/T</TableHead>
                <TableHead className="hidden xl:table-cell w-[80px] text-xs h-9 px-3">유형</TableHead>
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
                      <TableCell className="hidden lg:table-cell text-xs py-1.5 px-3 text-foreground/70 truncate">
                        {item.defaultVendor || "-"}
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
                        <TableCell colSpan={11} className="p-0">
                          <PurchaseItemDetailRow item={item} />
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">대분류 *</Label>
              <Input value={form.category1} onChange={e => setForm(f => ({ ...f, category1: e.target.value }))} placeholder="FEEDER" data-testid="input-add-category1" />
            </div>
            <div>
              <Label className="text-xs">소분류</Label>
              <Input value={form.category2} onChange={e => setForm(f => ({ ...f, category2: e.target.value }))} placeholder="MECHANICAL" data-testid="input-add-category2" />
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
