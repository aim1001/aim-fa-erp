import { useQuery, useMutation } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ClipboardCheck, Search, RefreshCw, ExternalLink, Check, Package, Ship, Truck, Pencil, X, Save, FileText, Wallet, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { PurchaseOrder, PurchaseInvoice, Payment } from "@shared/schema";
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders", selectedYear] });
      toast({ title: "저장되었습니다" });
    },
    onError: (err: Error) => {
      toast({ title: "저장 실패", description: err.message, variant: "destructive" });
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
                      {formatAmount(order.amount)}
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

      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          invoices={invoices || []}
          payments={payments || []}
          onClose={() => setSelectedOrder(null)}
          onUpdate={(id, data) => updateMutation.mutate({ id, data })}
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

function ExcelAmountParser({ orderId, onAmountParsed }: { orderId: string; onAmountParsed: (amount: number) => void }) {
  const { toast } = useToast();
  const [showFiles, setShowFiles] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState("");
  const [parsedResult, setParsedResult] = useState<{ supplyAmount: number; vat: number; totalAmount: number } | null>(null);

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

  if (!showFiles) {
    return (
      <Button variant="outline" size="sm" className="h-7 text-xs w-full" onClick={() => setShowFiles(true)} data-testid="button-excel-read">
        <Download className="h-3 w-3 mr-1" />엑셀에서 금액 읽기
      </Button>
    );
  }

  return (
    <div className="border rounded p-2 space-y-2 bg-muted/20" data-testid="panel-excel-parser">
      <div className="flex items-center justify-between">
        <Label className="text-[10px] font-medium">엑셀 파일 선택</Label>
        <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1" onClick={() => { setShowFiles(false); setParsedResult(null); setSelectedFileId(""); }} data-testid="button-close-excel-panel">
          <X className="h-3 w-3" />
        </Button>
      </div>
      {filesLoading ? (
        <Skeleton className="h-7 w-full" />
      ) : excelFiles.length === 0 ? (
        <p className="text-[10px] text-muted-foreground">엑셀 파일이 없습니다</p>
      ) : (
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
          {selectedFileId && (
            <Button
              variant="default"
              size="sm"
              className="h-7 text-xs w-full"
              onClick={() => parseMutation.mutate(selectedFileId)}
              disabled={parseMutation.isPending}
              data-testid="button-parse-amount"
            >
              {parseMutation.isPending ? "읽는 중..." : "금액 가져오기"}
            </Button>
          )}
          {parsedResult && (
            <div className="space-y-1 border-t pt-2" data-testid="panel-parsed-result">
              <div className="grid grid-cols-3 gap-1 text-[10px]">
                <div>
                  <span className="text-muted-foreground">공급가액</span>
                  <p className="font-medium">{parsedResult.supplyAmount.toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">VAT</span>
                  <p className="font-medium">{parsedResult.vat.toLocaleString()}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">합계</span>
                  <p className="font-medium">{parsedResult.totalAmount.toLocaleString()}</p>
                </div>
              </div>
              <div className="flex gap-1">
                <Button size="sm" className="h-6 text-[10px] flex-1" onClick={() => { onAmountParsed(parsedResult.supplyAmount); setParsedResult(null); setShowFiles(false); }} data-testid="button-apply-supply">
                  공급가액 적용
                </Button>
                <Button size="sm" className="h-6 text-[10px] flex-1" onClick={() => { onAmountParsed(parsedResult.totalAmount); setParsedResult(null); setShowFiles(false); }} data-testid="button-apply-total">
                  합계 적용
                </Button>
              </div>
            </div>
          )}
        </>
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
}: {
  order: PurchaseOrder;
  invoices: PurchaseInvoice[];
  payments: Payment[];
  onClose: () => void;
  onUpdate: (id: string, data: Record<string, any>) => void;
}) {
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({
    amount: String(order.amount || ""),
    expectedDeliveryDate: order.expectedDeliveryDate || "",
    actualDeliveryDate: order.actualDeliveryDate || "",
    receivingCompleted: order.receivingCompleted || false,
    purchaseInvoiceId: order.purchaseInvoiceId || "",
    paymentId: order.paymentId || "",
    memo: order.memo || "",
  });

  const handleSave = () => {
    onUpdate(order.id, {
      amount: form.amount ? parseInt(form.amount) : null,
      expectedDeliveryDate: form.expectedDeliveryDate || null,
      actualDeliveryDate: form.actualDeliveryDate || null,
      receivingCompleted: form.receivingCompleted,
      purchaseInvoiceId: form.purchaseInvoiceId || null,
      paymentId: form.paymentId || null,
      memo: form.memo || null,
    });
    setEditMode(false);
  };

  const expensePayments = payments.filter(p => p.type === "expense");
  const linkedInvoice = invoices.find(inv => inv.id === order.purchaseInvoiceId);
  const linkedPayment = payments.find(p => p.id === order.paymentId);

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg" data-testid="modal-order-detail">
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
              <div className="mt-1"><StatusBadge status={order.status || "일반"} /></div>
            </div>
            {order.onedriveWebUrl && (
              <div>
                <Label className="text-xs text-muted-foreground">OneDrive</Label>
                <div className="mt-1">
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => window.open(order.onedriveWebUrl!, "_blank")} data-testid="button-detail-open-folder">
                    <ExternalLink className="h-3 w-3 mr-1" />폴더 열기
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="border-t pt-3">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs font-medium">상세 정보</Label>
              {!editMode ? (
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setEditMode(true)} data-testid="button-edit-detail">
                  <Pencil className="h-3 w-3 mr-1" />수정
                </Button>
              ) : (
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setEditMode(false)} data-testid="button-cancel-detail">
                    <X className="h-3 w-3 mr-1" />취소
                  </Button>
                  <Button size="sm" className="h-6 text-xs" onClick={handleSave} data-testid="button-save-detail">
                    <Save className="h-3 w-3 mr-1" />저장
                  </Button>
                </div>
              )}
            </div>

            {editMode ? (
              <div className="space-y-3">
                <div>
                  <Label className="text-[10px] text-muted-foreground">금액</Label>
                  <div className="flex items-center gap-2">
                    <Input type="number" className="h-7 text-xs flex-1" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} data-testid="input-amount" />
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">{form.amount ? `${parseInt(form.amount).toLocaleString()}원` : ""}</span>
                  </div>
                </div>
                {order.onedriveFolderId && (
                  <ExcelAmountParser
                    orderId={order.id}
                    onAmountParsed={(amount) => setForm(f => ({ ...f, amount: String(amount) }))}
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
                <div>
                  <Label className="text-[10px] text-muted-foreground">계산서 연결</Label>
                  <Select value={form.purchaseInvoiceId || "none"} onValueChange={v => setForm(f => ({ ...f, purchaseInvoiceId: v === "none" ? "" : v }))}>
                    <SelectTrigger className="h-7 text-xs" data-testid="select-invoice">
                      <SelectValue placeholder="선택 안함" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">선택 안함</SelectItem>
                      {invoices.map(inv => (
                        <SelectItem key={inv.id} value={inv.id}>
                          {inv.companyName} - {inv.item} ({formatAmount(inv.totalAmount)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">송금 연결</Label>
                  <Select value={form.paymentId || "none"} onValueChange={v => setForm(f => ({ ...f, paymentId: v === "none" ? "" : v }))}>
                    <SelectTrigger className="h-7 text-xs" data-testid="select-payment">
                      <SelectValue placeholder="선택 안함" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">선택 안함</SelectItem>
                      {expensePayments.map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.companyName} - {p.description} ({formatAmount(p.amount)}) {p.plannedDate || ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">메모</Label>
                  <Input className="h-7 text-xs" value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} data-testid="input-memo" />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <Label className="text-[10px] text-muted-foreground">금액</Label>
                  <p className="font-medium" data-testid="text-detail-amount">{formatAmount(order.amount)}</p>
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">입고</Label>
                  <p data-testid="text-detail-receiving">{order.receivingCompleted ? "✓ 완료" : "대기"}</p>
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">납품예정일</Label>
                  <p data-testid="text-detail-expected-date">{order.expectedDeliveryDate || "-"}</p>
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">납품일</Label>
                  <p data-testid="text-detail-actual-date">{order.actualDeliveryDate || "-"}</p>
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">계산서</Label>
                  <p data-testid="text-detail-invoice">{linkedInvoice ? `${linkedInvoice.companyName} - ${linkedInvoice.item}` : "-"}</p>
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">송금</Label>
                  <p data-testid="text-detail-payment">{linkedPayment ? `${linkedPayment.companyName} ${formatAmount(linkedPayment.amount)}` : "-"}</p>
                </div>
                {order.memo && (
                  <div className="col-span-2">
                    <Label className="text-[10px] text-muted-foreground">메모</Label>
                    <p data-testid="text-detail-memo">{order.memo}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
