import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link2, Unlink2, FileText, Package, Check, Clock, AlertCircle, ChevronRight, X } from "lucide-react";
import type { Vendor, PurchaseOrder, PurchaseInvoice, Payment } from "@shared/schema";

type LinkedInvoice = PurchaseInvoice & { payments: Payment[] };
type OrderWithLinks = PurchaseOrder & { linkedInvoices: LinkedInvoice[] };
type InvoiceWithPayments = PurchaseInvoice & { payments: Payment[] };

type LedgerData = {
  vendor: Vendor;
  orders: OrderWithLinks[];
  unlinkedInvoices: InvoiceWithPayments[];
  summary: {
    orderTotal: number;
    invoiceTotal: number;
    paidTotal: number;
    plannedTotal: number;
    diff: number;
  };
  links: { purchaseOrderId: string; purchaseInvoiceId: string }[];
};

function fmt(n: number | null | undefined) {
  if (!n && n !== 0) return "-";
  return n.toLocaleString() + "원";
}

function PayBadge({ payments }: { payments: Payment[] }) {
  if (!payments || payments.length === 0)
    return <Badge variant="outline" className="text-xs text-muted-foreground">미지급</Badge>;
  const completed = payments.filter(p => p.status === "completed");
  const planned = payments.filter(p => p.status !== "completed");
  if (completed.length > 0 && planned.length === 0)
    return <Badge className="bg-green-100 text-green-700 border-0 text-xs"><Check className="h-3 w-3 mr-1" />지급완료</Badge>;
  if (completed.length > 0)
    return <Badge className="bg-yellow-100 text-yellow-700 border-0 text-xs"><Clock className="h-3 w-3 mr-1" />부분지급</Badge>;
  return <Badge className="bg-blue-100 text-blue-700 border-0 text-xs"><Clock className="h-3 w-3 mr-1" />지급예정</Badge>;
}

