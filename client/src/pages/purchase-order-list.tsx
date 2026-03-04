import { useQuery, useMutation } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ClipboardCheck, Search, RefreshCw, ExternalLink, Check, Package, Ship, Truck, X, Save, FileText, Wallet, Download, XCircle, Trash2, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useState, useMemo, useCallback, useEffect } from "react";
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
import { Input } from "@/components/ui/input";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { PurchaseOrder, PurchaseInvoice, Payment, PurchaseItem, PurchaseOrderItem } from "@shared/schema";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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

function StatusBadge({ status }: { status: string }) {
  if (status === "입고완료") {
    return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0" data-testid="badge-status-completed"><Check className="h-3 w-3 mr-1" />입고완료</Badge>;
  }
  if (status === "수입") {
    return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-0" data-testid="badge-status-import"><Ship className="h-3 w-3 mr-1" />수입</Badge>;
  }
  return <Badge variant="outline" className="text-muted-foreground" data-testid="badge-status-normal"><Package className="h-3 w-3 mr-1" />일반</Badge>;
}

export default function PurchaseOrderList() {
  const currentYear = new Date().getFullYear();
  const { toast } = useToast();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const { data: orders, isLoading } = useQuery<PurchaseOrder[]>({
    queryKey: ["/api/purchase-orders", selectedYear],
    queryFn: async () => {
      const res = await fetch(`/api/purchase-orders?year=${selectedYear}`);
      return res.json();
    },
  });

  const { data: invoices } = useQuery<PurchaseInvoice[]>({
    queryKey: ["/api/purchase-invoices"],
  });

  const { data: payments } = useQuery<Payment[]>({
    queryKey: ["/api/payments"],
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/purchase-orders/sync?year=${selectedYear}`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders", selectedYear] });
      toast({ title: "동기화 완료", description: data.message });
    },
    onError: (err: Error) => {
      toast({ title: "동기화 실패", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, any> }) => {
      const res = await apiRequest("PATCH", `/api/purchase-orders/${id}`, data);
      return res.json();
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders", selectedYear] });
      if (selectedOrder && selectedOrder.id === variables.id) {
        setSelectedOrder({ ...selectedOrder, ...variables.data } as PurchaseOrder);
      }
      toast({ title: "저장되었습니다" });
    },
    onError: (err: Error) => {
      toast({ title: "저장 실패", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/purchase-orders/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders", selectedYear] });
      setSelectedOrder(null);
      toast({ title: "발주가 삭제되었습니다" });
    },
    onError: (err: Error) => {
      toast({ title: "삭제 실패", description: err.message, variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("POST", "/api/purchase-orders", data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders", selectedYear] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      setShowCreateForm(false);
      const msgs: string[] = [];
      if (data.purchaseInvoice) msgs.push("매입계산서 생성");
      if (data.payment) msgs.push("자금계획 생성");
      toast({ title: "발주가 등록되었습니다", description: msgs.length ? msgs.join(", ") : undefined });
    },
    onError: (err: Error) => {
      toast({ title: "등록 실패", description: err.message, variant: "destructive" });
    },
  });

  const filtered = useMemo(() => {
    if (!orders) return [];
    let list = orders;
    if (statusFilter !== "all") {
      list = list.filter(o => o.status === statusFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(o =>
        (o.orderNumber || "").toLowerCase().includes(q) ||
        (o.vendor || "").toLowerCase().includes(q) ||
        (o.description || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [orders, statusFilter, search]);

  const statusCounts = useMemo(() => {
    if (!orders) return { all: 0, "일반": 0, "수입": 0, "입고완료": 0 };
    return {
      all: orders.length,
      "일반": orders.filter(o => o.status === "일반").length,
      "수입": orders.filter(o => o.status === "수입").length,
      "입고완료": orders.filter(o => o.status === "입고완료").length,
    };
  }, [orders]);

  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  return (
    <div className="h-full flex flex-col overflow-hidden" data-testid="page-purchase-orders">
      <div className="border-b px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <ClipboardCheck className="h-5 w-5" />
          <h1 className="text-lg font-semibold" data-testid="text-page-title">발주관리</h1>
          <div className="flex items-center gap-1 ml-2">
            {years.map(y => (
              <Button
                key={y}
                variant={selectedYear === y ? "default" : "ghost"}
                size="sm"
                className="h-7 text-xs px-2"
                onClick={() => setSelectedYear(y)}
                data-testid={`button-year-${y}`}
              >
                {y}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={() => setShowCreateForm(true)}
            data-testid="button-new-order"
          >
            <Plus className="h-4 w-4 mr-1" />신규 발주
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            data-testid="button-sync"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            {syncMutation.isPending ? "동기화 중..." : "OneDrive 동기화"}
          </Button>
        </div>
      </div>

      <div className="px-4 py-2 flex items-center gap-3 border-b flex-shrink-0">
        <div className="flex items-center gap-1">
          {(["all", "일반", "수입", "입고완료"] as const).map(s => (
            <Button
              key={s}
              variant={statusFilter === s ? "default" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setStatusFilter(s)}
              data-testid={`button-filter-${s}`}
            >
              {s === "all" ? "전체" : s}
              <span className="ml-1 text-[10px] opacity-60">
                {statusCounts[s]}
              </span>
            </Button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs ml-auto">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="발주번호, 구매처, 내용 검색..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-7 text-xs"
            data-testid="input-search"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground" data-testid="text-empty">
            <ClipboardCheck className="h-12 w-12 mb-2 opacity-20" />
            <p className="text-sm">발주서가 없습니다</p>
            <p className="text-xs mt-1">OneDrive 동기화를 실행해주세요</p>
          </div>
        ) : (
          <table className="w-full text-sm" data-testid="table-orders">
            <thead className="sticky top-0 bg-background border-b">
              <tr className="text-xs text-muted-foreground">
                <th className="text-left px-4 py-2 font-medium">발주번호</th>
                <th className="text-left px-4 py-2 font-medium">구매처</th>
                <th className="text-left px-4 py-2 font-medium">내용</th>
                <th className="text-right px-4 py-2 font-medium">금액</th>
                <th className="text-center px-4 py-2 font-medium">납품예정일</th>
                <th className="text-center px-4 py-2 font-medium">납품일</th>
                <th className="text-center px-4 py-2 font-medium">상태</th>
                <th className="text-center px-4 py-2 font-medium">입고</th>
                <th className="text-center px-4 py-2 font-medium">계산서</th>
                <th className="text-center px-4 py-2 font-medium">송금</th>
                <th className="text-center px-4 py-2 font-medium">폴더</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(order => {
                const linkedInvoice = invoices?.find(inv => inv.id === order.purchaseInvoiceId);
                const linkedPayment = payments?.find(p => p.id === order.paymentId);

                return (
                  <tr
                    key={order.id}
                    className="border-b hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => setSelectedOrder(order)}
                    data-testid={`row-order-${order.id}`}
                  >
                    <td className="px-4 py-2 font-medium" data-testid={`text-order-number-${order.id}`}>
                      {order.orderNumber || "-"}
                    </td>
                    <td className="px-4 py-2" data-testid={`text-vendor-${order.id}`}>
                      {order.vendor || "-"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground max-w-[200px] truncate" data-testid={`text-description-${order.id}`}>
                      {order.description || "-"}
                    </td>
                    <td className="px-4 py-2 text-right font-medium" data-testid={`text-amount-${order.id}`}>
                      {formatAmount(order.totalAmount)}
                    </td>
                    <td className="px-4 py-2 text-center text-xs" data-testid={`text-expected-date-${order.id}`}>
                      {order.expectedDeliveryDate || "-"}
                    </td>
                    <td className="px-4 py-2 text-center text-xs" data-testid={`text-actual-date-${order.id}`}>
                      {order.actualDeliveryDate || "-"}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <StatusBadge status={order.status || "일반"} />
                    </td>
                    <td className="px-4 py-2 text-center">
                      {order.receivingCompleted ? (
                        <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0" data-testid={`badge-receiving-done-${order.id}`}>
                          <Check className="h-3 w-3 mr-1" />완료
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground" data-testid={`badge-receiving-pending-${order.id}`}>
                          대기
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {linkedInvoice ? (
                        <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border-0" data-testid={`badge-invoice-linked-${order.id}`}>
                          <FileText className="h-3 w-3 mr-1" />연결됨
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground" data-testid={`text-invoice-none-${order.id}`}>-</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {linkedPayment ? (
                        <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0" data-testid={`badge-payment-linked-${order.id}`}>
                          <Wallet className="h-3 w-3 mr-1" />연결됨
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground" data-testid={`text-payment-none-${order.id}`}>-</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {order.onedriveWebUrl && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={e => {
                            e.stopPropagation();
                            window.open(order.onedriveWebUrl!, "_blank");
                          }}
                          data-testid={`button-open-folder-${order.id}`}
                        >
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="border-t px-4 py-1.5 text-xs text-muted-foreground flex-shrink-0" data-testid="text-footer-count">
        총 {filtered.length}건 {statusFilter !== "all" ? `(필터: ${statusFilter})` : ""}
      </div>

      {showCreateForm && (
        <CreateOrderDialog
          year={selectedYear}
          onClose={() => setShowCreateForm(false)}
          onCreate={(data) => createMutation.mutate(data)}
          isPending={createMutation.isPending}
        />
      )}

      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          invoices={invoices || []}
          payments={payments || []}
          onClose={() => setSelectedOrder(null)}
          onUpdate={(id, data) => updateMutation.mutate({ id, data })}
          onDelete={(id) => deleteMutation.mutate(id)}
        />
      )}
    </div>
  );
}

type OneDriveFile = {
  id: string;
  name: string;
  webUrl: string;
  size: number;
  mimeType?: string;
};

type OrderItemRow = {
  key: string;
  itemCode: string;
  itemName: string;
  spec: string;
  brand: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  category1: string;
  isAdjustment: boolean;
};

function PurchaseItemSearchPopover({ onSelect }: { onSelect: (item: PurchaseItem) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [cat1Filter, setCat1Filter] = useState("all");

  const { data: allItems = [] } = useQuery<PurchaseItem[]>({
    queryKey: ["/api/purchase-items"],
    queryFn: async () => {
      const res = await fetch("/api/purchase-items");
      return res.json();
    },
  });

  const activeItems = useMemo(() => allItems.filter(i => i.active !== false), [allItems]);

  const cat1List = useMemo(() => {
    const cats = new Set<string>();
    activeItems.forEach(i => { if (i.category1) cats.add(i.category1); });
    return Array.from(cats).sort();
  }, [activeItems]);

  const filtered = useMemo(() => {
    let list = activeItems;
    if (cat1Filter !== "all") list = list.filter(i => i.category1 === cat1Filter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(i =>
        i.itemName?.toLowerCase().includes(q) ||
        i.itemCode?.toLowerCase().includes(q) ||
        i.spec?.toLowerCase().includes(q) ||
        i.brand?.toLowerCase().includes(q)
      );
    }
    return list.slice(0, 60);
  }, [activeItems, search, cat1Filter]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="text-xs" data-testid="button-add-purchase-item">
          <Plus className="h-3 w-3 mr-1" />구매품 추가
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[480px] p-0" align="start">
        <div className="p-2 border-b space-y-1.5">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="품목코드, 품명, 사양, 브랜드 검색..." className="h-7 text-xs pl-7" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-purchase-item" />
          </div>
          <div className="flex gap-1 flex-wrap">
            <Button size="sm" variant={cat1Filter === "all" ? "default" : "ghost"} className="h-5 text-[10px] px-1.5" onClick={() => setCat1Filter("all")}>전체</Button>
            {cat1List.map(c => (
              <Button key={c} size="sm" variant={cat1Filter === c ? "default" : "ghost"} className="h-5 text-[10px] px-1.5" onClick={() => setCat1Filter(c)}>{c}</Button>
            ))}
          </div>
        </div>
        <div className="max-h-[250px] overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground text-center">검색 결과가 없습니다</p>
          ) : filtered.map(item => (
            <div
              key={item.id}
              className="px-3 py-1.5 hover:bg-accent cursor-pointer border-b last:border-b-0"
              onClick={() => { onSelect(item); setOpen(false); setSearch(""); setCat1Filter("all"); }}
              data-testid={`item-option-${item.id}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground font-mono">{item.itemCode}</span>
                  <span className="text-xs font-medium">{item.itemName}</span>
                </div>
                <span className="text-xs font-medium">{(item.cost || 0).toLocaleString()}원</span>
              </div>
              <div className="flex gap-2 text-[10px] text-muted-foreground">
                {item.spec && <span>{item.spec}</span>}
                {item.brand && <span>· {item.brand}</span>}
                {item.category1 && <span>· {item.category1}</span>}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CreateOrderDialog({
  year,
  onClose,
  onCreate,
  isPending,
}: {
  year: number;
  onClose: () => void;
  onCreate: (data: Record<string, any>) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState({
    orderNumber: "",
    vendor: "",
    description: "",
    status: "일반",
    expectedDeliveryDate: "",
    paymentDate: "",
  });

  const [items, setItems] = useState<OrderItemRow[]>([]);
  const [showFreeItem, setShowFreeItem] = useState(false);
  const [freeItem, setFreeItem] = useState({ itemName: "", spec: "", brand: "", unitPrice: "", quantity: "1" });
  const [showAdjustment, setShowAdjustment] = useState(false);
  const [adjustment, setAdjustment] = useState({ itemName: "", amount: "" });

  const nextKey = useCallback(() => String(Date.now() + Math.random()), []);

  const handleAddPurchaseItem = (pi: PurchaseItem) => {
    setItems(prev => [...prev, {
      key: nextKey(),
      itemCode: pi.itemCode || "",
      itemName: pi.itemName,
      spec: pi.spec || "",
      brand: pi.brand || "",
      quantity: 1,
      unitPrice: pi.cost || 0,
      amount: pi.cost || 0,
      category1: pi.category1 || "",
      isAdjustment: false,
    }]);
  };

  const handleAddFreeItem = () => {
    if (!freeItem.itemName.trim()) return;
    const qty = parseInt(freeItem.quantity) || 1;
    const price = parseInt(freeItem.unitPrice) || 0;
    setItems(prev => [...prev, {
      key: nextKey(),
      itemCode: "",
      itemName: freeItem.itemName,
      spec: freeItem.spec,
      brand: freeItem.brand,
      quantity: qty,
      unitPrice: price,
      amount: qty * price,
      category1: "",
      isAdjustment: false,
    }]);
    setFreeItem({ itemName: "", spec: "", brand: "", unitPrice: "", quantity: "1" });
    setShowFreeItem(false);
  };

  const handleAddAdjustment = () => {
    if (!adjustment.itemName.trim()) return;
    const amt = parseInt(adjustment.amount) || 0;
    setItems(prev => [...prev, {
      key: nextKey(),
      itemCode: "",
      itemName: adjustment.itemName,
      spec: "",
      brand: "",
      quantity: 1,
      unitPrice: amt,
      amount: amt,
      category1: "",
      isAdjustment: true,
    }]);
    setAdjustment({ itemName: "", amount: "" });
    setShowAdjustment(false);
  };

  const updateItem = (key: string, field: string, value: any) => {
    setItems(prev => prev.map(item => {
      if (item.key !== key) return item;
      const updated = { ...item, [field]: value };
      if (field === "quantity" || field === "unitPrice") {
        updated.amount = (updated.quantity || 0) * (updated.unitPrice || 0);
      }
      return updated;
    }));
  };

  const removeItem = (key: string) => {
    setItems(prev => prev.filter(i => i.key !== key));
  };

  const regularItems = items.filter(i => !i.isAdjustment);
  const adjustmentItems = items.filter(i => i.isAdjustment);
  const supplyAmount = items.reduce((s, i) => s + i.amount, 0);
  const taxAmount = Math.round(supplyAmount * 0.1);
  const totalAmount = supplyAmount + taxAmount;

  const canSubmit = form.vendor.trim() !== "";

  const handleSubmit = () => {
    if (!canSubmit) return;
    const itemsData = items.map((item, idx) => ({
      itemCode: item.itemCode || null,
      itemName: item.itemName,
      spec: item.spec || null,
      brand: item.brand || null,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      amount: item.amount,
      category1: item.category1 || null,
      sortOrder: idx,
      isAdjustment: item.isAdjustment,
    }));

    onCreate({
      orderNumber: form.orderNumber || null,
      vendor: form.vendor,
      description: form.description || regularItems.map(i => i.itemName).join(", ") || null,
      supplyAmount: supplyAmount || null,
      taxAmount: taxAmount || null,
      totalAmount: totalAmount || null,
      status: form.status,
      expectedDeliveryDate: form.expectedDeliveryDate || null,
      paymentDate: form.paymentDate || null,
      year,
      items: itemsData,
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="modal-create-order">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            신규 발주 등록
          </DialogTitle>
          <DialogDescription className="sr-only">신규 발주 등록 양식</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">발주번호</Label>
              <Input className="h-8 text-sm" placeholder={`${year.toString().slice(2)}-`} value={form.orderNumber} onChange={e => setForm(f => ({ ...f, orderNumber: e.target.value }))} data-testid="input-create-order-number" />
            </div>
            <div>
              <Label className="text-xs">구매처 <span className="text-red-500">*</span></Label>
              <Input className="h-8 text-sm" value={form.vendor} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))} data-testid="input-create-vendor" />
            </div>
            <div>
              <Label className="text-xs">상태</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger className="h-8 text-sm" data-testid="select-create-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="일반">일반</SelectItem>
                  <SelectItem value="수입">수입</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs">내용 (메모)</Label>
            <Input className="h-8 text-sm" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} data-testid="input-create-description" />
          </div>

          <div className="border-t pt-3">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs font-medium">품목</Label>
              <div className="flex gap-1">
                <PurchaseItemSearchPopover onSelect={handleAddPurchaseItem} />
                <Button size="sm" variant="outline" className="text-xs" onClick={() => setShowFreeItem(true)} data-testid="button-add-free-item">
                  <Plus className="h-3 w-3 mr-1" />직접 입력
                </Button>
                <Button size="sm" variant="outline" className="text-xs" onClick={() => setShowAdjustment(true)} data-testid="button-add-adjustment">
                  <Plus className="h-3 w-3 mr-1" />가격 조정
                </Button>
              </div>
            </div>

            {showFreeItem && (
              <div className="border rounded p-2 mb-2 bg-muted/20 space-y-1.5" data-testid="panel-free-item">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-[10px]">품명 *</Label>
                    <Input className="h-7 text-xs" value={freeItem.itemName} onChange={e => setFreeItem(f => ({ ...f, itemName: e.target.value }))} data-testid="input-free-item-name" />
                  </div>
                  <div>
                    <Label className="text-[10px]">사양</Label>
                    <Input className="h-7 text-xs" value={freeItem.spec} onChange={e => setFreeItem(f => ({ ...f, spec: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-[10px]">브랜드</Label>
                    <Input className="h-7 text-xs" value={freeItem.brand} onChange={e => setFreeItem(f => ({ ...f, brand: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-[10px]">수량</Label>
                    <Input type="number" className="h-7 text-xs" value={freeItem.quantity} onChange={e => setFreeItem(f => ({ ...f, quantity: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-[10px]">단가</Label>
                    <Input type="number" className="h-7 text-xs" value={freeItem.unitPrice} onChange={e => setFreeItem(f => ({ ...f, unitPrice: e.target.value }))} />
                  </div>
                  <div className="flex items-end gap-1">
                    <Button size="sm" className="h-7 text-xs" onClick={handleAddFreeItem} data-testid="button-confirm-free-item">추가</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowFreeItem(false)}>취소</Button>
                  </div>
                </div>
              </div>
            )}

            {showAdjustment && (
              <div className="border rounded p-2 mb-2 bg-muted/20 space-y-1.5" data-testid="panel-adjustment">
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <Label className="text-[10px]">항목명 *</Label>
                    <Input className="h-7 text-xs" placeholder="예: 할인, 운반비" value={adjustment.itemName} onChange={e => setAdjustment(f => ({ ...f, itemName: e.target.value }))} data-testid="input-adjustment-name" />
                  </div>
                  <div>
                    <Label className="text-[10px]">금액 (- 가능)</Label>
                    <Input type="number" className="h-7 text-xs" placeholder="예: -50000" value={adjustment.amount} onChange={e => setAdjustment(f => ({ ...f, amount: e.target.value }))} data-testid="input-adjustment-amount" />
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" className="h-7 text-xs" onClick={handleAddAdjustment} data-testid="button-confirm-adjustment">추가</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowAdjustment(false)}>취소</Button>
                </div>
              </div>
            )}

            {regularItems.length > 0 && (
              <table className="w-full text-xs border-collapse" data-testid="table-order-items">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left py-1 px-2 font-medium">품명</th>
                    <th className="text-left py-1 px-2 font-medium w-[100px]">사양</th>
                    <th className="text-center py-1 px-2 font-medium w-[60px]">수량</th>
                    <th className="text-right py-1 px-2 font-medium w-[90px]">단가</th>
                    <th className="text-right py-1 px-2 font-medium w-[90px]">금액</th>
                    <th className="w-[30px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {regularItems.map(item => (
                    <tr key={item.key} className="border-b last:border-b-0" data-testid={`row-item-${item.key}`}>
                      <td className="py-1 px-2">
                        <div className="font-medium">{item.itemName}</div>
                        {item.brand && <div className="text-[10px] text-muted-foreground">{item.brand}</div>}
                      </td>
                      <td className="py-1 px-2 text-muted-foreground">{item.spec || "-"}</td>
                      <td className="py-1 px-2 text-center">
                        <Input type="number" className="h-6 text-xs text-center w-14 mx-auto" value={item.quantity} onChange={e => updateItem(item.key, "quantity", parseInt(e.target.value) || 0)} data-testid={`input-qty-${item.key}`} />
                      </td>
                      <td className="py-1 px-2 text-right">
                        <Input type="number" className="h-6 text-xs text-right w-20 ml-auto" value={item.unitPrice} onChange={e => updateItem(item.key, "unitPrice", parseInt(e.target.value) || 0)} data-testid={`input-price-${item.key}`} />
                      </td>
                      <td className="py-1 px-2 text-right font-medium">{item.amount.toLocaleString()}</td>
                      <td className="py-1 px-1">
                        <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-red-400 hover:text-red-600" onClick={() => removeItem(item.key)} data-testid={`button-remove-${item.key}`}>
                          <X className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {adjustmentItems.length > 0 && (
              <div className="mt-2">
                <Label className="text-[10px] text-muted-foreground mb-1 block">가격 조정</Label>
                {adjustmentItems.map(item => (
                  <div key={item.key} className="flex items-center justify-between py-1 px-2 border-b last:border-b-0 text-xs" data-testid={`row-adjustment-${item.key}`}>
                    <span className="text-muted-foreground">{item.itemName}</span>
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${item.amount < 0 ? "text-red-600" : "text-blue-600"}`}>{item.amount > 0 ? "+" : ""}{item.amount.toLocaleString()}원</span>
                      <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-red-400 hover:text-red-600" onClick={() => removeItem(item.key)} data-testid={`button-remove-adj-${item.key}`}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {items.length === 0 && (
              <div className="text-center py-6 text-xs text-muted-foreground border rounded" data-testid="text-empty-items">
                품목을 추가해 주세요
              </div>
            )}

            {items.length > 0 && (
              <div className="mt-3 border-t pt-2 space-y-1 text-sm" data-testid="panel-totals">
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-xs">공급가액</span>
                  <span className="font-medium">{supplyAmount.toLocaleString()}원</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-xs">세액 (10%)</span>
                  <span>{taxAmount.toLocaleString()}원</span>
                </div>
                <div className="flex justify-between text-base font-bold border-t pt-1">
                  <span>합계</span>
                  <span>{totalAmount.toLocaleString()}원</span>
                </div>
              </div>
            )}
          </div>

          <div className="border-t pt-3 grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">예정입고일</Label>
              <Input type="date" className="h-8 text-sm" value={form.expectedDeliveryDate} onChange={e => setForm(f => ({ ...f, expectedDeliveryDate: e.target.value }))} data-testid="input-create-delivery-date" />
              {form.expectedDeliveryDate && (
                <p className="text-[10px] text-muted-foreground mt-0.5">→ 매입계산서 접수일로 자동 등록</p>
              )}
            </div>
            <div>
              <Label className="text-xs">결재(송금)예정일</Label>
              <Input type="date" className="h-8 text-sm" value={form.paymentDate} onChange={e => setForm(f => ({ ...f, paymentDate: e.target.value }))} data-testid="input-create-payment-date" />
              {form.paymentDate && (
                <p className="text-[10px] text-muted-foreground mt-0.5">→ 자금계획(출금)에 자동 등록</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" size="sm" onClick={onClose} data-testid="button-cancel-create">취소</Button>
          <Button size="sm" onClick={handleSubmit} disabled={!canSubmit || isPending} data-testid="button-submit-create">
            {isPending ? "등록 중..." : "발주 등록"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ExcelAmountParser({ orderId, onAmountParsed }: { orderId: string; onAmountParsed: (data: { supplyAmount: number; taxAmount: number; totalAmount: number }) => void }) {
  const { toast } = useToast();
  const [showFiles, setShowFiles] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState("");
  const [parsedResult, setParsedResult] = useState<{ supplyAmount: number; vat: number; totalAmount: number } | null>(null);
  const [autoTriggered, setAutoTriggered] = useState(false);

  const { data: files, isLoading: filesLoading } = useQuery<OneDriveFile[]>({
    queryKey: ["/api/purchase-orders", orderId, "files"],
    queryFn: async () => {
      const res = await fetch(`/api/purchase-orders/${orderId}/files`);
      return res.json();
    },
    enabled: showFiles,
  });

  const excelFiles = useMemo(() =>
    (files || []).filter(f => f.name.match(/\.(xlsx?|xls)$/i)),
    [files]
  );

  const parseMutation = useMutation({
    mutationFn: async (fileId: string) => {
      const res = await apiRequest("POST", `/api/purchase-orders/${orderId}/parse-amount`, { fileId });
      return res.json();
    },
    onSuccess: (data) => {
      setParsedResult(data);
    },
    onError: (err: Error) => {
      toast({ title: "금액 파싱 실패", description: err.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (excelFiles.length === 1 && !autoTriggered && !parsedResult) {
      setSelectedFileId(excelFiles[0].id);
      parseMutation.mutate(excelFiles[0].id);
      setAutoTriggered(true);
    }
  }, [excelFiles, autoTriggered, parsedResult]);

  if (!showFiles) {
    return (
      <Button variant="outline" size="sm" className="text-xs w-full" onClick={() => setShowFiles(true)} data-testid="button-excel-read">
        <Download className="h-3 w-3 mr-1" />엑셀에서 금액 읽기
      </Button>
    );
  }

  return (
    <div className="border rounded p-2 space-y-2 bg-muted/20" data-testid="panel-excel-parser">
      <div className="flex items-center justify-between">
        <Label className="text-[10px] font-medium">엑셀 금액 읽기</Label>
        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => { setShowFiles(false); setParsedResult(null); setSelectedFileId(""); setAutoTriggered(false); }} data-testid="button-close-excel-panel">
          <X className="h-3 w-3" />
        </Button>
      </div>
      {filesLoading || parseMutation.isPending ? (
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 flex-1" />
          <span className="text-[10px] text-muted-foreground">읽는 중...</span>
        </div>
      ) : excelFiles.length === 0 ? (
        <p className="text-[10px] text-muted-foreground">엑셀 파일이 없습니다</p>
      ) : (
        <>
          {excelFiles.length > 1 && (
            <>
              <Select value={selectedFileId || "none"} onValueChange={v => { setSelectedFileId(v === "none" ? "" : v); setParsedResult(null); }}>
                <SelectTrigger className="h-7 text-xs" data-testid="select-excel-file">
                  <SelectValue placeholder="파일 선택..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">파일 선택...</SelectItem>
                  {excelFiles.map(f => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedFileId && !parsedResult && (
                <Button
                  variant="default"
                  size="sm"
                  className="text-xs w-full"
                  onClick={() => parseMutation.mutate(selectedFileId)}
                  disabled={parseMutation.isPending}
                  data-testid="button-parse-amount"
                >
                  금액 가져오기
                </Button>
              )}
            </>
          )}
          {excelFiles.length === 1 && !parsedResult && !parseMutation.isPending && (
            <p className="text-[10px] text-muted-foreground">{excelFiles[0].name}</p>
          )}
          {parsedResult && (
            <div className="space-y-1 border-t pt-2" data-testid="panel-parsed-result">
              {excelFiles.length === 1 && (
                <p className="text-[10px] text-muted-foreground mb-1">{excelFiles[0].name}</p>
              )}
              <div className="grid grid-cols-3 gap-1 text-[10px]">
                <div>
                  <span className="text-muted-foreground">공급가액</span>
                  <p className="font-medium">{parsedResult.supplyAmount.toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">세액</span>
                  <p className="font-medium">{parsedResult.vat.toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">합계</span>
                  <p className="font-medium">{parsedResult.totalAmount.toLocaleString()}</p>
                </div>
              </div>
              <Button size="sm" className="text-[10px] w-full" onClick={() => { onAmountParsed({ supplyAmount: parsedResult.supplyAmount, taxAmount: parsedResult.vat, totalAmount: parsedResult.totalAmount }); setParsedResult(null); setShowFiles(false); setAutoTriggered(false); }} data-testid="button-apply-amount">
                금액 적용
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function InvoiceSearchPicker({
  label,
  items,
  selectedId,
  onSelect,
  renderItem,
  renderSelected,
  getCompanyName,
  getDate,
  defaultSearch,
  testIdPrefix,
}: {
  label: string;
  items: PurchaseInvoice[];
  selectedId: string;
  onSelect: (id: string) => void;
  renderItem: (item: PurchaseInvoice) => string;
  renderSelected: (item: PurchaseInvoice) => React.ReactNode;
  getCompanyName: (item: PurchaseInvoice) => string;
  getDate: (item: PurchaseInvoice) => string;
  defaultSearch?: string;
  testIdPrefix: string;
}) {
  const [searchText, setSearchText] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const selectedItem = useMemo(() => items.find(i => i.id === selectedId), [items, selectedId]);

  const handleOpen = useCallback(() => {
    if (!isOpen && defaultSearch) setSearchText(defaultSearch);
    setIsOpen(!isOpen);
  }, [isOpen, defaultSearch]);

  const filtered = useMemo(() => {
    if (!isOpen) return [];
    let list = items;
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      list = list.filter(i => getCompanyName(i).toLowerCase().includes(q));
    }
    if (dateFrom) {
      list = list.filter(i => { const d = getDate(i); return d && d >= dateFrom; });
    }
    if (dateTo) {
      list = list.filter(i => { const d = getDate(i); return d && d <= dateTo; });
    }
    return list.slice(0, 50);
  }, [items, searchText, dateFrom, dateTo, isOpen, getCompanyName, getDate]);

  return (
    <div>
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      {selectedItem ? (
        <div className="flex items-center gap-1 mt-1 p-1.5 rounded border bg-muted/50" data-testid={`selected-${testIdPrefix}`}>
          <div className="flex-1 min-w-0 truncate">{renderSelected(selectedItem)}</div>
          <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => { onSelect(""); setIsOpen(false); }} data-testid={`button-clear-${testIdPrefix}`}>
            <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="text-xs w-full justify-start text-muted-foreground" onClick={handleOpen} data-testid={`button-open-${testIdPrefix}-search`}>
          <Search className="h-3 w-3 mr-1" />{isOpen ? "검색 닫기" : "계산서 검색하여 연결"}
        </Button>
      )}
      {isOpen && !selectedItem && (
        <div className="mt-1 border rounded p-2 space-y-2 bg-background" data-testid={`search-panel-${testIdPrefix}`}>
          <div className="flex items-center gap-1">
            <Input
              className="h-7 text-xs flex-1"
              placeholder="업체명 검색..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              data-testid={`input-search-${testIdPrefix}`}
              autoFocus
            />
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => { setIsOpen(false); setSearchText(""); setDateFrom(""); setDateTo(""); }} data-testid={`button-close-${testIdPrefix}-search`}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <Label className="text-[10px] text-muted-foreground">발행일 시작</Label>
              <Input type="date" className="h-7 text-xs" value={dateFrom} onChange={e => setDateFrom(e.target.value)} data-testid={`input-date-from-${testIdPrefix}`} />
            </div>
            <div className="flex-1">
              <Label className="text-[10px] text-muted-foreground">발행일 종료</Label>
              <Input type="date" className="h-7 text-xs" value={dateTo} onChange={e => setDateTo(e.target.value)} data-testid={`input-date-to-${testIdPrefix}`} />
            </div>
          </div>
          <div className="max-h-40 overflow-y-auto border rounded">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground p-2 text-center">
                {searchText.trim() || dateFrom || dateTo ? "검색 결과가 없습니다" : "업체명 또는 기간을 입력하세요"}
              </p>
            ) : (
              filtered.map(item => (
                <div
                  key={item.id}
                  className="w-full text-left px-2 py-1.5 text-xs cursor-pointer border-b last:border-b-0 flex items-center justify-between gap-2 transition-colors hover:bg-accent"
                  onClick={() => { onSelect(item.id); setIsOpen(false); setSearchText(""); setDateFrom(""); setDateTo(""); }}
                  data-testid={`item-${testIdPrefix}-${item.id}`}
                >
                  <span className="truncate">{renderItem(item)}</span>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">{getDate(item)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PaymentSearchPicker({
  label,
  items,
  selectedId,
  onSelect,
  renderSelected,
  defaultSearch,
  testIdPrefix,
}: {
  label: string;
  items: Payment[];
  selectedId: string;
  onSelect: (id: string) => void;
  renderSelected: (item: Payment) => React.ReactNode;
  defaultSearch?: string;
  testIdPrefix: string;
}) {
  const [searchText, setSearchText] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const selectedItem = useMemo(() => items.find(i => i.id === selectedId), [items, selectedId]);

  const handleOpen = useCallback(() => {
    if (!isOpen && defaultSearch) setSearchText(defaultSearch);
    setIsOpen(!isOpen);
  }, [isOpen, defaultSearch]);

  const filtered = useMemo(() => {
    if (!isOpen) return [];
    let list = items;
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      list = list.filter(i => (i.companyName || "").toLowerCase().includes(q) || (i.description || "").toLowerCase().includes(q));
    }
    if (dateFrom) {
      list = list.filter(i => { const d = i.plannedDate || i.actualDate || ""; return d && d >= dateFrom; });
    }
    if (dateTo) {
      list = list.filter(i => { const d = i.plannedDate || i.actualDate || ""; return d && d <= dateTo; });
    }
    return list.slice(0, 50);
  }, [items, searchText, dateFrom, dateTo, isOpen]);

  return (
    <div>
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      {selectedItem ? (
        <div className="flex items-center gap-1 mt-1 p-1.5 rounded border bg-muted/50" data-testid={`selected-${testIdPrefix}`}>
          <div className="flex-1 min-w-0 truncate">{renderSelected(selectedItem)}</div>
          <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => { onSelect(""); setIsOpen(false); }} data-testid={`button-clear-${testIdPrefix}`}>
            <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="text-xs w-full justify-start text-muted-foreground" onClick={handleOpen} data-testid={`button-open-${testIdPrefix}-search`}>
          <Search className="h-3 w-3 mr-1" />{isOpen ? "검색 닫기" : "송금 검색하여 연결"}
        </Button>
      )}
      {isOpen && !selectedItem && (
        <div className="mt-1 border rounded p-2 space-y-2 bg-background" data-testid={`search-panel-${testIdPrefix}`}>
          <div className="flex items-center gap-1">
            <Input
              className="h-7 text-xs flex-1"
              placeholder="업체명/내용 검색..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              data-testid={`input-search-${testIdPrefix}`}
              autoFocus
            />
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => { setIsOpen(false); setSearchText(""); setDateFrom(""); setDateTo(""); }} data-testid={`button-close-${testIdPrefix}-search`}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <Label className="text-[10px] text-muted-foreground">기간 시작</Label>
              <Input type="date" className="h-7 text-xs" value={dateFrom} onChange={e => setDateFrom(e.target.value)} data-testid={`input-date-from-${testIdPrefix}`} />
            </div>
            <div className="flex-1">
              <Label className="text-[10px] text-muted-foreground">기간 종료</Label>
              <Input type="date" className="h-7 text-xs" value={dateTo} onChange={e => setDateTo(e.target.value)} data-testid={`input-date-to-${testIdPrefix}`} />
            </div>
          </div>
          <div className="max-h-40 overflow-y-auto border rounded">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground p-2 text-center">
                {searchText.trim() || dateFrom || dateTo ? "검색 결과가 없습니다" : "업체명 또는 기간을 입력하세요"}
              </p>
            ) : (
              filtered.map(item => (
                <div
                  key={item.id}
                  className="w-full text-left px-2 py-1.5 text-xs cursor-pointer border-b last:border-b-0 flex items-center justify-between gap-2 transition-colors hover:bg-accent"
                  onClick={() => { onSelect(item.id); setIsOpen(false); setSearchText(""); setDateFrom(""); setDateTo(""); }}
                  data-testid={`item-${testIdPrefix}-${item.id}`}
                >
                  <span className="truncate">{item.companyName} - {item.description || ""} ({formatAmount(item.amount)})</span>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">{item.plannedDate || item.actualDate || ""}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function OrderDetailModal({
  order,
  invoices,
  payments,
  onClose,
  onUpdate,
  onDelete,
}: {
  order: PurchaseOrder;
  invoices: PurchaseInvoice[];
  payments: Payment[];
  onClose: () => void;
  onUpdate: (id: string, data: Record<string, any>) => void;
  onDelete: (id: string) => void;
}) {
  const { toast } = useToast();
  const buildFormState = useCallback(() => ({
    supplyAmount: String(order.supplyAmount || ""),
    taxAmount: String(order.taxAmount || ""),
    totalAmount: String(order.totalAmount || ""),
    expectedDeliveryDate: order.expectedDeliveryDate || "",
    actualDeliveryDate: order.actualDeliveryDate || "",
    receivingCompleted: order.receivingCompleted || false,
    purchaseInvoiceId: order.purchaseInvoiceId || "",
    paymentId: order.paymentId || "",
    memo: order.memo || "",
  }), [order]);

  const [form, setForm] = useState(buildFormState);
  const [showUnsavedAlert, setShowUnsavedAlert] = useState(false);
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [showDetailFreeItem, setShowDetailFreeItem] = useState(false);
  const [detailFreeItem, setDetailFreeItem] = useState({ itemName: "", spec: "", brand: "", unitPrice: "", quantity: "1" });
  const [showDetailAdjustment, setShowDetailAdjustment] = useState(false);
  const [detailAdjustment, setDetailAdjustment] = useState({ itemName: "", amount: "" });

  useEffect(() => {
    setForm(buildFormState());
  }, [buildFormState]);

  const { data: orderItems = [], refetch: refetchItems } = useQuery<PurchaseOrderItem[]>({
    queryKey: ["/api/purchase-orders", order.id, "items"],
    queryFn: async () => {
      const res = await fetch(`/api/purchase-orders/${order.id}/items`);
      return res.json();
    },
  });

  const addItemMutation = useMutation({
    mutationFn: async (item: Record<string, any>) => {
      const res = await apiRequest("POST", `/api/purchase-orders/${order.id}/items`, item);
      return res.json();
    },
    onSuccess: () => { refetchItems(); recalcAmountsFromItems(); },
  });

  const updateItemMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, any> }) => {
      const res = await apiRequest("PATCH", `/api/purchase-order-items/${id}`, data);
      return res.json();
    },
    onSuccess: () => { refetchItems(); },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/purchase-order-items/${id}`);
    },
    onSuccess: () => { refetchItems(); recalcAmountsFromItems(); },
  });

  const recalcAmountsFromItems = useCallback(async () => {
    const res = await fetch(`/api/purchase-orders/${order.id}/items`);
    const freshItems: PurchaseOrderItem[] = await res.json();
    const supply = freshItems.reduce((s, i) => s + (i.amount || 0), 0);
    const tax = Math.round(supply * 0.1);
    const total = supply + tax;
    setForm(f => ({ ...f, supplyAmount: String(supply || ""), taxAmount: String(tax || ""), totalAmount: String(total || "") }));
  }, [order.id]);

  const handleAddItemFromSearch = (pi: PurchaseItem) => {
    addItemMutation.mutate({
      itemCode: pi.itemCode || null,
      itemName: pi.itemName,
      spec: pi.spec || null,
      brand: pi.brand || null,
      quantity: 1,
      unitPrice: pi.cost || 0,
      amount: pi.cost || 0,
      category1: pi.category1 || null,
      sortOrder: orderItems.length,
      isAdjustment: false,
    });
  };

  const handleAddDetailFreeItem = () => {
    if (!detailFreeItem.itemName.trim()) return;
    const qty = parseInt(detailFreeItem.quantity) || 1;
    const price = parseInt(detailFreeItem.unitPrice) || 0;
    addItemMutation.mutate({
      itemCode: null,
      itemName: detailFreeItem.itemName,
      spec: detailFreeItem.spec || null,
      brand: detailFreeItem.brand || null,
      quantity: qty,
      unitPrice: price,
      amount: qty * price,
      category1: null,
      sortOrder: orderItems.length,
      isAdjustment: false,
    });
    setDetailFreeItem({ itemName: "", spec: "", brand: "", unitPrice: "", quantity: "1" });
    setShowDetailFreeItem(false);
  };

  const handleAddDetailAdjustment = () => {
    if (!detailAdjustment.itemName.trim()) return;
    const amt = parseInt(detailAdjustment.amount) || 0;
    addItemMutation.mutate({
      itemCode: null,
      itemName: detailAdjustment.itemName,
      spec: null,
      brand: null,
      quantity: 1,
      unitPrice: amt,
      amount: amt,
      category1: null,
      sortOrder: orderItems.length,
      isAdjustment: true,
    });
    setDetailAdjustment({ itemName: "", amount: "" });
    setShowDetailAdjustment(false);
  };

  const handleItemFieldBlur = (item: PurchaseOrderItem, field: string, value: number) => {
    const qty = field === "quantity" ? value : item.quantity;
    const price = field === "unitPrice" ? value : item.unitPrice;
    const amount = qty * price;
    updateItemMutation.mutate({ id: item.id, data: { [field]: value, amount } }, {
      onSuccess: () => recalcAmountsFromItems(),
    });
  };

  const isDirty = useMemo(() => {
    return (
      form.supplyAmount !== String(order.supplyAmount || "") ||
      form.taxAmount !== String(order.taxAmount || "") ||
      form.totalAmount !== String(order.totalAmount || "") ||
      form.expectedDeliveryDate !== (order.expectedDeliveryDate || "") ||
      form.actualDeliveryDate !== (order.actualDeliveryDate || "") ||
      form.receivingCompleted !== (order.receivingCompleted || false) ||
      form.purchaseInvoiceId !== (order.purchaseInvoiceId || "") ||
      form.paymentId !== (order.paymentId || "") ||
      form.memo !== (order.memo || "")
    );
  }, [form, order]);

  const handleSave = () => {
    onUpdate(order.id, {
      supplyAmount: form.supplyAmount ? parseInt(form.supplyAmount) : null,
      taxAmount: form.taxAmount ? parseInt(form.taxAmount) : null,
      totalAmount: form.totalAmount ? parseInt(form.totalAmount) : null,
      expectedDeliveryDate: form.expectedDeliveryDate || null,
      actualDeliveryDate: form.actualDeliveryDate || null,
      receivingCompleted: form.receivingCompleted,
      purchaseInvoiceId: form.purchaseInvoiceId || null,
      paymentId: form.paymentId || null,
      memo: form.memo || null,
    });
  };

  const handleSupplyAmountChange = (val: string) => {
    const supply = parseInt(val) || 0;
    const tax = Math.round(supply * 0.1);
    setForm(f => ({ ...f, supplyAmount: val, taxAmount: String(tax), totalAmount: String(supply + tax) }));
  };

  const handleClose = useCallback(() => {
    if (isDirty) {
      setShowUnsavedAlert(true);
    } else {
      onClose();
    }
  }, [isDirty, onClose]);

  const expensePayments = payments.filter(p => p.type === "expense");

  const regularOrderItems = orderItems.filter(i => !i.isAdjustment);
  const adjustmentOrderItems = orderItems.filter(i => i.isAdjustment);

  return (
    <>
      <Dialog open onOpenChange={handleClose}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="modal-order-detail">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" data-testid="text-modal-title">
              <ClipboardCheck className="h-5 w-5" />
              발주 상세 - {order.orderNumber || "번호없음"}
            </DialogTitle>
            <DialogDescription className="sr-only">발주 상세 정보</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">발주번호</Label>
                <p className="text-sm font-medium" data-testid="text-detail-order-number">{order.orderNumber || "-"}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">구매처</Label>
                <p className="text-sm font-medium" data-testid="text-detail-vendor">{order.vendor || "-"}</p>
              </div>
              <div className="col-span-2">
                <Label className="text-xs text-muted-foreground">내용</Label>
                <p className="text-sm" data-testid="text-detail-description">{order.description || "-"}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">상태</Label>
                <div className="mt-1">
                  <Select value={order.status || "일반"} onValueChange={(val) => onUpdate(order.id, { status: val })}>
                    <SelectTrigger className="h-7 w-[100px] text-xs" data-testid="select-order-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="일반">일반</SelectItem>
                      <SelectItem value="수입">수입</SelectItem>
                      <SelectItem value="입고완료">입고완료</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-end gap-2">
                {order.onedriveWebUrl && (
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => window.open(order.onedriveWebUrl!, "_blank")} data-testid="button-detail-open-folder">
                    <ExternalLink className="h-3 w-3 mr-1" />폴더
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="h-7 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 ml-auto" onClick={() => setShowDeleteAlert(true)} data-testid="button-delete-order">
                  <Trash2 className="h-3 w-3 mr-1" />삭제
                </Button>
              </div>
            </div>

            <div className="border-t pt-3">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs font-medium">품목</Label>
                <div className="flex gap-1">
                  <PurchaseItemSearchPopover onSelect={handleAddItemFromSearch} />
                  <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setShowDetailFreeItem(true)} data-testid="button-detail-add-free">
                    <Plus className="h-3 w-3 mr-1" />직접 입력
                  </Button>
                  <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => setShowDetailAdjustment(true)} data-testid="button-detail-add-adjustment">
                    <Plus className="h-3 w-3 mr-1" />가격 조정
                  </Button>
                </div>
              </div>

              {showDetailFreeItem && (
                <div className="border rounded p-2 mb-2 bg-muted/20 space-y-1.5">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-[10px]">품명 *</Label>
                      <Input className="h-7 text-xs" value={detailFreeItem.itemName} onChange={e => setDetailFreeItem(f => ({ ...f, itemName: e.target.value }))} data-testid="input-detail-free-name" />
                    </div>
                    <div>
                      <Label className="text-[10px]">사양</Label>
                      <Input className="h-7 text-xs" value={detailFreeItem.spec} onChange={e => setDetailFreeItem(f => ({ ...f, spec: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="text-[10px]">브랜드</Label>
                      <Input className="h-7 text-xs" value={detailFreeItem.brand} onChange={e => setDetailFreeItem(f => ({ ...f, brand: e.target.value }))} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-[10px]">수량</Label>
                      <Input type="number" className="h-7 text-xs" value={detailFreeItem.quantity} onChange={e => setDetailFreeItem(f => ({ ...f, quantity: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="text-[10px]">단가</Label>
                      <Input type="number" className="h-7 text-xs" value={detailFreeItem.unitPrice} onChange={e => setDetailFreeItem(f => ({ ...f, unitPrice: e.target.value }))} />
                    </div>
                    <div className="flex items-end gap-1">
                      <Button size="sm" className="h-7 text-xs" onClick={handleAddDetailFreeItem} data-testid="button-detail-confirm-free">추가</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowDetailFreeItem(false)}>취소</Button>
                    </div>
                  </div>
                </div>
              )}

              {showDetailAdjustment && (
                <div className="border rounded p-2 mb-2 bg-muted/20 space-y-1.5">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <Label className="text-[10px]">항목명 *</Label>
                      <Input className="h-7 text-xs" placeholder="예: 할인, 운반비" value={detailAdjustment.itemName} onChange={e => setDetailAdjustment(f => ({ ...f, itemName: e.target.value }))} data-testid="input-detail-adj-name" />
                    </div>
                    <div>
                      <Label className="text-[10px]">금액 (- 가능)</Label>
                      <Input type="number" className="h-7 text-xs" placeholder="예: -50000" value={detailAdjustment.amount} onChange={e => setDetailAdjustment(f => ({ ...f, amount: e.target.value }))} data-testid="input-detail-adj-amount" />
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" className="h-7 text-xs" onClick={handleAddDetailAdjustment} data-testid="button-detail-confirm-adj">추가</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowDetailAdjustment(false)}>취소</Button>
                  </div>
                </div>
              )}

              {regularOrderItems.length > 0 && (
                <table className="w-full text-xs border-collapse" data-testid="table-detail-items">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left py-1 px-2 font-medium">품명</th>
                      <th className="text-left py-1 px-2 font-medium w-[100px]">사양</th>
                      <th className="text-center py-1 px-2 font-medium w-[60px]">수량</th>
                      <th className="text-right py-1 px-2 font-medium w-[90px]">단가</th>
                      <th className="text-right py-1 px-2 font-medium w-[90px]">금액</th>
                      <th className="w-[30px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {regularOrderItems.map(item => (
                      <tr key={item.id} className="border-b last:border-b-0" data-testid={`row-detail-item-${item.id}`}>
                        <td className="py-1 px-2">
                          <div className="font-medium">{item.itemName}</div>
                          {item.brand && <div className="text-[10px] text-muted-foreground">{item.brand}</div>}
                        </td>
                        <td className="py-1 px-2 text-muted-foreground">{item.spec || "-"}</td>
                        <td className="py-1 px-2 text-center">
                          <Input
                            type="number"
                            className="h-6 text-xs text-center w-14 mx-auto"
                            defaultValue={item.quantity}
                            onBlur={e => handleItemFieldBlur(item, "quantity", parseInt(e.target.value) || 0)}
                            data-testid={`input-detail-qty-${item.id}`}
                          />
                        </td>
                        <td className="py-1 px-2 text-right">
                          <Input
                            type="number"
                            className="h-6 text-xs text-right w-20 ml-auto"
                            defaultValue={item.unitPrice}
                            onBlur={e => handleItemFieldBlur(item, "unitPrice", parseInt(e.target.value) || 0)}
                            data-testid={`input-detail-price-${item.id}`}
                          />
                        </td>
                        <td className="py-1 px-2 text-right font-medium">{(item.amount || 0).toLocaleString()}</td>
                        <td className="py-1 px-1">
                          <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-red-400 hover:text-red-600" onClick={() => deleteItemMutation.mutate(item.id)} data-testid={`button-detail-remove-${item.id}`}>
                            <X className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {adjustmentOrderItems.length > 0 && (
                <div className="mt-2">
                  <Label className="text-[10px] text-muted-foreground mb-1 block">가격 조정</Label>
                  {adjustmentOrderItems.map(item => (
                    <div key={item.id} className="flex items-center justify-between py-1 px-2 border-b last:border-b-0 text-xs" data-testid={`row-detail-adj-${item.id}`}>
                      <span className="text-muted-foreground">{item.itemName}</span>
                      <div className="flex items-center gap-2">
                        <span className={`font-medium ${(item.amount || 0) < 0 ? "text-red-600" : "text-blue-600"}`}>{(item.amount || 0) > 0 ? "+" : ""}{(item.amount || 0).toLocaleString()}원</span>
                        <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-red-400 hover:text-red-600" onClick={() => deleteItemMutation.mutate(item.id)} data-testid={`button-detail-remove-adj-${item.id}`}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {orderItems.length === 0 && (
                <div className="text-center py-4 text-xs text-muted-foreground border rounded" data-testid="text-detail-empty-items">
                  등록된 품목이 없습니다
                </div>
              )}

              {orderItems.length > 0 && (
                <div className="mt-2 bg-muted/20 rounded p-2 space-y-0.5 text-xs" data-testid="panel-detail-totals">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">품목 합계 (공급가액)</span>
                    <span className="font-medium">{orderItems.reduce((s, i) => s + (i.amount || 0), 0).toLocaleString()}원</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">세액 (10%)</span>
                    <span>{Math.round(orderItems.reduce((s, i) => s + (i.amount || 0), 0) * 0.1).toLocaleString()}원</span>
                  </div>
                  <div className="flex justify-between font-bold border-t pt-1 mt-1">
                    <span>합계</span>
                    <span>{(orderItems.reduce((s, i) => s + (i.amount || 0), 0) + Math.round(orderItems.reduce((s, i) => s + (i.amount || 0), 0) * 0.1)).toLocaleString()}원</span>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t pt-3">
              <Label className="text-xs font-medium mb-2 block">상세 정보</Label>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">공급가액</Label>
                    <div className="flex items-center gap-2">
                      <Input type="number" className="h-7 text-xs flex-1" value={form.supplyAmount} onChange={e => handleSupplyAmountChange(e.target.value)} data-testid="input-supply-amount" />
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">{form.supplyAmount ? `${parseInt(form.supplyAmount).toLocaleString()}원` : ""}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px] text-muted-foreground">세액</Label>
                      <Input type="number" className="h-7 text-xs" value={form.taxAmount} onChange={e => { const tax = parseInt(e.target.value) || 0; const supply = parseInt(form.supplyAmount) || 0; setForm(f => ({ ...f, taxAmount: e.target.value, totalAmount: String(supply + tax) })); }} data-testid="input-tax-amount" />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">합계</Label>
                      <div className="flex items-center gap-1">
                        <Input type="number" className="h-7 text-xs flex-1" value={form.totalAmount} onChange={e => setForm(f => ({ ...f, totalAmount: e.target.value }))} data-testid="input-total-amount" />
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">{form.totalAmount ? `${parseInt(form.totalAmount).toLocaleString()}원` : ""}</span>
                      </div>
                    </div>
                  </div>
                </div>
                {order.onedriveFolderId && (
                  <ExcelAmountParser
                    orderId={order.id}
                    onAmountParsed={(data) => setForm(f => ({ ...f, supplyAmount: String(data.supplyAmount), taxAmount: String(data.taxAmount), totalAmount: String(data.totalAmount) }))}
                  />
                )}
                <div className="flex items-center">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.receivingCompleted}
                      onChange={e => setForm(f => ({ ...f, receivingCompleted: e.target.checked }))}
                      className="rounded"
                      data-testid="input-receiving-completed"
                    />
                    입고완료 처리
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">납품예정일</Label>
                    <Input type="date" className="h-7 text-xs" value={form.expectedDeliveryDate} onChange={e => setForm(f => ({ ...f, expectedDeliveryDate: e.target.value }))} data-testid="input-expected-date" />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">납품일</Label>
                    <Input type="date" className="h-7 text-xs" value={form.actualDeliveryDate} onChange={e => setForm(f => ({ ...f, actualDeliveryDate: e.target.value }))} data-testid="input-actual-date" />
                  </div>
                </div>
                <InvoiceSearchPicker
                  label="계산서 연결"
                  items={invoices}
                  selectedId={form.purchaseInvoiceId}
                  onSelect={id => setForm(f => ({ ...f, purchaseInvoiceId: id }))}
                  renderItem={inv => `${inv.companyName} - ${inv.item || "항목없음"} (${formatAmount(inv.totalAmount)})`}
                  renderSelected={inv => (
                    <span className="text-xs">{inv.companyName} - {inv.item || "항목없음"} ({formatAmount(inv.totalAmount)}) {inv.issueDate || ""}</span>
                  )}
                  getCompanyName={inv => inv.companyName || ""}
                  getDate={inv => inv.issueDate || ""}
                  defaultSearch={order.vendor || ""}
                  testIdPrefix="invoice"
                />
                <PaymentSearchPicker
                  label="송금 연결"
                  items={expensePayments}
                  selectedId={form.paymentId}
                  onSelect={id => setForm(f => ({ ...f, paymentId: id }))}
                  renderSelected={p => (
                    <span className="text-xs">{p.companyName} - {p.description || ""} ({formatAmount(p.amount)}) {p.plannedDate || ""}</span>
                  )}
                  defaultSearch={order.vendor || ""}
                  testIdPrefix="payment"
                />
                <div>
                  <Label className="text-[10px] text-muted-foreground">메모</Label>
                  <Input className="h-7 text-xs" value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} data-testid="input-memo" />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t">
              <Button size="sm" onClick={handleSave} disabled={!isDirty} data-testid="button-save-detail">
                <Save className="h-4 w-4 mr-1" />저장
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showUnsavedAlert} onOpenChange={setShowUnsavedAlert}>
        <AlertDialogContent data-testid="alert-unsaved-changes">
          <AlertDialogHeader>
            <AlertDialogTitle>변경사항이 저장되지 않았습니다</AlertDialogTitle>
            <AlertDialogDescription>
              저장하지 않고 닫으면 변경한 내용이 사라집니다. 닫으시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-close">계속 편집</AlertDialogCancel>
            <AlertDialogAction onClick={onClose} data-testid="button-confirm-close">닫기</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>발주 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              "{order.orderNumber} {order.vendor}" 발주를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">취소</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => onDelete(order.id)} data-testid="button-confirm-delete">
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
