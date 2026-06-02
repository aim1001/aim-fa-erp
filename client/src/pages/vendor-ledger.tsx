import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import { useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Link2, Unlink2, FileText, Package, Check, Clock,
  AlertCircle, ChevronRight, X, Sparkles, ArrowRight, Pencil,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import type { Vendor, PurchaseOrder, PurchaseInvoice, Payment } from "@shared/schema";

type LinkedInvoice = PurchaseInvoice & { payments: Payment[] };
type OrderWithLinks = PurchaseOrder & { linkedInvoices: LinkedInvoice[] };
type InvoiceWithPayments = PurchaseInvoice & { payments: Payment[] };

type LedgerData = {
  vendor: Vendor;
  orders: OrderWithLinks[];
  unlinkedInvoices: InvoiceWithPayments[];
  summary: { orderTotal: number; invoiceTotal: number; paidTotal: number; plannedTotal: number; diff: number };
  links: { purchaseOrderId: string; purchaseInvoiceId: string }[];
};

type Stage1Match = { type: "1:1"; order: OrderWithLinks; invoice: InvoiceWithPayments; sameMonth: boolean };
type Stage2Match = { type: "N:1"; orders: OrderWithLinks[]; invoice: InvoiceWithPayments; sameMonth: boolean };
type Stage3Match = { type: "1:N"; order: OrderWithLinks; invoices: InvoiceWithPayments[]; sameMonth: boolean };
type SmartMatch = Stage1Match | Stage2Match | Stage3Match;

// ── 유틸 ──────────────────────────────────────────────────────────────
function fmt(n: number | null | undefined) {
  if (!n && n !== 0) return "-";
  return n.toLocaleString() + "원";
}

function getYM(dateStr: string | null | undefined) {
  if (!dateStr) return "";
  return dateStr.substring(0, 7);
}

function orderYM(o: OrderWithLinks) {
  return getYM(o.expectedDeliveryDate || o.actualDeliveryDate);
}

function invoiceYM(inv: InvoiceWithPayments) {
  return getYM(inv.issueDate || inv.writeDate);
}

// subset sum: orders 조합 중 target과 합산이 같은 것 반환 (최대 maxItems개)
function findSubsets(
  orders: OrderWithLinks[],
  target: number,
  maxItems = 5,
): OrderWithLinks[][] {
  const results: OrderWithLinks[][] = [];
  function dfs(start: number, cur: OrderWithLinks[], curSum: number) {
    if (curSum === target) { results.push([...cur]); return; }
    if (curSum > target || cur.length >= maxItems || start >= orders.length) return;
    for (let i = start; i < orders.length; i++) {
      const amt = orders[i].totalAmount || 0;
      if (amt === 0) continue;
      cur.push(orders[i]);
      dfs(i + 1, cur, curSum + amt);
      cur.pop();
      if (results.length >= 3) return; // 최대 3개 조합만 탐색
    }
  }
  dfs(0, [], 0);
  return results;
}

// ── 스마트 매칭 알고리즘 ──────────────────────────────────────────────
function analyzeMatches(
  orders: OrderWithLinks[],
  invoices: InvoiceWithPayments[],
): SmartMatch[] {
  const results: SmartMatch[] = [];
  const usedOrderIds = new Set<string>();
  const usedInvIds = new Set<string>();

  const availOrders = () => orders.filter(o => !usedOrderIds.has(o.id));
  const availInvs = () => invoices.filter(i => !usedInvIds.has(i.id));

  // ── Stage 1: 1:1 정확 일치 (같은 월 우선) ──────────────────────────
  for (const inv of invoices) {
    if (usedInvIds.has(inv.id)) continue;
    const invAmt = inv.totalAmount || 0;
    const invM = invoiceYM(inv);

    // 같은 월 먼저
    let match = availOrders().find(o => (o.totalAmount || 0) === invAmt && orderYM(o) === invM);
    // 없으면 전체
    if (!match) match = availOrders().find(o => (o.totalAmount || 0) === invAmt);

    if (match) {
      results.push({ type: "1:1", order: match, invoice: inv, sameMonth: orderYM(match) === invM });
      usedOrderIds.add(match.id);
      usedInvIds.add(inv.id);
    }
  }

  // ── Stage 2: N:1 합산 일치 ──────────────────────────────────────────
  for (const inv of invoices) {
    if (usedInvIds.has(inv.id)) continue;
    const invAmt = inv.totalAmount || 0;
    const invM = invoiceYM(inv);
    const ao = availOrders();

    // 같은 월 orders로 먼저 탐색
    const sameMonthOrders = ao.filter(o => orderYM(o) === invM);
    let subsets = sameMonthOrders.length >= 2 ? findSubsets(sameMonthOrders, invAmt) : [];
    let sameMonth = true;

    // 없으면 전체로 확장
    if (subsets.length === 0 && ao.length >= 2) {
      subsets = findSubsets(ao, invAmt);
      sameMonth = false;
    }

    if (subsets.length > 0) {
      const best = subsets[0]; // 첫 번째 조합 사용
      results.push({ type: "N:1", orders: best, invoice: inv, sameMonth });
      best.forEach(o => usedOrderIds.add(o.id));
      usedInvIds.add(inv.id);
    }
  }

  // ── Stage 3: 1:N 분할 일치 ──────────────────────────────────────────
  for (const order of orders) {
    if (usedOrderIds.has(order.id)) continue;
    const orderAmt = order.totalAmount || 0;
    const orderM = orderYM(order);
    const ai = availInvs();

    // 같은 월 invoices로 먼저
    const sameMonthInvs = ai.filter(i => invoiceYM(i) === orderM);
    let found: InvoiceWithPayments[] | null = null;
    let sameMonth = true;

    const trySubset = (pool: InvoiceWithPayments[]) => {
      // pool 중 합산이 orderAmt인 조합 찾기 (최대 3건)
      for (let i = 0; i < pool.length; i++) {
        for (let j = i + 1; j < pool.length; j++) {
          const s2 = (pool[i].totalAmount || 0) + (pool[j].totalAmount || 0);
          if (s2 === orderAmt) return [pool[i], pool[j]];
          for (let k = j + 1; k < pool.length; k++) {
            const s3 = s2 + (pool[k].totalAmount || 0);
            if (s3 === orderAmt) return [pool[i], pool[j], pool[k]];
          }
        }
      }
      return null;
    };

    found = trySubset(sameMonthInvs);
    if (!found) { found = trySubset(ai); sameMonth = false; }

    if (found) {
      results.push({ type: "1:N", order, invoices: found, sameMonth });
      usedOrderIds.add(order.id);
      found.forEach(i => usedInvIds.add(i.id));
    }
  }

  return results;
}

const MONTHS = ["전체", "1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];

function PayBadge({ payments }: { payments: Payment[] }) {
  if (!payments || payments.length === 0)
    return <Badge variant="outline" className="text-xs text-muted-foreground">미지급</Badge>;
  const done = payments.filter(p => p.status === "completed");
  if (done.length > 0 && done.length === payments.length)
    return <Badge className="bg-green-100 text-green-700 border-0 text-xs"><Check className="h-3 w-3 mr-1" />지급완료</Badge>;
  if (done.length > 0)
    return <Badge className="bg-yellow-100 text-yellow-700 border-0 text-xs"><Clock className="h-3 w-3 mr-1" />부분지급</Badge>;
  return <Badge className="bg-blue-100 text-blue-700 border-0 text-xs"><Clock className="h-3 w-3 mr-1" />지급예정</Badge>;
}

// ── 스마트 매칭 패널 ──────────────────────────────────────────────────
function SmartMatchPanel({
  orders, invoices, vendorId, year,
  onDone,
}: {
  orders: OrderWithLinks[];
  invoices: InvoiceWithPayments[];
  vendorId: string;
  year: number | null;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const [linked, setLinked] = useState<Set<number>>(new Set());
  const [linking, setLinking] = useState<number | null>(null);

  const matches = useMemo(() => analyzeMatches(orders, invoices), [orders, invoices]);

  const stage1 = matches.filter(m => m.type === "1:1");
  const stage2 = matches.filter(m => m.type === "N:1");
  const stage3 = matches.filter(m => m.type === "1:N");

  const usedOrderIds = new Set(matches.flatMap(m =>
    m.type === "1:1" ? [m.order.id] :
    m.type === "N:1" ? m.orders.map(o => o.id) : [m.order.id]
  ));
  const usedInvIds = new Set(matches.flatMap(m =>
    m.type === "1:N" ? m.invoices.map(i => i.id) : [m.invoice?.id || ""]
  ));

  const unresolvedOrders = orders.filter(o => !usedOrderIds.has(o.id));
  const unresolvedInvs = invoices.filter(i => !usedInvIds.has(i.id) && !(m => m.type === "1:1" && m.invoice.id === i.id));

  const doLink = async (idx: number, match: SmartMatch) => {
    setLinking(idx);
    try {
      if (match.type === "1:1") {
        await apiRequest("POST", `/api/purchase-orders/${match.order.id}/link-invoice/${match.invoice.id}`);
      } else if (match.type === "N:1") {
        for (const o of match.orders) {
          await apiRequest("POST", `/api/purchase-orders/${o.id}/link-invoice/${match.invoice.id}`);
        }
      } else {
        for (const inv of match.invoices) {
          await apiRequest("POST", `/api/purchase-orders/${match.order.id}/link-invoice/${inv.id}`);
        }
      }
      setLinked(prev => new Set([...prev, idx]));
      queryClient.invalidateQueries({ queryKey: ["/api/vendors", vendorId, "ledger", year] });
    } catch (e: any) {
      toast({ title: "연결 실패", description: e.message, variant: "destructive" });
    }
    setLinking(null);
  };

  const doLinkAll = async (stageMatches: SmartMatch[], stageIdx: (m: SmartMatch) => number) => {
    for (const m of stageMatches) {
      const idx = stageIdx(m);
      if (!skipped.has(idx) && !linked.has(idx)) await doLink(idx, m);
    }
  };

  if (matches.length === 0) {
    return (
      <div className="p-6 flex flex-col items-center gap-2 text-muted-foreground">
        <AlertCircle className="h-8 w-8 opacity-30" />
        <p className="text-sm">자동으로 매칭 가능한 조합이 없습니다.</p>
        <p className="text-xs">금액 기준으로 일치하는 항목이 없습니다. 수동으로 연결해주세요.</p>
        <Button size="sm" variant="outline" onClick={onDone} className="mt-2">돌아가기</Button>
      </div>
    );
  }

  const renderMatchCard = (match: SmartMatch, idx: number) => {
    const isLinked = linked.has(idx);
    const isSkipped = skipped.has(idx);
    const isLinking = linking === idx;

    return (
      <div key={idx} className={`border rounded-lg p-3 transition-all ${
        isLinked ? "bg-green-50 border-green-200 dark:bg-green-950/20" :
        isSkipped ? "opacity-40" : "bg-background"
      }`}>
        <div className="flex items-start gap-3">
          {/* 왼쪽: 발주서 */}
          <div className="flex-1 min-w-0">
            {match.type === "1:1" && (
              <OrderChip order={match.order} />
            )}
            {match.type === "N:1" && (
              <div className="space-y-1">
                {match.orders.map(o => <OrderChip key={o.id} order={o} />)}
                <div className="text-xs text-muted-foreground pl-1">
                  합계 {fmt(match.orders.reduce((s, o) => s + (o.totalAmount || 0), 0))}
                </div>
              </div>
            )}
            {match.type === "1:N" && (
              <OrderChip order={match.order} />
            )}
          </div>

          {/* 화살표 + 월 표시 */}
          <div className="flex flex-col items-center gap-1 shrink-0 pt-1">
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            {match.sameMonth
              ? <span className="text-[10px] text-green-600">같은 월</span>
              : <span className="text-[10px] text-amber-500">월 다름</span>
            }
          </div>

          {/* 오른쪽: 계산서 */}
          <div className="flex-1 min-w-0">
            {match.type === "1:N" ? (
              <div className="space-y-1">
                {match.invoices.map(inv => <InvoiceChip key={inv.id} inv={inv} />)}
                <div className="text-xs text-muted-foreground pl-1">
                  합계 {fmt(match.invoices.reduce((s, i) => s + (i.totalAmount || 0), 0))}
                </div>
              </div>
            ) : (
              <InvoiceChip inv={match.invoice} />
            )}
          </div>

          {/* 버튼 */}
          <div className="flex flex-col gap-1 shrink-0">
            {isLinked ? (
              <Badge className="bg-green-100 text-green-700 border-0 text-xs"><Check className="h-3 w-3 mr-1" />연결됨</Badge>
            ) : isSkipped ? (
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSkipped(s => { const n = new Set(s); n.delete(idx); return n; })}>
                복원
              </Button>
            ) : (
              <>
                <Button size="sm" className="h-7 text-xs" onClick={() => doLink(idx, match)} disabled={!!linking}>
                  {isLinking ? "연결 중..." : <><Link2 className="h-3 w-3 mr-1" />연결</>}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => setSkipped(s => new Set([...s, idx]))}>
                  건너뜀
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  // 미해결 항목 계산
  const matchedOrderIds = new Set<string>();
  const matchedInvIds = new Set<string>();
  matches.forEach((m, idx) => {
    if (linked.has(idx)) {
      if (m.type === "1:1") { matchedOrderIds.add(m.order.id); matchedInvIds.add(m.invoice.id); }
      else if (m.type === "N:1") { m.orders.forEach(o => matchedOrderIds.add(o.id)); matchedInvIds.add(m.invoice.id); }
      else { matchedOrderIds.add(m.order.id); m.invoices.forEach(i => matchedInvIds.add(i.id)); }
    }
  });
  const pendingMatchOrderIds = new Set<string>();
  const pendingMatchInvIds = new Set<string>();
  matches.forEach((m, idx) => {
    if (!skipped.has(idx) && !linked.has(idx)) {
      if (m.type === "1:1") { pendingMatchOrderIds.add(m.order.id); pendingMatchInvIds.add(m.invoice.id); }
      else if (m.type === "N:1") { m.orders.forEach(o => pendingMatchOrderIds.add(o.id)); pendingMatchInvIds.add(m.invoice.id); }
      else { pendingMatchOrderIds.add(m.order.id); m.invoices.forEach(i => pendingMatchInvIds.add(i.id)); }
    }
  });
  const allMatchedOrPendingOrders = new Set([...matchedOrderIds, ...pendingMatchOrderIds]);
  const allMatchedOrPendingInvs = new Set([...matchedInvIds, ...pendingMatchInvIds]);
  const unresOrders = orders.filter(o => !allMatchedOrPendingOrders.has(o.id));
  const unresInvs = invoices.filter(i => !allMatchedOrPendingInvs.has(i.id));

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-5">

      {/* Stage 1 */}
      {stage1.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Badge className="bg-blue-100 text-blue-700 border-0 text-xs">Stage 1</Badge>
              <span className="text-sm font-semibold">1:1 정확 일치 ({stage1.length}건)</span>
            </div>
            <Button size="sm" variant="outline" className="h-7 text-xs"
              onClick={() => doLinkAll(stage1, m => matches.indexOf(m))}
              disabled={!!linking || stage1.every((m, i) => linked.has(matches.indexOf(m)) || skipped.has(matches.indexOf(m)))}>
              전체 연결
            </Button>
          </div>
          <div className="space-y-2">
            {stage1.map(m => renderMatchCard(m, matches.indexOf(m)))}
          </div>
        </section>
      )}

      {/* Stage 2 */}
      {stage2.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Badge className="bg-purple-100 text-purple-700 border-0 text-xs">Stage 2</Badge>
              <span className="text-sm font-semibold">N:1 합산 일치 ({stage2.length}건)</span>
              <span className="text-xs text-muted-foreground">발주서 여러 건 합산 = 계산서 1건</span>
            </div>
            <Button size="sm" variant="outline" className="h-7 text-xs"
              onClick={() => doLinkAll(stage2, m => matches.indexOf(m))}
              disabled={!!linking || stage2.every((m) => linked.has(matches.indexOf(m)) || skipped.has(matches.indexOf(m)))}>
              전체 연결
            </Button>
          </div>
          <div className="space-y-2">
            {stage2.map(m => renderMatchCard(m, matches.indexOf(m)))}
          </div>
        </section>
      )}

      {/* Stage 3 */}
      {stage3.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Badge className="bg-orange-100 text-orange-700 border-0 text-xs">Stage 3</Badge>
              <span className="text-sm font-semibold">1:N 분할 일치 ({stage3.length}건)</span>
              <span className="text-xs text-muted-foreground">발주서 1건 = 계산서 여러 건</span>
            </div>
          </div>
          <div className="space-y-2">
            {stage3.map(m => renderMatchCard(m, matches.indexOf(m)))}
          </div>
        </section>
      )}

      {/* Stage 4: 미해결 */}
      {(unresOrders.length > 0 || unresInvs.length > 0) && (
        <section>
          <div className="flex items-center gap-2 mb-2">
            <Badge className="bg-red-100 text-red-700 border-0 text-xs">Stage 4</Badge>
            <span className="text-sm font-semibold">미해결 — 수동 처리 필요</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              {unresOrders.length > 0 && <p className="text-xs text-muted-foreground mb-1">발주서 ({unresOrders.length}건)</p>}
              {unresOrders.map(o => <OrderChip key={o.id} order={o} muted />)}
            </div>
            <div className="space-y-1">
              {unresInvs.length > 0 && <p className="text-xs text-muted-foreground mb-1">계산서 ({unresInvs.length}건)</p>}
              {unresInvs.map(i => <InvoiceChip key={i.id} inv={i} muted />)}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            금액 기준으로 매칭되지 않았습니다. 발주서 수정 또는 수동 연결이 필요합니다.
          </p>
        </section>
      )}

      <div className="pt-2">
        <Button variant="outline" size="sm" onClick={onDone}>← 미매칭 목록으로</Button>
      </div>
    </div>
  );
}

function OrderChip({ order, muted }: { order: OrderWithLinks; muted?: boolean }) {
  return (
    <div className={`rounded px-2 py-1.5 text-xs ${muted ? "bg-muted/30" : "bg-muted/50"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-muted-foreground">{order.orderNumber}</span>
        <span className="font-semibold">{fmt(order.totalAmount)}</span>
      </div>
      <div className="truncate text-muted-foreground mt-0.5">{order.description || "품목 미입력"}</div>
      {order.expectedDeliveryDate && <div className="text-muted-foreground">납기: {order.expectedDeliveryDate}</div>}
    </div>
  );
}

function InvoiceChip({ inv, muted }: { inv: InvoiceWithPayments; muted?: boolean }) {
  return (
    <div className={`rounded px-2 py-1.5 text-xs ${muted ? "bg-muted/30" : "bg-muted/50"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-muted-foreground">{inv.invoiceNumber || "번호없음"}</span>
        <span className="font-semibold">{fmt(inv.totalAmount)}</span>
      </div>
      <div className="truncate text-muted-foreground mt-0.5">{inv.item || "품목 미입력"}</div>
      {inv.issueDate && <div className="text-muted-foreground">발행: {inv.issueDate}</div>}
    </div>
  );
}

// ── 메인 페이지 ───────────────────────────────────────────────────────
export default function VendorLedger() {
  const { toast } = useToast();
  const searchString = useSearch();
  const currentYear = new Date().getFullYear();
  const urlVendorId = new URLSearchParams(searchString).get("vendorId") || "";
  const [vendorId, setVendorId] = useState<string>(urlVendorId);
  const [year, setYear] = useState<number | null>(currentYear);
  const [month, setMonth] = useState(0);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [showSmartMatch, setShowSmartMatch] = useState(false);

  useEffect(() => { if (urlVendorId) setVendorId(urlVendorId); }, [urlVendorId]);

  const { data: vendors = [] } = useQuery<Vendor[]>({ queryKey: ["/api/vendors"] });

  const { data: ledger, isLoading } = useQuery<LedgerData>({
    queryKey: ["/api/vendors", vendorId, "ledger", year],
    queryFn: async () => {
      const url = year ? `/api/vendors/${vendorId}/ledger?year=${year}` : `/api/vendors/${vendorId}/ledger`;
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
      setSelectedOrderId(null); setSelectedInvoiceId(null);
      toast({ title: "연결 완료" });
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
      return d && new Date(d).getMonth() + 1 === month;
    });
  }, [ledger, month]);

  const filteredUnlinkedInvoices = useMemo(() => {
    if (!ledger) return [];
    if (month === 0) return ledger.unlinkedInvoices;
    return ledger.unlinkedInvoices.filter(inv => {
      const d = inv.issueDate || inv.writeDate || "";
      return d && new Date(d).getMonth() + 1 === month;
    });
  }, [ledger, month]);

  const unlinkedOrders = useMemo(() => filteredOrders.filter(o => o.linkedInvoices.length === 0), [filteredOrders]);
  const linkedOrders = useMemo(() => filteredOrders.filter(o => o.linkedInvoices.length > 0), [filteredOrders]);
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i + 1);
  const isReadyToLink = !!selectedOrderId && !!selectedInvoiceId;
  const hasUnmatched = unlinkedOrders.length > 0 || filteredUnlinkedInvoices.length > 0;

  // ── 통합 뷰 ─────────────────────────────────────────────────────────
  const [viewFilter, setViewFilter] = useState<"all" | "matched" | "unmatched" | "unpaid">("all");
  const [addPayInvoiceId, setAddPayInvoiceId] = useState<string | null>(null);
  const [addPayForm, setAddPayForm] = useState({ amount: "", plannedDate: "" });
  const [linkingForInvoiceId, setLinkingForInvoiceId] = useState<string | null>(null);

  const createPaymentMutation = useMutation({
    mutationFn: async ({ invoiceId, amount, plannedDate }: { invoiceId: string; amount: number; plannedDate: string }) => {
      const res = await apiRequest("POST", "/api/payments", { type: "expense", purchaseInvoiceId: invoiceId, amount, plannedDate, status: "planned" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors", vendorId, "ledger", year] });
      setAddPayInvoiceId(null);
      setAddPayForm({ amount: "", plannedDate: "" });
      toast({ title: "결제계획 추가 완료" });
    },
    onError: (e: Error) => toast({ title: "추가 실패", description: e.message, variant: "destructive" }),
  });

  type URow =
    | { kind: "matched"; order: OrderWithLinks; invoice: LinkedInvoice }
    | { kind: "inv-only"; invoice: InvoiceWithPayments }
    | { kind: "ord-only"; order: OrderWithLinks };

  const allRows = useMemo((): URow[] => {
    if (!ledger) return [];
    const rows: URow[] = [];
    for (const order of filteredOrders) {
      if (order.linkedInvoices.length === 0) {
        rows.push({ kind: "ord-only", order });
      } else {
        for (const inv of order.linkedInvoices) {
          rows.push({ kind: "matched", order, invoice: inv });
        }
      }
    }
    for (const inv of filteredUnlinkedInvoices) {
      rows.push({ kind: "inv-only", invoice: inv });
    }
    return rows;
  }, [filteredOrders, filteredUnlinkedInvoices]);

  const visibleRows = useMemo(() => {
    if (viewFilter === "matched") return allRows.filter(r => r.kind === "matched");
    if (viewFilter === "unmatched") return allRows.filter(r => r.kind !== "matched");
    if (viewFilter === "unpaid") return allRows.filter(r => {
      if (r.kind === "ord-only") return false;
      const pays = r.kind === "matched" ? r.invoice.payments : r.invoice.payments;
      return !(pays.length > 0 && pays.every((p: Payment) => p.status === "completed"));
    });
    return allRows;
  }, [allRows, viewFilter]);

  const rowCounts = useMemo(() => ({
    all: allRows.length,
    matched: allRows.filter(r => r.kind === "matched").length,
    unmatched: allRows.filter(r => r.kind !== "matched").length,
    unpaid: allRows.filter(r => {
      if (r.kind === "ord-only") return false;
      const pays = r.kind === "matched" ? r.invoice.payments : (r as any).invoice.payments;
      return !(pays.length > 0 && pays.every((p: Payment) => p.status === "completed"));
    }).length,
  }), [allRows]);

  // 발주서 편집 모달
  const [editOrder, setEditOrder] = useState<PurchaseOrder | null>(null);
  const [editForm, setEditForm] = useState({ description: "", supplyAmount: "", taxAmount: "", totalAmount: "", expectedDeliveryDate: "" });

  const openEditOrder = (o: PurchaseOrder, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditOrder(o);
    setEditForm({
      description: o.description || "",
      supplyAmount: o.supplyAmount != null ? String(o.supplyAmount) : "",
      taxAmount: o.taxAmount != null ? String(o.taxAmount) : "",
      totalAmount: o.totalAmount != null ? String(o.totalAmount) : "",
      expectedDeliveryDate: o.expectedDeliveryDate || "",
    });
  };

  const editOrderMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("PATCH", `/api/purchase-orders/${editOrder!.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "발주서 수정 완료" });
      setEditOrder(null);
      queryClient.invalidateQueries({ queryKey: ["/api/vendors", vendorId, "ledger", year] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] });
    },
    onError: (err: Error) => toast({ title: "수정 실패", description: err.message, variant: "destructive" }),
  });

  const handleEditSave = () => {
    editOrderMutation.mutate({
      description: editForm.description || null,
      supplyAmount: editForm.supplyAmount ? parseInt(editForm.supplyAmount.replace(/,/g, "")) : null,
      taxAmount: editForm.taxAmount ? parseInt(editForm.taxAmount.replace(/,/g, "")) : null,
      totalAmount: editForm.totalAmount ? parseInt(editForm.totalAmount.replace(/,/g, "")) : null,
      expectedDeliveryDate: editForm.expectedDeliveryDate || null,
    });
  };

  // 공급가액 입력 시 세액·합계 자동계산
  const handleSupplyChange = (val: string) => {
    const supply = parseInt(val.replace(/,/g, "")) || 0;
    const tax = Math.round(supply * 0.1);
    setEditForm(f => ({ ...f, supplyAmount: val, taxAmount: String(tax), totalAmount: String(supply + tax) }));
  };

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="flex items-center gap-3 p-3 border-b bg-background flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">업체</span>
          <Select value={vendorId} onValueChange={v => { setVendorId(v); setShowSmartMatch(false); }}>
            <SelectTrigger className="w-44 h-8 text-sm" data-testid="select-vendor">
              <SelectValue placeholder="업체 선택..." />
            </SelectTrigger>
            <SelectContent>
              {vendors.map(v => <SelectItem key={v.id} value={v.id}>{v.companyName}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">연도</span>
          <Select value={year === null ? "all" : String(year)} onValueChange={v => { setYear(v === "all" ? null : Number(v)); setShowSmartMatch(false); }}>
            <SelectTrigger className="w-24 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              {years.map(y => <SelectItem key={y} value={String(y)}>{y}년</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">월</span>
          <Select value={String(month)} onValueChange={v => { setMonth(Number(v)); setShowSmartMatch(false); }}>
            <SelectTrigger className="w-20 h-8 text-sm"><SelectValue /></SelectTrigger>
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
        <div className="p-6 space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* 필터 바 */}
          <div className="flex items-center gap-1.5 px-4 py-2 border-b shrink-0 flex-wrap">
            {([
              { value: "all", label: "전체", count: rowCounts.all },
              { value: "matched", label: "매칭됨", count: rowCounts.matched },
              { value: "unmatched", label: "미매칭", count: rowCounts.unmatched },
              { value: "unpaid", label: "미결제", count: rowCounts.unpaid },
            ] as const).map(f => (
              <Button key={f.value} size="sm" variant={viewFilter === f.value ? "default" : "outline"}
                className="h-7 text-xs gap-1.5" onClick={() => { setViewFilter(f.value); setShowSmartMatch(false); }}>
                {f.label}
                <span className={`text-[10px] px-1 rounded-full ${viewFilter === f.value ? "bg-white/20" : "bg-muted text-muted-foreground"}`}>{f.count}</span>
              </Button>
            ))}
            <div className="flex-1" />
            {hasUnmatched && !showSmartMatch && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => setShowSmartMatch(true)}>
                <Sparkles className="h-3.5 w-3.5 text-purple-500" />스마트 매칭
              </Button>
            )}
            {showSmartMatch && (
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowSmartMatch(false)}>
                <X className="h-3 w-3 mr-1" />닫기
              </Button>
            )}
          </div>

          {/* 스마트 매칭 오버레이 */}
          {showSmartMatch ? (
            <SmartMatchPanel
              orders={unlinkedOrders}
              invoices={filteredUnlinkedInvoices}
              vendorId={vendorId}
              year={year}
              onDone={() => setShowSmartMatch(false)}
            />
          ) : (
            <div className="flex-1 overflow-y-auto min-h-0">
              {/* 컬럼 헤더 */}
              <div className="grid grid-cols-[1fr_1fr_1.2fr] text-xs font-medium text-muted-foreground border-b px-4 py-2 bg-muted/30 sticky top-0 z-10">
                <div className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" />계산서</div>
                <div className="flex items-center gap-1.5"><Package className="h-3.5 w-3.5" />발주서</div>
                <div className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />송금내역</div>
              </div>

              {visibleRows.length === 0 ? (
                <div className="flex items-center justify-center h-40 text-muted-foreground text-sm flex-col gap-2">
                  <Check className="h-8 w-8 opacity-30" /><span>항목이 없습니다</span>
                </div>
              ) : (
                <div className="divide-y">
                  {visibleRows.map((row, i) => {
                    // ── 매칭됨 행 ──
                    if (row.kind === "matched") {
                      const { order: o, invoice: inv } = row;
                      return (
                        <div key={`${o.id}-${inv.id}`} className="grid grid-cols-[1fr_1fr_1.2fr] divide-x hover:bg-muted/20">
                          {/* 계산서 */}
                          <div className="px-3 py-3 space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs text-muted-foreground">{inv.invoiceNumber || "번호없음"}</span>
                              <PayBadge payments={inv.payments} />
                            </div>
                            <div className="text-sm font-semibold">{fmt(inv.totalAmount)}</div>
                            <div className="text-xs text-muted-foreground">{inv.issueDate || inv.writeDate || "-"}</div>
                            {inv.item && <div className="text-xs text-muted-foreground truncate">{inv.item}</div>}
                          </div>
                          {/* 발주서 */}
                          <div className="px-3 py-3 space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-mono text-muted-foreground">{o.orderNumber}</span>
                              {o.receivingCompleted && <Badge className="bg-green-100 text-green-700 border-0 text-[10px] py-0 h-4">입고완료</Badge>}
                            </div>
                            <div className="text-sm font-medium truncate">{o.description || "품목 미입력"}</div>
                            <div className="text-sm font-semibold">{fmt(o.totalAmount)}</div>
                            <div className="flex items-center gap-1">
                              <Button size="icon" variant="ghost" className="h-5 w-5 text-muted-foreground hover:text-foreground"
                                onClick={e => openEditOrder(o, e)} title="발주서 편집"><Pencil className="h-3 w-3" /></Button>
                              <Button size="icon" variant="ghost" className="h-5 w-5 text-muted-foreground hover:text-destructive"
                                onClick={() => unlinkMutation.mutate({ orderId: o.id, invoiceId: inv.id })}
                                disabled={unlinkMutation.isPending} title="연결 해제"><Unlink2 className="h-3 w-3" /></Button>
                            </div>
                          </div>
                          {/* 송금내역 */}
                          <div className="px-3 py-3 space-y-1.5">
                            {inv.payments.length === 0 ? (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">미설정</span>
                                <Button size="sm" variant="outline" className="h-5 text-[10px] px-1.5"
                                  onClick={() => { setAddPayInvoiceId(inv.id); setAddPayForm({ amount: String(inv.totalAmount || ""), plannedDate: "" }); }}>
                                  + 추가
                                </Button>
                              </div>
                            ) : (
                              <>
                                {inv.payments.map((p, pi) => (
                                  <div key={pi} className="flex items-center gap-2 text-xs">
                                    {p.status === "completed"
                                      ? <Check className="h-3 w-3 text-green-600 shrink-0" />
                                      : <Clock className="h-3 w-3 text-blue-500 shrink-0" />}
                                    <span className="font-medium">{fmt(p.actualAmount || p.amount)}</span>
                                    <span className="text-muted-foreground">{p.actualDate || p.plannedDate || "-"}</span>
                                  </div>
                                ))}
                                <Button size="sm" variant="ghost" className="h-5 text-[10px] px-1.5 text-muted-foreground"
                                  onClick={() => { setAddPayInvoiceId(inv.id); setAddPayForm({ amount: "", plannedDate: "" }); }}>
                                  + 추가
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    }

                    // ── 계산서만 (발주서 없음) ──
                    if (row.kind === "inv-only") {
                      const inv = row.invoice;
                      return (
                        <div key={inv.id} className="grid grid-cols-[1fr_1fr_1.2fr] divide-x hover:bg-muted/20 bg-orange-50/30 dark:bg-orange-950/10">
                          {/* 계산서 */}
                          <div className="px-3 py-3 space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs text-muted-foreground">{inv.invoiceNumber || "번호없음"}</span>
                              <PayBadge payments={inv.payments} />
                            </div>
                            <div className="text-sm font-semibold">{fmt(inv.totalAmount)}</div>
                            <div className="text-xs text-muted-foreground">{inv.issueDate || inv.writeDate || "-"}</div>
                            {inv.item && <div className="text-xs text-muted-foreground truncate">{inv.item}</div>}
                          </div>
                          {/* 발주서 없음 */}
                          <div className="px-3 py-3 space-y-1.5">
                            <div className="flex items-center gap-1 text-orange-500 text-xs"><AlertCircle className="h-3.5 w-3.5" />발주서 없음</div>
                            {linkingForInvoiceId === inv.id ? (
                              <div className="space-y-1">
                                <select className="w-full text-xs border rounded px-1.5 py-1 bg-background"
                                  onChange={e => { if (e.target.value) { linkMutation.mutate({ orderId: e.target.value, invoiceId: inv.id }); setLinkingForInvoiceId(null); } }}>
                                  <option value="">발주서 선택...</option>
                                  {unlinkedOrders.map(o => (
                                    <option key={o.id} value={o.id}>{o.orderNumber} — {o.description || "품목없음"} ({fmt(o.totalAmount)})</option>
                                  ))}
                                </select>
                                <Button size="sm" variant="ghost" className="h-5 text-[10px] px-1.5"
                                  onClick={() => setLinkingForInvoiceId(null)}>취소</Button>
                              </div>
                            ) : (
                              <Button size="sm" variant="outline" className="h-6 text-xs gap-1"
                                onClick={() => setLinkingForInvoiceId(inv.id)}>
                                <Link2 className="h-3 w-3" />발주서 연결
                              </Button>
                            )}
                          </div>
                          {/* 송금내역 */}
                          <div className="px-3 py-3 space-y-1.5">
                            {inv.payments.length === 0 ? (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">미설정</span>
                                <Button size="sm" variant="outline" className="h-5 text-[10px] px-1.5"
                                  onClick={() => { setAddPayInvoiceId(inv.id); setAddPayForm({ amount: String(inv.totalAmount || ""), plannedDate: "" }); }}>
                                  + 추가
                                </Button>
                              </div>
                            ) : (
                              <>
                                {inv.payments.map((p, pi) => (
                                  <div key={pi} className="flex items-center gap-2 text-xs">
                                    {p.status === "completed"
                                      ? <Check className="h-3 w-3 text-green-600 shrink-0" />
                                      : <Clock className="h-3 w-3 text-blue-500 shrink-0" />}
                                    <span className="font-medium">{fmt(p.actualAmount || p.amount)}</span>
                                    <span className="text-muted-foreground">{p.actualDate || p.plannedDate || "-"}</span>
                                  </div>
                                ))}
                                <Button size="sm" variant="ghost" className="h-5 text-[10px] px-1.5 text-muted-foreground"
                                  onClick={() => { setAddPayInvoiceId(inv.id); setAddPayForm({ amount: "", plannedDate: "" }); }}>
                                  + 추가
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    }

                    // ── 발주서만 (계산서 없음) ──
                    if (row.kind === "ord-only") {
                      const o = row.order;
                      return (
                        <div key={o.id} className="grid grid-cols-[1fr_1fr_1.2fr] divide-x hover:bg-muted/20 bg-blue-50/30 dark:bg-blue-950/10">
                          {/* 계산서 없음 */}
                          <div className="px-3 py-3 flex items-center gap-1 text-muted-foreground text-xs">
                            <AlertCircle className="h-3.5 w-3.5 text-blue-400" />계산서 없음
                          </div>
                          {/* 발주서 */}
                          <div className="px-3 py-3 space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-mono text-muted-foreground">{o.orderNumber}</span>
                              {o.receivingCompleted && <Badge className="bg-green-100 text-green-700 border-0 text-[10px] py-0 h-4">입고완료</Badge>}
                            </div>
                            <div className="text-sm font-medium truncate">{o.description || "품목 미입력"}</div>
                            <div className="text-sm font-semibold">{fmt(o.totalAmount)}</div>
                            {o.expectedDeliveryDate && <div className="text-xs text-muted-foreground">납기: {o.expectedDeliveryDate}</div>}
                            <Button size="icon" variant="ghost" className="h-5 w-5 text-muted-foreground hover:text-foreground"
                              onClick={e => openEditOrder(o, e)} title="발주서 편집"><Pencil className="h-3 w-3" /></Button>
                          </div>
                          {/* 송금 없음 */}
                          <div className="px-3 py-3 text-xs text-muted-foreground">-</div>
                        </div>
                      );
                    }

                    return null;
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 결제계획 추가 모달 */}
      <Dialog open={!!addPayInvoiceId} onOpenChange={open => { if (!open) setAddPayInvoiceId(null); }}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle className="text-sm">결제계획 추가</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label className="text-xs">금액</Label>
              <Input className="mt-1 h-8 text-sm" value={addPayForm.amount}
                onChange={e => setAddPayForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" />
            </div>
            <div>
              <Label className="text-xs">결제예정일</Label>
              <Input type="date" className="mt-1 h-8 text-sm" value={addPayForm.plannedDate}
                onChange={e => setAddPayForm(f => ({ ...f, plannedDate: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAddPayInvoiceId(null)}>취소</Button>
            <Button size="sm" disabled={!addPayForm.amount || !addPayForm.plannedDate || createPaymentMutation.isPending}
              onClick={() => createPaymentMutation.mutate({
                invoiceId: addPayInvoiceId!,
                amount: parseInt(addPayForm.amount.replace(/,/g, "")),
                plannedDate: addPayForm.plannedDate,
              })}>
              {createPaymentMutation.isPending ? "추가 중..." : "추가"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 발주서 편집 모달 */}
      <Dialog open={!!editOrder} onOpenChange={open => { if (!open) setEditOrder(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">발주서 편집 — {editOrder?.orderNumber}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label className="text-xs">품목/내용</Label>
              <Input
                className="mt-1 h-8 text-sm"
                value={editForm.description}
                onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                placeholder="품목명 입력"
              />
            </div>
            <div>
              <Label className="text-xs">공급가액</Label>
              <Input
                className="mt-1 h-8 text-sm"
                value={editForm.supplyAmount}
                onChange={e => handleSupplyChange(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">세액</Label>
                <Input
                  className="mt-1 h-8 text-sm"
                  value={editForm.taxAmount}
                  onChange={e => setEditForm(f => ({ ...f, taxAmount: e.target.value, totalAmount: String((parseInt(editForm.supplyAmount.replace(/,/g,""))||0) + (parseInt(e.target.value.replace(/,/g,""))||0)) }))}
                  placeholder="0"
                />
              </div>
              <div>
                <Label className="text-xs">합계</Label>
                <Input
                  className="mt-1 h-8 text-sm bg-muted"
                  value={editForm.totalAmount}
                  readOnly
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">납기일</Label>
              <Input
                type="date"
                className="mt-1 h-8 text-sm"
                value={editForm.expectedDeliveryDate}
                onChange={e => setEditForm(f => ({ ...f, expectedDeliveryDate: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditOrder(null)}>취소</Button>
            <Button size="sm" onClick={handleEditSave} disabled={editOrderMutation.isPending}>
              {editOrderMutation.isPending ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
