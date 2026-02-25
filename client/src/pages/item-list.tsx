import { useQuery, useMutation } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Package, RefreshCw, Search, ChevronDown, ChevronUp, Save, X, Pencil } from "lucide-react";
import { useState, useMemo, Fragment, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ItemMaster, ItemInventory, ItemDocument } from "@shared/schema";
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

function EditableField({
  label,
  value,
  onSave,
  type = "text",
  testId,
}: {
  label: string;
  value: string;
  onSave: (val: string) => void;
  type?: "text" | "number";
  testId: string;
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
      <div>
        <span className="text-muted-foreground text-xs">{label}</span>
        <div className="flex items-center gap-1 mt-0.5">
          <Input
            className="h-7 text-sm"
            type={type}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") handleCancel();
            }}
            autoFocus
            data-testid={`input-edit-${testId}`}
          />
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleSave} data-testid={`button-save-${testId}`}>
            <Save className="h-3 w-3" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleCancel} data-testid={`button-cancel-${testId}`}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="cursor-pointer group"
      onClick={() => { setEditing(true); setDraft(value); }}
      data-testid={`field-${testId}`}
    >
      <span className="text-muted-foreground text-xs">{label}</span>
      <div className="flex items-center gap-1">
        <p className="font-medium text-sm">{type === "number" ? formatPrice(Number(value) || null) : (value || "-")}</p>
        <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </div>
  );
}

