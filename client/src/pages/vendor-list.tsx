import { useQuery, useMutation } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Building2, Plus, Search, Trash2, Star, RefreshCw, Link2, AlertCircle, CheckCircle2, Clock, BookOpen } from "lucide-react";
import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Vendor } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DocumentUploadSection } from "@/components/document-upload-section";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

function VendorLedger({ vendorId }: { vendorId: string }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const { toast } = useToast();

  const { data, isLoading, refetch } = useQuery<any>({
    queryKey: ["/api/vendors", vendorId, "ledger", year],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/vendors/${vendorId}/ledger?year=${year}`);
      return res.json();
    },
  });

  const linkMutation = useMutation({
    mutationFn: async ({ orderId, invoiceId }: { orderId: string; invoiceId: string }) => {
      const res = await apiRequest("POST", `/api/purchase-orders/${orderId}/link-invoice/${invoiceId}`, {});
      return res.json();
    },
    onSuccess: () => { toast({ title: "연결 완료" }); refetch(); },
    onError: (err: Error) => toast({ title: "연결 실패", description: err.message, variant: "destructive" }),
  });

  const unlinkMutation = useMutation({
    mutationFn: async ({ orderId, invoiceId }: { orderId: string; invoiceId: string }) => {
      await apiRequest("DELETE", `/api/purchase-orders/${orderId}/link-invoice/${invoiceId}`);
    },
    onSuccess: () => { toast({ title: "연결 해제 완료" }); refetch(); },
    onError: (err: Error) => toast({ title: "연결 해제 실패", description: err.message, variant: "destructive" }),
  });

  const fmtMoney = (n: number) => n?.toLocaleString("ko-KR") + "원";

  if (isLoading) return <div className="py-8 text-center text-muted-foreground text-sm">로딩 중...</div>;
  if (!data) return null;

  const { orders, unlinkedInvoices, summary } = data;
  const currentYear = new Date().getFullYear();
  const years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];

  return (
    <div className="space-y-4">
      {/* 연도 선택 */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">기간</span>
        {years.map(y => (
          <Button key={y} size="sm" variant={year === y ? "default" : "ghost"} className="h-7 text-xs" onClick={() => setYear(y)}>{y}년</Button>
        ))}
      </div>

      {/* 요약 */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "발주 총액", value: summary.orderTotal, color: "text-blue-600" },
          { label: "계산서 총액", value: summary.invoiceTotal, color: "text-purple-600" },
          { label: "지급 완료", value: summary.paidTotal, color: "text-green-600" },
          { label: "미지급", value: summary.invoiceTotal - summary.paidTotal, color: "text-red-600" },
        ].map(s => (
          <div key={s.label} className="border rounded-lg p-2 text-center">
            <div className="text-xs text-muted-foreground">{s.label}</div>
            <div className={`text-sm font-semibold ${s.color}`}>{fmtMoney(s.value)}</div>
          </div>
        ))}
      </div>

      {/* 발주서 목록 */}
      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground">발주서 ({orders.length}건)</div>
        {orders.length === 0 && <div className="text-center py-4 text-muted-foreground text-sm">발주서 없음</div>}
        {orders.map((order: any) => (
          <div key={order.id} className="border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-muted-foreground">{order.orderNumber}</span>
                <span className="text-sm font-medium truncate max-w-[200px]">{order.description || "-"}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{fmtMoney(order.totalAmount || 0)}</span>
                {order.linkedInvoices?.length > 0
                  ? <Badge variant="outline" className="text-xs text-green-600 border-green-300">계산서 {order.linkedInvoices.length}건</Badge>
                  : <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">계산서 미연결</Badge>
                }
              </div>
            </div>
            {/* 연결된 계산서 */}
            {order.linkedInvoices?.map((inv: any) => (
              <div key={inv.id} className="ml-4 pl-3 border-l-2 border-purple-200 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-purple-700">📄 계산서 {inv.invoiceNumber || "-"} · {fmtMoney(inv.totalAmount || 0)}</span>
                  <button onClick={() => unlinkMutation.mutate({ orderId: order.id, invoiceId: inv.id })} className="text-muted-foreground hover:text-red-500 text-[10px]">연결해제</button>
                </div>
                {inv.payments?.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between text-[11px] text-muted-foreground pl-2">
                    <span className="flex items-center gap-1">
                      {p.status === "completed" ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <Clock className="h-3 w-3 text-orange-400" />}
                      {p.status === "completed" ? "지급완료" : "지급예정"} {p.plannedDate}
                    </span>
                    <span>{fmtMoney(p.amount || 0)}</span>
                  </div>
                ))}
              </div>
            ))}
            {/* 미연결 계산서 연결 버튼 */}
            {order.linkedInvoices?.length === 0 && unlinkedInvoices?.length > 0 && (
              <div className="ml-4 pl-3 border-l-2 border-dashed border-muted">
                <Select onValueChange={invId => linkMutation.mutate({ orderId: order.id, invoiceId: invId })}>
                  <SelectTrigger className="h-6 text-xs w-48">
                    <SelectValue placeholder="계산서 연결..." />
                  </SelectTrigger>
                  <SelectContent>
                    {unlinkedInvoices.map((inv: any) => (
                      <SelectItem key={inv.id} value={inv.id}>
                        {inv.invoiceNumber || "번호없음"} · {fmtMoney(inv.totalAmount || 0)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 미연결 계산서 */}
      {unlinkedInvoices?.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-orange-600 flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5" />
            발주서 미연결 계산서 ({unlinkedInvoices.length}건)
          </div>
          {unlinkedInvoices.map((inv: any) => (
            <div key={inv.id} className="border border-orange-200 rounded-lg p-3 bg-orange-50/50 dark:bg-orange-950/10">
              <div className="flex items-center justify-between text-sm">
                <span>📄 {inv.invoiceNumber || "번호없음"} · {inv.companyName}</span>
                <span className="font-semibold">{fmtMoney(inv.totalAmount || 0)}</span>
              </div>
              {inv.payments?.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between text-xs text-muted-foreground mt-1 pl-2">
                  <span className="flex items-center gap-1">
                    {p.status === "completed" ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <Clock className="h-3 w-3 text-orange-400" />}
                    {p.status === "completed" ? "지급완료" : "지급예정"} {p.plannedDate}
                  </span>
                  <span>{fmtMoney(p.amount || 0)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const PO_PAYMENT_TERM_OPTIONS = [
  { value: "", label: "미설정" },
  { value: "입고후 익월말", label: "입고후 익월말" },
  { value: "입고후 월말", label: "입고후 월말" },
  { value: "입고후 2주이내", label: "입고후 2주이내" },
  { value: "선처리", label: "선처리" },
];

function VendorDetailModal({ vendorId, onClose }: { vendorId: string; onClose: () => void }) {
  const { toast } = useToast();
  const { data: vendor } = useQuery<Vendor>({
    queryKey: ["/api/vendors", vendorId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/vendors/${vendorId}`);
      return res.json();
    },
    enabled: !!vendorId,
  });

  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const updateMutation = useMutation({
    mutationFn: async (patch: Record<string, any>) => {
      const res = await apiRequest("PATCH", `/api/vendors/${vendorId}`, patch);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendors-with-stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendors", vendorId] });
    },
    onError: (err: Error) => {
      toast({ title: "저장 실패", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/vendors/${vendorId}`);
    },
    onSuccess: () => {
      toast({ title: "삭제 완료" });
      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendors-with-stats"] });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "삭제 실패", description: err.message, variant: "destructive" });
    },
  });

  const handleSave = (field: string) => {
    if (vendor && editValue !== ((vendor as any)[field] || "")) {
      updateMutation.mutate({ [field]: editValue || null });
    }
    setEditing(null);
  };

  const renderField = (label: string, field: string, value: string) => (
    <>
      <span className="text-muted-foreground">{label}</span>
      {editing === field ? (
        <Input
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          className="h-7 text-sm"
          autoFocus
          onKeyDown={e => {
            if (e.key === "Enter") handleSave(field);
            if (e.key === "Escape") setEditing(null);
          }}
          onBlur={() => handleSave(field)}
          data-testid={`input-vendor-${field}`}
        />
      ) : (
        <span
          className="cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 min-h-[1.5rem] inline-block"
          onClick={() => { setEditing(field); setEditValue(value); }}
          data-testid={`text-vendor-${field}`}
        >
          {value || <span className="text-muted-foreground">클릭하여 입력</span>}
        </span>
      )}
    </>
  );

  if (!vendor) {
    return (
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <div className="p-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-48 mt-4" /></div>
      </DialogContent>
    );
  }

  return (
    <>
    <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="modal-vendor-detail">
      <DialogHeader>
        <div className="flex items-center justify-between pr-8">
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            {vendor.companyName}
          </DialogTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(`/vendor-ledger?vendorId=${vendorId}`, "_blank")}
              data-testid="button-vendor-ledger"
            >
              <BookOpen className="h-4 w-4" />
              <span>거래처 원장</span>
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleteMutation.isPending}
              data-testid="button-delete-vendor"
            >
              <Trash2 className="h-4 w-4" />
              <span>삭제</span>
            </Button>
          </div>
        </div>
      </DialogHeader>

        <div className="space-y-4 mt-3">
          <p className="text-xs text-muted-foreground">각 항목을 클릭하면 바로 수정할 수 있습니다</p>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">업체 정보</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-[120px_1fr] gap-y-2 gap-x-2 text-sm items-center">
                {renderField("상호명", "companyName", vendor.companyName)}
                {renderField("사업자번호", "businessNumber", vendor.businessNumber || "")}
                <span className="text-muted-foreground text-sm">사업자 구분</span>
                <div className="flex items-center gap-2">
                  <Select value={(vendor as any).businessType || "none"} onValueChange={v => updateMutation.mutate({ businessType: v === "none" ? null : v })}>
                    <SelectTrigger className="h-8 text-sm w-32"><SelectValue placeholder="미설정" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">미설정</SelectItem>
                      <SelectItem value="개인">개인사업자</SelectItem>
                      <SelectItem value="법인">법인사업자</SelectItem>
                    </SelectContent>
                  </Select>
                  {(vendor as any).businessType && (
                    <Badge variant="outline" className={`text-xs ${(vendor as any).businessType === "개인" ? "text-blue-600 border-blue-300" : "text-purple-600 border-purple-300"}`}>
                      {(vendor as any).businessType === "개인" ? "개인사업자 · 대표자명으로 은행 매칭" : "법인 · 업체명으로 은행 매칭"}
                    </Badge>
                  )}
                </div>
                {renderField("대표자", "representative", vendor.representative || "")}
                {renderField("주소", "address", vendor.address || "")}
                {renderField("전화번호", "phone", vendor.phone || "")}
                {renderField("팩스", "fax", vendor.fax || "")}
                {renderField("거래은행", "bankName", vendor.bankName || "")}
                {renderField("계좌번호", "bankAccount", vendor.bankAccount || "")}
                {renderField("메모", "memo", vendor.memo || "")}
                <span className="text-muted-foreground text-sm">기본 결제조건</span>
                <Select value={vendor.defaultPaymentTerms || "none"} onValueChange={v => updateMutation.mutate({ defaultPaymentTerms: v === "none" ? null : v })}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PO_PAYMENT_TERM_OPTIONS.map(opt => (
                      <SelectItem key={opt.value || "none"} value={opt.value || "none"}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">담당자 정보</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-[120px_1fr] gap-y-2 gap-x-2 text-sm items-center">
                {renderField("담당자명", "contactName", vendor.contactName || "")}
                {renderField("이메일", "contactEmail", vendor.contactEmail || "")}
                {renderField("전화번호", "contactPhone", vendor.contactPhone || "")}
              </div>
            </CardContent>
          </Card>
          <DocumentUploadSection entityId={vendorId} apiBase="/api/vendors"
            docTypes={[{ type: "사업자등록증", label: "사업자등록증 (PDF/이미지)" }, { type: "통장사본", label: "통장사본 (PDF/이미지)" }]}
            title="구매처 문서" folderHint="4.경영지원/database/구매처/[업체명]/" />
        </div>
    </DialogContent>

    <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>공급업체 삭제</AlertDialogTitle>
          <AlertDialogDescription>
            <strong>{vendor?.companyName}</strong>을(를) 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>취소</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => deleteMutation.mutate()}
          >
            삭제
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

type VendorWithStats = Vendor & { lastTransactionDate: string | null; invoiceCount: number; orderCount: number; isRecurring: boolean; plannedAmount: number; overdueAmount: number; noPaymentCount: number; };

export default function VendorList() {
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [search, setSearch] = useState("");
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"name" | "recent" | "count">("recent");
  const [filterBy, setFilterBy] = useState<"all" | "favorite" | "recurring" | "noplan">("all");
  // 지연·결제예정은 독립 토글(OR 다중선택). 단일선택 칩과는 서로 배타.
  const [statusFilters, setStatusFilters] = useState<Set<"overdue" | "planned">>(new Set());
  const [hideInactivePeriod, setHideInactivePeriod] = useState<number | null>(6); // 기본 6개월

  const { data: vendorList, isLoading } = useQuery<VendorWithStats[]>({
    queryKey: ["/api/vendors-with-stats"],
  });

  const favoriteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/vendors/${id}/favorite`);
      return res.json();
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["/api/vendors-with-stats"] });
      const prev = queryClient.getQueryData<VendorWithStats[]>(["/api/vendors-with-stats"]);
      if (prev) {
        queryClient.setQueryData(["/api/vendors-with-stats"], prev.map(v =>
          v.id === id ? { ...v, isFavorite: !v.isFavorite } : v
        ));
      }
      return { prev };
    },
    onError: (_err, _id, context) => {
      if (context?.prev) queryClient.setQueryData(["/api/vendors-with-stats"], context.prev);
      toast({ title: "즐겨찾기 변경 실패", variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors-with-stats"] });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/vendors/sync-from-invoices");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors-with-stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-invoices"] });
      const parts: string[] = [];
      parts.push(`매입계산서 ${data.totalInvoices}건 검토`);
      parts.push(`사업자번호 ${data.uniqueBusinessNumbers}개 확인`);
      if (data.vendorsCreated > 0) parts.push(`${data.vendorsCreated}개 신규 등록`);
      if (data.vendorsUpdated > 0) parts.push(`${data.vendorsUpdated}개 정보 보충`);
      if (data.invoicesLinked > 0) parts.push(`${data.invoicesLinked}건 연결`);
      toast({
        title: "갱신 완료",
        description: parts.join(", "),
      });
      if (data.skippedNoBizNum > 0) {
        toast({
          title: "일부 계산서 건너뜀",
          description: `사업자번호가 없는 계산서 ${data.skippedNoBizNum}건은 자동 연결되지 않았습니다.`,
          variant: "destructive",
        });
      }
    },
    onError: (err: Error) => {
      toast({ title: "갱신 실패", description: err.message, variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: { companyName: string }) => {
      const res = await apiRequest("POST", "/api/vendors", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors-with-stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
      setShowAdd(false);
      setNewName("");
      toast({ title: "공급업체가 등록되었습니다" });
    },
    onError: (err: Error) => {
      toast({ title: "등록 실패", description: err.message, variant: "destructive" });
    },
  });

  const filtered = useMemo(() => {
    if (!vendorList) return [];
    let list = vendorList;
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(v =>
        v.companyName.toLowerCase().includes(s) ||
        (v.businessNumber && v.businessNumber.toLowerCase().includes(s)) ||
        (v.contactName && v.contactName.toLowerCase().includes(s))
      );
    }
    if (statusFilters.size > 0) {
      list = list.filter(v =>
        (statusFilters.has("overdue") && v.overdueAmount > 0) ||
        (statusFilters.has("planned") && v.plannedAmount > 0)
      );
    } else {
      if (filterBy === "favorite") list = list.filter(v => v.isFavorite);
      if (filterBy === "recurring") list = list.filter(v => v.isRecurring);
      if (filterBy === "noplan") list = list.filter(v => v.noPaymentCount > 0);
    }
    if (hideInactivePeriod) {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - hideInactivePeriod);
      const cutoffStr = cutoff.toISOString().split("T")[0];
      list = list.filter(v => v.lastTransactionDate && v.lastTransactionDate >= cutoffStr);
    }

    return list.sort((a, b) => {
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;
      if (sortBy === "recent") {
        if (!a.lastTransactionDate && !b.lastTransactionDate) return a.companyName.localeCompare(b.companyName);
        if (!a.lastTransactionDate) return 1;
        if (!b.lastTransactionDate) return -1;
        return b.lastTransactionDate.localeCompare(a.lastTransactionDate);
      }
      if (sortBy === "count") return (b.invoiceCount + b.orderCount) - (a.invoiceCount + a.orderCount);
      return a.companyName.localeCompare(b.companyName);
    });
  }, [vendorList, search, sortBy, filterBy, statusFilters, hideInactivePeriod]);

  return (
    <div className="p-6 space-y-4 overflow-auto h-full">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-semibold" data-testid="text-vendor-list-title">공급업체 목록</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            data-testid="button-sync-vendors"
          >
            {syncMutation.isPending ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            {syncMutation.isPending ? "갱신 중..." : "매입계산서 기준 갱신"}
          </Button>
          <Button size="sm" onClick={() => setShowAdd(true)} data-testid="button-add-vendor">
            <Plus className="h-4 w-4 mr-1" />
            공급업체 추가
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="업체명, 사업자번호, 담당자 검색"
            className="pl-9"
            data-testid="input-search-vendors"
          />
        </div>
        <div className="flex items-center gap-1">
          {(["all", "favorite", "recurring", "noplan"] as const).map(f => (
            <Button key={f} size="sm" variant={filterBy === f && statusFilters.size === 0 ? "default" : "ghost"} className="h-7 text-xs" onClick={() => { setFilterBy(f); setStatusFilters(new Set()); }}>
              {f === "all" ? `전체 ${vendorList?.length || 0}`
                : f === "favorite" ? "⭐ 즐겨찾기"
                : f === "recurring" ? "🔄 정기결제"
                : `⚠️ 계획없음 ${vendorList?.filter(v => v.noPaymentCount > 0).length || 0}`}
            </Button>
          ))}
          <span className="mx-1 h-4 w-px bg-border" />
          {(["overdue", "planned"] as const).map(s => (
            <Button
              key={s}
              size="sm"
              variant={statusFilters.has(s) ? "default" : "ghost"}
              className="h-7 text-xs"
              onClick={() => {
                setStatusFilters(prev => {
                  const next = new Set(prev);
                  if (next.has(s)) next.delete(s); else next.add(s);
                  return next;
                });
                setFilterBy("all");
              }}
            >
              {s === "overdue"
                ? `🔴 지연 ${vendorList?.filter(v => v.overdueAmount > 0).length || 0}`
                : `🔵 결제예정 ${vendorList?.filter(v => v.plannedAmount > 0).length || 0}`}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">정렬:</span>
          {(["recent", "count", "name"] as const).map(s => (
            <Button key={s} size="sm" variant={sortBy === s ? "default" : "ghost"} className="h-7 text-xs" onClick={() => setSortBy(s)}>
              {s === "recent" ? "최근거래" : s === "count" ? "거래많은순" : "이름순"}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">미거래 숨기기:</span>
          {([null, 6, 12, 24, 36] as const).map(m => (
            <Button key={String(m)} size="sm" variant={hideInactivePeriod === m ? "default" : "ghost"} className="h-7 text-xs" onClick={() => setHideInactivePeriod(m)}>
              {m === null ? "전체" : m === 6 ? "6개월" : m === 12 ? "1년" : m === 24 ? "2년" : "3년"}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12" />)}</div>
      ) : filtered.length > 0 ? (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="w-10 py-2.5 px-2"></th>
                <th className="text-left py-2.5 px-4 font-medium">업체명</th>
                <th className="text-left py-2.5 px-4 font-medium hidden md:table-cell">대표자</th>
                <th className="text-left py-2.5 px-4 font-medium hidden lg:table-cell">담당자</th>
                <th className="text-center py-2.5 px-4 font-medium hidden lg:table-cell" title="등록된 매입계산서 건수">계산서</th>
                <th className="text-center py-2.5 px-4 font-medium hidden lg:table-cell" title="정기 결제 등록된 업체">정기결제</th>
                <th className="text-right py-2.5 px-4 font-medium hidden lg:table-cell" title="지급 예정일이 지났는데 아직 미지급된 금액">지연</th>
                <th className="text-right py-2.5 px-4 font-medium hidden lg:table-cell" title="미래 지급 예정으로 등록된 금액">결제예정</th>
                <th className="text-center py-2.5 px-4 font-medium hidden lg:table-cell" title="계산서는 있으나 결제 계획이 하나도 없는 건수 — 자금계획 등록이 필요합니다">계획없음</th>
                <th className="text-left py-2.5 px-4 font-medium hidden lg:table-cell" title="가장 최근 매입계산서 발행일">최근 거래일</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(vendor => (
                <tr
                  key={vendor.id}
                  className="border-b last:border-b-0 hover:bg-muted/30 cursor-pointer transition-colors"
                  onClick={() => setSelectedVendorId(vendor.id)}
                  data-testid={`row-vendor-${vendor.id}`}
                >
                  <td className="py-2.5 px-2 text-center">
                    <button
                      onClick={e => { e.stopPropagation(); favoriteMutation.mutate(vendor.id); }}
                      className="hover:scale-110 transition-transform"
                      data-testid={`button-favorite-vendor-${vendor.id}`}
                    >
                      <Star className={`h-4 w-4 ${vendor.isFavorite ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40 hover:text-yellow-400"}`} />
                    </button>
                  </td>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-orange-500 shrink-0" />
                      <span className="font-medium">{vendor.companyName}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-4 text-muted-foreground hidden md:table-cell">{vendor.representative || "-"}</td>
                  <td className="py-2.5 px-4 text-muted-foreground hidden lg:table-cell">{vendor.contactName || "-"}</td>
                  <td className="py-2.5 px-4 text-center hidden lg:table-cell">
                    {vendor.invoiceCount > 0 ? <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 px-2 py-0.5 rounded-full">{vendor.invoiceCount}건</span> : <span className="text-muted-foreground">-</span>}
                  </td>
                  <td className="py-2.5 px-4 text-center hidden lg:table-cell">
                    {vendor.isRecurring ? <span className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 px-2 py-0.5 rounded-full">정기</span> : <span className="text-muted-foreground">-</span>}
                  </td>
                  <td className="py-2.5 px-4 text-right hidden lg:table-cell">
                    {vendor.overdueAmount > 0
                      ? <span className="text-xs text-red-600 dark:text-red-400 font-medium">{vendor.overdueAmount.toLocaleString("ko-KR")}원</span>
                      : <span className="text-muted-foreground">-</span>}
                  </td>
                  <td className="py-2.5 px-4 text-right hidden lg:table-cell">
                    {vendor.plannedAmount > 0
                      ? <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">{vendor.plannedAmount.toLocaleString("ko-KR")}원</span>
                      : <span className="text-muted-foreground">-</span>}
                  </td>
                  <td className="py-2.5 px-4 text-center hidden lg:table-cell">
                    {vendor.noPaymentCount > 0
                      ? <span className="text-xs text-orange-600 dark:text-orange-400 font-medium bg-orange-50 dark:bg-orange-950/30 px-2 py-0.5 rounded-full">{vendor.noPaymentCount}건</span>
                      : <span className="text-muted-foreground">-</span>}
                  </td>
                  <td className="py-2.5 px-4 text-muted-foreground hidden lg:table-cell text-xs">{vendor.lastTransactionDate || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <Building2 className="h-12 w-12 mx-auto mb-4 opacity-30" />
          {search ? <p>검색 결과가 없습니다.</p> : (
            <><p>등록된 공급업체가 없습니다.</p><p className="text-sm mt-1">공급업체 추가 버튼으로 새 업체를 등록하세요.</p></>
          )}
        </div>
      )}

      <div className="text-xs text-muted-foreground">{filtered.length > 0 && `총 ${filtered.length}개`}</div>

      <Dialog open={!!selectedVendorId} onOpenChange={open => { if (!open) setSelectedVendorId(null); }}>
        {selectedVendorId && <VendorDetailModal vendorId={selectedVendorId} onClose={() => setSelectedVendorId(null)} />}
      </Dialog>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>공급업체 추가</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>업체명 *</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="업체명을 입력하세요" data-testid="input-new-vendor-name" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowAdd(false)} data-testid="button-cancel-add-vendor">취소</Button>
            <Button
              onClick={() => createMutation.mutate({ companyName: newName })}
              disabled={!newName.trim() || createMutation.isPending}
              data-testid="button-confirm-add-vendor"
            >등록</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