const MONTHS = ["전체", "1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];

export default function VendorLedger() {
  const { toast } = useToast();
  const currentYear = new Date().getFullYear();
  const [vendorId, setVendorId] = useState<string>("");
  const [year, setYear] = useState<number | null>(currentYear);
  const [month, setMonth] = useState(0);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);

  const { data: vendors = [] } = useQuery<Vendor[]>({
    queryKey: ["/api/vendors"],
  });

  const { data: ledger, isLoading } = useQuery<LedgerData>({
    queryKey: ["/api/vendors", vendorId, "ledger", year],
    queryFn: async () => {
      const url = year
        ? `/api/vendors/${vendorId}/ledger?year=${year}`
        : `/api/vendors/${vendorId}/ledger`;
      const res = await apiRequest("GET", url);
      return res.json();
    },
    enabled: !!vendorId,
  });

  const linkMutation = useMutation({
    mutationFn: async ({ orderId, invoiceId }: { orderId: string; invoiceId: string }) => {
      const res = await apiRequest("POST", `/api/purchase-orders/${orderId}/link-invoice/${invoiceId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors", vendorId, "ledger", year] });
      setSelectedOrderId(null);
      setSelectedInvoiceId(null);
      toast({ title: "연결 완료", description: "발주서와 계산서가 연결되었습니다." });
    },
    onError: (e: Error) => toast({ title: "연결 실패", description: e.message, variant: "destructive" }),
  });

  const unlinkMutation = useMutation({
    mutationFn: async ({ orderId, invoiceId }: { orderId: string; invoiceId: string }) => {
      const res = await apiRequest("DELETE", `/api/purchase-orders/${orderId}/link-invoice/${invoiceId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors", vendorId, "ledger", year] });
      toast({ title: "연결 해제 완료" });
    },
    onError: (e: Error) => toast({ title: "연결 해제 실패", description: e.message, variant: "destructive" }),
  });

  const filteredOrders = useMemo(() => {
    if (!ledger) return [];
    if (month === 0) return ledger.orders;
    return ledger.orders.filter(o => {
      const d = o.expectedDeliveryDate || "";
      if (!d) return false;
      return new Date(d).getMonth() + 1 === month;
    });
  }, [ledger, month]);

  const filteredUnlinkedInvoices = useMemo(() => {
    if (!ledger) return [];
    if (month === 0) return ledger.unlinkedInvoices;
    return ledger.unlinkedInvoices.filter(inv => {
      const d = inv.issueDate || inv.writeDate || "";
      if (!d) return false;
      return new Date(d).getMonth() + 1 === month;
    });
  }, [ledger, month]);

  const unlinkedOrders = useMemo(
    () => filteredOrders.filter(o => o.linkedInvoices.length === 0),
    [filteredOrders]
  );
  const linkedOrders = useMemo(
    () => filteredOrders.filter(o => o.linkedInvoices.length > 0),
    [filteredOrders]
  );

  const years = Array.from({ length: 5 }, (_, i) => currentYear - i + 1);
  const isReadyToLink = !!selectedOrderId && !!selectedInvoiceId;

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 필터 + 요약 */}
      <div className="flex items-center gap-3 p-3 border-b bg-background flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">업체</span>
          <Select value={vendorId} onValueChange={setVendorId}>
            <SelectTrigger className="w-44 h-8 text-sm" data-testid="select-vendor">
              <SelectValue placeholder="업체 선택..." />
            </SelectTrigger>
            <SelectContent>
              {vendors.map(v => (
                <SelectItem key={v.id} value={v.id}>{v.companyName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">연도</span>
          <Select value={year === null ? "all" : String(year)} onValueChange={v => setYear(v === "all" ? null : Number(v))}>
            <SelectTrigger className="w-24 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              {years.map(y => <SelectItem key={y} value={String(y)}>{y}년</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">월</span>
          <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
            <SelectTrigger className="w-20 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {ledger && (
          <div className="ml-auto flex items-center divide-x text-sm border rounded-md overflow-hidden">
            <div className="text-center px-3 py-1.5">
              <div className="text-xs text-muted-foreground leading-none mb-0.5">발주 총액</div>
              <div className="font-semibold leading-none">{fmt(ledger.summary.orderTotal)}</div>
            </div>
            <div className="text-center px-3 py-1.5">
              <div className="text-xs text-muted-foreground leading-none mb-0.5">계산서 총액</div>
              <div className="font-semibold leading-none">{fmt(ledger.summary.invoiceTotal)}</div>
            </div>
            <div className="text-center px-3 py-1.5">
              <div className="text-xs text-muted-foreground leading-none mb-0.5">지급완료</div>
              <div className="font-semibold text-green-600 leading-none">{fmt(ledger.summary.paidTotal)}</div>
            </div>
            <div className="text-center px-3 py-1.5">
              <div className="text-xs text-muted-foreground leading-none mb-0.5">미지급</div>
              <div className={`font-semibold leading-none ${ledger.summary.diff > 0 ? "text-red-500" : "text-muted-foreground"}`}>
                {fmt(ledger.summary.diff)}
              </div>
            </div>
          </div>
        )}
      </div>

      {!vendorId ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground flex-col gap-2">
          <FileText className="h-10 w-10 opacity-30" />
          <p className="text-sm">업체를 선택하면 거래원장이 표시됩니다.</p>
        </div>
      ) : isLoading ? (
        <div className="p-6 space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : (
        <Tabs defaultValue="unmatched" className="flex-1 flex flex-col overflow-hidden">
          <div className="px-4 pt-2 border-b">
            <TabsList>
              <TabsTrigger value="unmatched" data-testid="tab-unmatched">
                미매칭
                {(unlinkedOrders.length > 0 || filteredUnlinkedInvoices.length > 0) && (
                  <Badge className="ml-1.5 bg-red-500 text-white text-xs px-1.5 py-0 h-4 rounded-full border-0">
                    {unlinkedOrders.length + filteredUnlinkedInvoices.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="matched" data-testid="tab-matched">
                연결됨 ({linkedOrders.length})
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ── 미매칭 탭 ── */}
          <TabsContent value="unmatched" className="flex-1 overflow-hidden m-0 flex flex-col">
            {isReadyToLink && (
              <div className="flex items-center justify-between px-4 py-2 bg-blue-50 dark:bg-blue-950/30 border-b text-sm shrink-0">
                <span className="text-blue-700 dark:text-blue-300 font-medium">
                  발주서와 계산서가 선택되었습니다. 연결하시겠습니까?
                </span>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => linkMutation.mutate({ orderId: selectedOrderId!, invoiceId: selectedInvoiceId! })} disabled={linkMutation.isPending} className="h-7 text-xs">
                    <Link2 className="h-3 w-3 mr-1" />연결
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setSelectedOrderId(null); setSelectedInvoiceId(null); }}>
                    <X className="h-3 w-3" />취소
                  </Button>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 flex-1 overflow-hidden divide-x">
              {/* 왼쪽: 미매칭 발주서 */}
              <div className="flex flex-col overflow-hidden">
                <div className="px-4 py-2 bg-muted/30 border-b flex items-center gap-2 shrink-0">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">미매칭 발주서</span>
                  <Badge variant="secondary" className="text-xs">{unlinkedOrders.length}건</Badge>
                  <span className="ml-auto text-xs text-muted-foreground">클릭 → 선택</span>
                </div>
                <div className="flex-1 overflow-y-auto divide-y">
                  {unlinkedOrders.length === 0 ? (
                    <div className="flex items-center justify-center h-32 text-muted-foreground text-sm flex-col gap-1">
                      <Check className="h-6 w-6 opacity-40" />
                      <span>미매칭 발주서 없음</span>
                    </div>
                  ) : (
                    unlinkedOrders.map(o => (
                      <div
                        key={o.id}
                        className={`px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors ${selectedOrderId === o.id ? "bg-blue-50 dark:bg-blue-950/30 border-l-2 border-l-blue-500" : ""}`}
                        onClick={() => setSelectedOrderId(selectedOrderId === o.id ? null : o.id)}
                        data-testid={`order-row-${o.id}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono text-muted-foreground">{o.orderNumber}</span>
                              {o.receivingCompleted && <Badge className="bg-green-100 text-green-700 border-0 text-xs py-0 h-4">입고완료</Badge>}
                            </div>
                            <div className="text-sm font-medium mt-0.5 truncate">{o.description || "품목 미입력"}</div>
                            {o.expectedDeliveryDate && (
                              <div className="text-xs text-muted-foreground mt-0.5">납기: {o.expectedDeliveryDate}</div>
                            )}
                          </div>
                          <div className="text-sm font-semibold shrink-0">{fmt(o.totalAmount)}</div>
                        </div>
                        {selectedOrderId === o.id && (
                          <div className="mt-1.5 text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
                            <ChevronRight className="h-3 w-3" />오른쪽 계산서를 클릭하여 연결
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* 오른쪽: 미매칭 계산서 */}
              <div className="flex flex-col overflow-hidden">
                <div className="px-4 py-2 bg-muted/30 border-b flex items-center gap-2 shrink-0">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">미매칭 계산서</span>
                  <Badge variant="secondary" className="text-xs">{filteredUnlinkedInvoices.length}건</Badge>
                  <span className="ml-auto text-xs text-muted-foreground">클릭 → 선택</span>
                </div>
                <div className="flex-1 overflow-y-auto divide-y">
                  {filteredUnlinkedInvoices.length === 0 ? (
                    <div className="flex items-center justify-center h-32 text-muted-foreground text-sm flex-col gap-1">
                      <Check className="h-6 w-6 opacity-40" />
                      <span>미매칭 계산서 없음</span>
                    </div>
                  ) : (
                    filteredUnlinkedInvoices.map(inv => (
                      <div
                        key={inv.id}
                        className={`px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors ${selectedInvoiceId === inv.id ? "bg-blue-50 dark:bg-blue-950/30 border-l-2 border-l-blue-500" : ""}`}
                        onClick={() => setSelectedInvoiceId(selectedInvoiceId === inv.id ? null : inv.id)}
                        data-testid={`invoice-row-${inv.id}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono text-muted-foreground">{inv.invoiceNumber || "번호없음"}</span>
                              <PayBadge payments={inv.payments} />
                            </div>
                            <div className="text-sm font-medium mt-0.5 truncate">{inv.item || "품목 미입력"}</div>
                            {inv.issueDate && (
                              <div className="text-xs text-muted-foreground mt-0.5">발행: {inv.issueDate}</div>
                            )}
                          </div>
                          <div className="text-sm font-semibold shrink-0">{fmt(inv.totalAmount)}</div>
                        </div>
                        {selectedInvoiceId === inv.id && !selectedOrderId && (
                          <div className="mt-1.5 text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
                            <ChevronRight className="h-3 w-3" />왼쪽 발주서를 클릭하여 연결
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ── 연결됨 탭 ── */}
          <TabsContent value="matched" className="flex-1 overflow-y-auto m-0 p-4 space-y-3">
            {linkedOrders.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-sm flex-col gap-1">
                <AlertCircle className="h-6 w-6 opacity-40" />
                <span>연결된 항목이 없습니다</span>
              </div>
            ) : (
              linkedOrders.map(o => (
                <div key={o.id} className="border rounded-lg overflow-hidden">
                  <div className="px-4 py-3 bg-muted/20 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-muted-foreground">{o.orderNumber}</span>
                          {o.receivingCompleted && <Badge className="bg-green-100 text-green-700 border-0 text-xs py-0 h-4">입고완료</Badge>}
                        </div>
                        <div className="text-sm font-medium truncate">{o.description || "품목 미입력"}</div>
                        {o.expectedDeliveryDate && (
                          <div className="text-xs text-muted-foreground">납기: {o.expectedDeliveryDate}</div>
                        )}
                      </div>
                    </div>
                    <div className="text-sm font-semibold shrink-0">{fmt(o.totalAmount)}</div>
                  </div>

                  {o.linkedInvoices.map(inv => (
                    <div key={inv.id} className="border-t px-4 py-3 pl-12 flex items-center justify-between gap-2 bg-background">
                      <div className="flex items-center gap-3 min-w-0">
                        <Link2 className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-mono text-muted-foreground">{inv.invoiceNumber || "번호없음"}</span>
                            <PayBadge payments={inv.payments} />
                          </div>
                          <div className="text-xs text-muted-foreground truncate">{inv.item || inv.companyName || ""}</div>
                          {inv.issueDate && <div className="text-xs text-muted-foreground">발행: {inv.issueDate}</div>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-semibold">{fmt(inv.totalAmount)}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          onClick={() => unlinkMutation.mutate({ orderId: o.id, invoiceId: inv.id })}
                          disabled={unlinkMutation.isPending}
                          title="연결 해제"
                          data-testid={`unlink-${o.id}-${inv.id}`}
                        >
                          <Unlink2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