function ItemDetailRow({ item }: { item: ItemWithDetails }) {
  const { toast } = useToast();

  const patchMutation = useMutation({
    mutationFn: async (fields: Record<string, any>) => {
      const res = await apiRequest("PATCH", `/api/items/${item.id}`, fields);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      toast({ title: "저장 완료", description: "OneDrive 파일에도 반영됩니다" });
    },
    onError: (err: Error) => {
      toast({ title: "저장 실패", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="p-4 bg-muted/30 border-t space-y-3">
      {patchMutation.isPending && (
        <div className="flex items-center gap-2 text-xs text-blue-600">
          <RefreshCw className="h-3 w-3 animate-spin" />
          저장 중...
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
        <div>
          <span className="text-muted-foreground text-xs">품목코드</span>
          <p className="font-medium" data-testid={`text-detail-code-${item.itemCode}`}>{item.itemCode}</p>
        </div>
        <EditableField
          label="품목명"
          value={item.itemName}
          onSave={val => patchMutation.mutate({ itemName: val })}
          testId={`name-${item.itemCode}`}
        />
        <EditableField
          label="사양"
          value={item.spec || ""}
          onSave={val => patchMutation.mutate({ spec: val })}
          testId={`spec-${item.itemCode}`}
        />
        <EditableField
          label="제품유형"
          value={item.itemType || ""}
          onSave={val => patchMutation.mutate({ itemType: val })}
          testId={`type-${item.itemCode}`}
        />
        <div>
          <span className="text-muted-foreground text-xs">활성 상태</span>
          <div className="flex items-center gap-2 mt-1">
            <Switch
              checked={item.active ?? true}
              onCheckedChange={val => patchMutation.mutate({ active: val })}
              data-testid={`switch-active-${item.itemCode}`}
            />
            <span className="text-sm">{item.active ? "활성" : "비활성"}</span>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <EditableField
          label="원가"
          value={String(item.cost || 0)}
          type="number"
          onSave={val => patchMutation.mutate({ cost: parseInt(val, 10) || 0 })}
          testId={`cost-${item.itemCode}`}
        />
        <EditableField
          label="판매가"
          value={String(item.salesPrice || 0)}
          type="number"
          onSave={val => patchMutation.mutate({ salesPrice: parseInt(val, 10) || 0 })}
          testId={`price-${item.itemCode}`}
        />
        {item.cost && item.salesPrice ? (
          <div>
            <span className="text-muted-foreground text-xs">마진</span>
            <p className="font-medium text-green-600" data-testid={`text-detail-margin-${item.itemCode}`}>
              {formatPrice(item.salesPrice - item.cost)} ({Math.round(((item.salesPrice - item.cost) / item.salesPrice) * 100)}%)
            </p>
          </div>
        ) : null}
      </div>
      {item.inventory.length > 0 && (
        <div className="text-sm">
          <span className="text-muted-foreground">재고 상세: </span>
          {item.inventory.map(inv => (
            <Badge key={inv.id} variant="outline" className="mr-1">
              {inv.stockType}: {inv.qty}
            </Badge>
          ))}
        </div>
      )}
      {item.documents.length > 0 && (
        <div className="text-sm">
          <span className="text-muted-foreground">문서: </span>
          {item.documents.map(doc => (
            <Badge key={doc.id} variant="secondary" className="mr-1">
              {doc.docType}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ItemList() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  const categories = useMemo(() => {
    if (!items) return [];
    const set = new Set(items.map(i => i.category1));
    return Array.from(set).sort();
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <Package className="h-5 w-5" />
            판매제품관리
          </h1>
          <p className="text-sm text-muted-foreground mt-1" data-testid="text-item-stats">
            전체 {stats.total}개 | 활성 {stats.active}개 | {stats.categories}개 카테고리
          </p>
        </div>
        <Button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          data-testid="button-sync-items"
        >
          <RefreshCw className={syncMutation.isPending ? "animate-spin" : ""} />
          <span>{syncMutation.isPending ? "동기화 중..." : "OneDrive 동기화"}</span>
        </Button>
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
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-[90px]">대분류</TableHead>
                <TableHead className="w-[90px]">소분류</TableHead>
                <TableHead className="w-[120px]">품목코드</TableHead>
                <TableHead>품목명</TableHead>
                <TableHead className="hidden md:table-cell">사양</TableHead>
                <TableHead className="text-right w-[100px]">원가</TableHead>
                <TableHead className="text-right w-[100px]">판매가</TableHead>
                <TableHead className="text-center w-[60px]">재고</TableHead>
                <TableHead className="text-center w-[60px]">상태</TableHead>
                <TableHead className="w-[40px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(item => (
                <Fragment key={item.id}>
                  <TableRow
                    className="cursor-pointer hover:bg-muted/30"
                    onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                    data-testid={`row-item-${item.itemCode}`}
                  >
                    <TableCell className="text-xs font-medium" data-testid={`text-cat1-${item.itemCode}`}>
                      {item.category1}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground" data-testid={`text-cat2-${item.itemCode}`}>
                      {item.category2 || "-"}
                    </TableCell>
                    <TableCell className="font-mono text-xs" data-testid={`text-code-${item.itemCode}`}>
                      {item.itemCode}
                    </TableCell>
                    <TableCell className="font-medium" data-testid={`text-name-${item.itemCode}`}>
                      {item.itemName}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground max-w-[200px] truncate">
                      {item.spec || "-"}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground" data-testid={`text-cost-${item.itemCode}`}>
                      {formatPrice(item.cost)}
                    </TableCell>
                    <TableCell className="text-right font-medium" data-testid={`text-price-${item.itemCode}`}>
                      {formatPrice(item.salesPrice)}
                    </TableCell>
                    <TableCell className="text-center">
                      {getStockQty(item.inventory, "AVAILABLE") > 0 ? (
                        <Badge variant="secondary" data-testid={`badge-stock-${item.itemCode}`}>
                          {getStockQty(item.inventory, "AVAILABLE")}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {item.active ? (
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" data-testid={`badge-active-${item.itemCode}`}>
                          활성
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground" data-testid={`badge-inactive-${item.itemCode}`}>
                          비활성
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {expandedId === item.id ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </TableCell>
                  </TableRow>
                  {expandedId === item.id && (
                    <TableRow>
                      <TableCell colSpan={10} className="p-0">
                        <ItemDetailRow item={item} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
