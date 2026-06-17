import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { useState, useMemo, useCallback, useEffect, memo } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Plus, ExternalLink, RefreshCw, Loader2, CalendarIcon, X, Star, ArrowUpDown, ArrowUp, ArrowDown, Check, Building2, CalendarClock, Globe } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ko } from "date-fns/locale";
import { InquiryFormDialog } from "@/pages/inquiry-form";
import { InquiryDetailDialog } from "@/pages/inquiry-detail";
import type { Inquiry } from "@shared/schema";

type InquiryWithTradeStatus = Inquiry & { isExistingCustomer: boolean; hasContacts: boolean; contactCount: number };

function parseDateString(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const statusLabels: Record<string, string> = {
  none: "-",
  active: "진행중",
  quoted: "견적발송",
  won: "수주",
  lost: "실주",
};

const statusVariants: Record<string, "default" | "secondary" | "destructive"> = {
  none: "secondary",
  active: "default",
  quoted: "default",
  won: "default",
  lost: "destructive",
};

const statusRowClass: Record<string, string> = {
  none: "",
  active: "",
  quoted: "bg-blue-50 dark:bg-blue-950/30",
  won: "bg-green-50 dark:bg-green-950/30",
  lost: "bg-red-50 dark:bg-red-950/30",
};

type InquiryRowProps = {
  inq: InquiryWithTradeStatus;
  onInlineUpdate: (id: string, data: Partial<Inquiry>) => void;
  onFavorite: (id: string) => void;
  onAcknowledge: (id: string) => void;
  onSelect: (id: string) => void;
  onScan: (id: string) => void;
  scanningId: string | null;
};

const InquiryRow = memo(function InquiryRow({ inq, onInlineUpdate, onFavorite, onAcknowledge, onSelect, onScan, scanningId }: InquiryRowProps) {
  return (
    <TableRow
      className={`cursor-pointer hover-elevate ${inq.isWebInquiry ? "bg-orange-50 dark:bg-orange-950/30" : statusRowClass[inq.status || "none"] || ""}`}
      onClick={() => onSelect(inq.id)}
      data-testid={`row-inquiry-${inq.id}`}
    >
      <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1 justify-center">
          {inq.isWebInquiry && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={(e) => { e.stopPropagation(); onAcknowledge(inq.id); }}
                  className="hover:scale-110 transition-transform"
                  data-testid={`button-acknowledge-${inq.id}`}
                >
                  <Globe className="h-4 w-4 text-orange-500 animate-pulse" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>홈페이지 신규 문의 (클릭하여 확인)</p>
              </TooltipContent>
            </Tooltip>
          )}
          <button
            onClick={() => onFavorite(inq.id)}
            className="hover:scale-110 transition-transform"
            data-testid={`button-favorite-${inq.id}`}
          >
            <Star
              className={`h-4 w-4 ${inq.isFavorite ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40 hover:text-yellow-400"}`}
            />
          </button>
        </div>
      </TableCell>
      <TableCell className="font-mono text-sm">{inq.inquiryNumber}</TableCell>
      <TableCell className="font-medium">
        <div className="flex items-center gap-1.5">
          {inq.customerName}
          {inq.customerId && inq.hasContacts ? (
            <Check className="h-3.5 w-3.5 text-green-500" data-testid={`icon-linked-${inq.id}`} />
          ) : inq.customerId ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex"
                  onClick={(e) => { e.stopPropagation(); onSelect(inq.id); }}
                  data-testid={`icon-partial-${inq.id}`}
                >
                  <Building2 className="h-3.5 w-3.5 text-orange-500" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>담당자 미등록</p>
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">{inq.productInfo || "-"}</TableCell>
      <TableCell>{inq.year}</TableCell>
      <TableCell onClick={(e) => e.stopPropagation()}>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="text-xs border-dashed font-normal w-32 justify-start"
              data-testid={`button-created-date-${inq.id}`}
            >
              <CalendarIcon className="mr-1 h-3 w-3" />
              {inq.createdAt ? (() => {
                const d = new Date(inq.createdAt);
                const isBackfilled = d.getMonth() === 0 && d.getDate() === 1;
                return (
                  <div className="flex items-center gap-1">
                    <span>{d.toISOString().split('T')[0]}</span>
                    {isBackfilled && <Badge variant="outline" className="text-[10px] px-1 py-0 text-orange-500 border-orange-300">예전</Badge>}
                  </div>
                );
              })() : "날짜 선택"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={inq.createdAt ? new Date(inq.createdAt) : undefined}
              onSelect={(date) => {
                if (date) {
                  onInlineUpdate(inq.id, { createdAt: date.toISOString() } as any);
                }
              }}
              locale={ko}
            />
          </PopoverContent>
        </Popover>
      </TableCell>
      <TableCell onClick={(e) => e.stopPropagation()}>
        <Select
          value={String(inq.probability || 0)}
          onValueChange={(v) => onInlineUpdate(inq.id, { probability: parseInt(v) })}
        >
          <SelectTrigger className="w-28 text-xs border-dashed" data-testid={`select-stage-${inq.id}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">-</SelectItem>
            <SelectItem value="1">1.문의</SelectItem>
            <SelectItem value="2">2.미팅</SelectItem>
            <SelectItem value="3">3.사양협의</SelectItem>
            <SelectItem value="4">4.비딩</SelectItem>
            <SelectItem value="5">5.발주전</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell onClick={(e) => e.stopPropagation()}>
        <Select
          value={inq.status || "none"}
          onValueChange={(v) => onInlineUpdate(inq.id, { status: v })}
        >
          <SelectTrigger className="w-24 text-xs border-dashed" data-testid={`select-status-inline-${inq.id}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">-</SelectItem>
            <SelectItem value="active">진행중</SelectItem>
            <SelectItem value="quoted">견적발송</SelectItem>
            <SelectItem value="won">수주</SelectItem>
            <SelectItem value="lost">실주</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell onClick={(e) => e.stopPropagation()}>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="text-xs border-dashed font-normal w-32 justify-start"
              data-testid={`button-date-${inq.id}`}
            >
              <CalendarIcon className="mr-1 h-3 w-3" />
              {inq.expectedDate || "날짜 선택"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={inq.expectedDate ? parseDateString(inq.expectedDate) : undefined}
              onSelect={(date) => {
                if (date) {
                  const y = date.getFullYear();
                  const m = String(date.getMonth() + 1).padStart(2, '0');
                  const d = String(date.getDate()).padStart(2, '0');
                  onInlineUpdate(inq.id, { expectedDate: `${y}-${m}-${d}` });
                }
              }}
              locale={ko}
            />
            {inq.expectedDate && (
              <div className="p-2 border-t">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => onInlineUpdate(inq.id, { expectedDate: null })}
                  data-testid={`button-clear-date-${inq.id}`}
                >
                  <X className="mr-1 h-3 w-3" />
                  날짜 지우기
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>
      </TableCell>
      <TableCell className="text-xs text-right" data-testid={`text-sales-${inq.id}`}>
        {inq.lastQuoteSales ? inq.lastQuoteSales.toLocaleString() : "-"}
      </TableCell>
      <TableCell className="text-xs text-right" data-testid={`text-cost-${inq.id}`}>
        {inq.lastQuoteCost ? inq.lastQuoteCost.toLocaleString() : "-"}
      </TableCell>
      <TableCell className="text-xs text-right" data-testid={`text-margin-${inq.id}`}>
        {inq.lastQuoteMargin != null ? (
          <span className={inq.lastQuoteMargin >= 0 ? "text-green-600" : "text-red-600"}>
            {inq.lastQuoteMargin.toLocaleString()}
          </span>
        ) : "-"}
      </TableCell>
      <TableCell onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-0.5">
          {inq.onedriveFolderId && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              disabled={scanningId === inq.id}
              onClick={() => onScan(inq.id)}
              title="엑셀 스캔 (발생일자/고객정보 취득)"
              data-testid={`button-scan-${inq.id}`}
            >
              {scanningId === inq.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </Button>
          )}
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onSelect(inq.id)}>
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
});

const stageLabels: Record<number, string> = {
  0: "-",
  1: "1.문의",
  2: "2.미팅",
  3: "3.사양협의",
  4: "4.비딩",
  5: "5.발주전",
};

export default function InquiryList() {
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const [search, setSearch] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const { toast } = useToast();

  const urlParamsInit = new URLSearchParams(searchString);
  const detailParam = urlParamsInit.get("detail");
  const [selectedInquiryId, setSelectedInquiryId] = useState<string | null>(detailParam);

  useEffect(() => {
    if (detailParam && detailParam !== selectedInquiryId) {
      setSelectedInquiryId(detailParam);
    }
  }, [detailParam]);

  const handleCloseDetail = useCallback((open: boolean) => {
    if (!open) {
      setSelectedInquiryId(null);
      if (detailParam) {
        const params = new URLSearchParams(searchString);
        params.delete("detail");
        const qs = params.toString();
        navigate(qs ? `/inquiries?${qs}` : "/inquiries", { replace: true });
      }
    }
  }, [detailParam, searchString, navigate]);

  const [bulkRescanRunning, setBulkRescanRunning] = useState(false);
  const [bulkRescanProgress, setBulkRescanProgress] = useState("");

  const handleBulkRescanDates = useCallback(async () => {
    setBulkRescanRunning(true);
    setBulkRescanProgress("시작 중...");
    try {
      const res = await apiRequest("POST", "/api/inquiries/bulk-rescan-dates");
      const data = await res.json();
      toast({ title: data.message || "일괄 갱신 시작", description: `총 ${data.total || 0}건 처리 예정` });

      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch("/api/inquiries/bulk-rescan-dates/status");
          const status = await statusRes.json();
          setBulkRescanProgress(`${status.processed || 0}/${status.total || 0} 처리 중...`);
          if (!status.running) {
            clearInterval(pollInterval);
            setBulkRescanRunning(false);
            setBulkRescanProgress("");
            toast({ title: "일괄 갱신 완료", description: `${status.updated || 0}건 갱신, ${status.failed || 0}건 실패` });
            queryClient.invalidateQueries({ queryKey: ["/api/inquiries"] });
          }
        } catch {
          clearInterval(pollInterval);
          setBulkRescanRunning(false);
          setBulkRescanProgress("");
        }
      }, 2000);
    } catch (err: any) {
      toast({ title: "일괄 갱신 실패", description: err.message, variant: "destructive" });
      setBulkRescanRunning(false);
      setBulkRescanProgress("");
    }
  }, [toast]);

  const [sortColumn, setSortColumn] = useState<string>("createdAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const handleSort = useCallback((column: string) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection(column === "createdAt" || column === "expectedDate" ? "desc" : "asc");
    }
  }, [sortColumn]);

  const urlParams = new URLSearchParams(searchString);
  const hasAnyParam = urlParams.has("year") || urlParams.has("status") || urlParams.has("customer") || urlParams.has("period") || urlParams.has("expectedMonth") || urlParams.has("view");
  const viewFilter = urlParams.get("view") || (!hasAnyParam ? "6m" : "");
  const yearFilter = urlParams.get("year") || "all";
  const statusFilter = urlParams.get("status") || "all";
  const customerFilter = urlParams.get("customer") || "all";
  const periodFilter = viewFilter === "6m" ? "6m" : viewFilter === "1y" ? "1y" : (urlParams.get("period") || "");
  const expectedMonthFilter = urlParams.get("expectedMonth") || "";

  const handleYearChange = (value: string) => {
    const params = new URLSearchParams(searchString);
    params.delete("view");
    if (value === "3m" || value === "6m") {
      params.delete("year");
      params.set("period", value);
    } else {
      params.delete("period");
      if (value === "all") {
        params.delete("year");
      } else {
        params.set("year", value);
      }
    }
    const qs = params.toString();
    navigate(qs ? `/inquiries?${qs}` : "/inquiries?view=all");
  };

  const handleStatusChange = (value: string) => {
    const params = new URLSearchParams(searchString);
    params.delete("view");
    if (value === "all") {
      params.delete("status");
    } else {
      params.set("status", value);
    }
    const qs = params.toString();
    navigate(qs ? `/inquiries?${qs}` : "/inquiries?view=all");
  };

  const handleCustomerFilterChange = (value: string) => {
    const params = new URLSearchParams(searchString);
    params.delete("view");
    if (value === "all") {
      params.delete("customer");
    } else {
      params.set("customer", value);
    }
    const qs = params.toString();
    navigate(qs ? `/inquiries?${qs}` : "/inquiries?view=all");
  };

  const handleQuickView = (view: string) => {
    if (view === "all") {
      navigate("/inquiries?view=all");
    } else if (view === "6m") {
      navigate("/inquiries?view=6m");
    } else if (view === "1y") {
      navigate("/inquiries?view=1y");
    } else if (view === "webInquiry") {
      navigate("/inquiries?customer=webInquiry");
    } else if (view === "bookmarked") {
      navigate("/inquiries?customer=bookmarked");
    } else {
      navigate(`/inquiries?status=${view}`);
    }
  };

  const activeQuickView = useMemo(() => {
    if (customerFilter === "webInquiry") return "webInquiry";
    if (customerFilter === "bookmarked") return "bookmarked";
    if (viewFilter === "6m") return "6m";
    if (viewFilter === "1y") return "1y";
    if (viewFilter === "all") return "all";
    if (statusFilter !== "all" && yearFilter === "all" && customerFilter === "all") return statusFilter;
    return "";
  }, [viewFilter, statusFilter, yearFilter, customerFilter]);

  const handleExpectedMonthToggle = (offset: string) => {
    const params = new URLSearchParams(searchString);
    if (expectedMonthFilter === offset) {
      params.delete("expectedMonth");
    } else {
      params.set("expectedMonth", offset);
    }
    const qs = params.toString();
    navigate(qs ? `/inquiries?${qs}` : "/inquiries");
  };

  const { data: years } = useQuery<number[]>({
    queryKey: ["/api/years"],
  });

  const { data: onedriveYears } = useQuery<number[]>({
    queryKey: ["/api/onedrive/years"],
  });

  const activeYearSelectValue = periodFilter || yearFilter;

  const queryParams = new URLSearchParams();
  if (yearFilter !== "all" && !periodFilter) queryParams.set("year", yearFilter);
  if (statusFilter !== "all") queryParams.set("status", statusFilter);
  const queryString = queryParams.toString();

  const { data: inquiries, isLoading } = useQuery<InquiryWithTradeStatus[]>({
    queryKey: ["/api/inquiries", queryString ? `?${queryString}` : ""],
  });

  const syncMutation = useMutation({
    mutationFn: async (year?: number) => {
      const res = await apiRequest("POST", "/api/sync-onedrive", year ? { year } : {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/inquiries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/years"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      toast({
        title: "동기화 완료",
        description: `${data.synced}개 새로 추가 (총 ${data.total}개 폴더 중 ${data.skipped}개 건너뜀)`,
      });
    },
    onError: (err: any) => {
      toast({
        title: "동기화 실패",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const [scanningId, setScanningId] = useState<string | null>(null);
  const scanMutation = useMutation({
    mutationFn: async (id: string) => {
      setScanningId(id);
      const res = await apiRequest("POST", `/api/inquiries/${id}/scan-excel`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/inquiries"] });
      const count = data.scanned?.length || 0;
      toast({
        title: "스캔 완료",
        description: `${count}건의 고객정보를 취득했습니다`,
      });
      setScanningId(null);
    },
    onError: (err: any) => {
      toast({ title: "스캔 실패", description: err.message, variant: "destructive" });
      setScanningId(null);
    },
  });

  const inlineUpdateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Inquiry> }) => {
      const res = await apiRequest("PATCH", `/api/inquiries/${id}`, data);
      return res.json();
    },
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/inquiries"], exact: false });
      const allCaches = queryClient.getQueriesData<Inquiry[]>({ queryKey: ["/api/inquiries"] });
      const snapshots = allCaches.map(([key, val]) => [key, val] as const);
      allCaches.forEach(([key, list]) => {
        if (Array.isArray(list)) {
          queryClient.setQueryData<Inquiry[]>(key, list.map(inq =>
            inq.id === id ? { ...inq, ...data } : inq
          ));
        }
      });
      return { snapshots, id, data };
    },
    onSuccess: (serverData, { id }) => {
      const allCaches = queryClient.getQueriesData<Inquiry[]>({ queryKey: ["/api/inquiries"] });
      allCaches.forEach(([key, list]) => {
        if (Array.isArray(list)) {
          queryClient.setQueryData<Inquiry[]>(key, list.map(inq =>
            inq.id === id ? { ...inq, ...serverData } : inq
          ));
        }
      });
    },
    onError: (err: any, { id, data }, context) => {
      if (context?.snapshots) {
        context.snapshots.forEach(([key, val]) => {
          if (val) queryClient.setQueryData(key, val);
        });
      }
      toast({
        title: "수정 실패",
        description: err.message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    },
  });

  const handleInlineUpdate = useCallback((id: string, data: Partial<Inquiry>) => {
    if (data.status === "won") {
      data.isFavorite = false;
    }
    inlineUpdateMutation.mutate({ id, data });
  }, [inlineUpdateMutation]);

  const handleSelectInquiry = useCallback((id: string) => {
    setSelectedInquiryId(id);
  }, []);

  const handleScan = useCallback((id: string) => {
    scanMutation.mutate(id);
  }, [scanMutation]);

  const favoriteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/inquiries/${id}/favorite`);
      return res.json();
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["/api/inquiries"], exact: false });
      const allCaches = queryClient.getQueriesData<Inquiry[]>({ queryKey: ["/api/inquiries"] });
      const snapshots = allCaches.map(([key, val]) => [key, val] as const);
      allCaches.forEach(([key, list]) => {
        if (Array.isArray(list)) {
          queryClient.setQueryData<Inquiry[]>(key, list.map(inq =>
            inq.id === id ? { ...inq, isFavorite: !inq.isFavorite } : inq
          ));
        }
      });
      return { snapshots };
    },
    onError: (_err, _id, context) => {
      if (context?.snapshots) {
        context.snapshots.forEach(([key, val]) => {
          if (val) queryClient.setQueryData(key, val);
        });
      }
      toast({ title: "북마크 변경 실패", variant: "destructive" });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inquiries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers-with-stats"] });
    },
  });

  const handleFavorite = useCallback((id: string) => {
    favoriteMutation.mutate(id);
  }, [favoriteMutation]);

  const acknowledgeMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("PATCH", `/api/inquiries/${id}/acknowledge`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inquiries"] });
      toast({ title: "확인 완료", description: "웹 문의가 확인 처리되었습니다." });
    },
  });

  const handleAcknowledge = useCallback((id: string) => {
    acknowledgeMutation.mutate(id);
  }, [acknowledgeMutation]);

  const filtered = useMemo(() => {
    if (!inquiries) return [];
    let list = inquiries;
    if (periodFilter) {
      const now = new Date();
      let cutoff: Date;
      if (periodFilter === "3m") {
        cutoff = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
      } else if (periodFilter === "6m") {
        cutoff = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
      } else {
        cutoff = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      }
      list = list.filter(i => {
        if (i.createdAt) {
          return new Date(i.createdAt) >= cutoff;
        }
        return (i.year || 0) >= cutoff.getFullYear();
      });
    }
    if (customerFilter === "existing") {
      list = list.filter(i => i.isExistingCustomer);
    } else if (customerFilter === "new") {
      list = list.filter(i => !i.isExistingCustomer);
    } else if (customerFilter === "webInquiry") {
      list = list.filter(i => i.isWebInquiry);
    } else if (customerFilter === "bookmarked") {
      list = list.filter(i => i.isFavorite);
    }

    if (expectedMonthFilter !== "") {
      const now = new Date();
      const offset = parseInt(expectedMonthFilter);
      const target = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      const monthStr = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}`;
      list = list.filter(i => i.expectedDate && i.expectedDate.startsWith(monthStr));
    }

    if (search) {
      const s = search.toLowerCase();
      list = list.filter(i =>
        i.customerName.toLowerCase().includes(s) ||
        i.inquiryNumber.toLowerCase().includes(s) ||
        (i.productInfo && i.productInfo.toLowerCase().includes(s)) ||
        (i.snapshotAddress && i.snapshotAddress.toLowerCase().includes(s)) ||
        (i.snapshotContactName && i.snapshotContactName.toLowerCase().includes(s)) ||
        (i.snapshotEmail && i.snapshotEmail.toLowerCase().includes(s)) ||
        (i.snapshotPhone && i.snapshotPhone.toLowerCase().includes(s))
      );
    }

    return list.sort((a, b) => {
      // 번호순 정렬일 때는 웹문의/즐겨찾기 상단 고정을 풀어 순수 번호 순서로 본다
      if (sortColumn !== "salesNumber") {
        if (a.isWebInquiry && !b.isWebInquiry) return -1;
        if (!a.isWebInquiry && b.isWebInquiry) return 1;
        if (a.isFavorite && !b.isFavorite) return -1;
        if (!a.isFavorite && b.isFavorite) return 1;
      }

      const dir = sortDirection === "asc" ? 1 : -1;
      let valA: string | number | null = null;
      let valB: string | number | null = null;
      switch (sortColumn) {
        case "salesNumber": {
          const numA = a.inquiryNumber || "";
          const numB = b.inquiryNumber || "";
          const partsA = String(numA).match(/^(\d+)-(\d+)$/);
          const partsB = String(numB).match(/^(\d+)-(\d+)$/);
          if (partsA && partsB) {
            const prefixDiff = Number(partsA[1]) - Number(partsB[1]);
            if (prefixDiff !== 0) return prefixDiff * dir;
            return (Number(partsA[2]) - Number(partsB[2])) * dir;
          }
          return String(numA).localeCompare(String(numB)) * dir;
        }
        case "customerName":
          valA = a.customerName;
          valB = b.customerName;
          break;
        case "productInfo":
          valA = a.productInfo || "";
          valB = b.productInfo || "";
          break;
        case "year":
          valA = a.year;
          valB = b.year;
          break;
        case "createdAt":
          valA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          valB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return (Number(valA) - Number(valB)) * dir;
        case "probability":
          valA = a.probability || 0;
          valB = b.probability || 0;
          return (Number(valA) - Number(valB)) * dir;
        case "status":
          valA = a.status || "";
          valB = b.status || "";
          break;
        case "expectedDate":
          valA = a.expectedDate || "";
          valB = b.expectedDate || "";
          break;
        default:
          return 0;
      }
      if (valA === valB) return 0;
      if (typeof valA === "number" && typeof valB === "number") return (valA - valB) * dir;
      return String(valA).localeCompare(String(valB)) * dir;
    });
  }, [inquiries, search, periodFilter, customerFilter, expectedMonthFilter, sortColumn, sortDirection]);

  const syncYearOptions = useMemo(() => {
    const allYears = new Set<number>();
    (years || []).forEach(y => allYears.add(y));
    (onedriveYears || []).forEach(y => allYears.add(y));
    return Array.from(allYears).sort((a, b) => b - a);
  }, [years, onedriveYears]);

  return (
    <div className="p-6 space-y-4 overflow-auto h-full">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-semibold" data-testid="text-inquiry-list-title">인콰이어리 목록</h1>
        <div className="flex gap-2">
          <Select
            onValueChange={(v) => {
              if (v === "all") {
                syncMutation.mutate(undefined);
              } else {
                syncMutation.mutate(parseInt(v));
              }
            }}
            disabled={syncMutation.isPending}
          >
            <SelectTrigger className="w-44" data-testid="select-sync-year">
              {syncMutation.isPending ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  동기화 중...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4" />
                  OneDrive 동기화
                </span>
              )}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 연도 동기화</SelectItem>
              {syncYearOptions.map(y => (
                <SelectItem key={y} value={String(y)}>{y}년 동기화</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => setShowAddDialog(true)} data-testid="button-add-inquiry">
            <Plus />
            <span>추가</span>
          </Button>
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap" data-testid="quick-view-buttons">
        {[
          { key: "6m", label: "최근 6개월" },
          { key: "all", label: "전체" },
          { key: "active", label: "진행중" },
          { key: "quoted", label: "견적발송" },
          { key: "won", label: "수주" },
          { key: "lost", label: "실주" },
          { key: "webInquiry", label: "웹 문의" },
          { key: "bookmarked", label: "북마크" },
          { key: "1y", label: "최근 1년" },
        ].map(({ key, label }) => (
          <Button
            key={key}
            variant={activeQuickView === key ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => handleQuickView(key)}
            data-testid={`button-quick-${key}`}
          >
            {label}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="고객명, 영업번호, 주소, 담당자, 이메일, 전화번호, 제품..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                data-testid="input-search"
              />
            </div>
            <Select value={activeYearSelectValue} onValueChange={handleYearChange}>
              <SelectTrigger className="w-32" data-testid="select-year">
                <SelectValue placeholder="연도" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 연도</SelectItem>
                <SelectItem value="3m">최근 3개월</SelectItem>
                <SelectItem value="6m">최근 6개월</SelectItem>
                {(years || []).map(y => (
                  <SelectItem key={y} value={String(y)}>{y}년</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={handleStatusChange}>
              <SelectTrigger className="w-32" data-testid="select-status">
                <SelectValue placeholder="상태" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 상태</SelectItem>
                <SelectItem value="none">-</SelectItem>
                <SelectItem value="active">진행중</SelectItem>
                <SelectItem value="quoted">견적발송</SelectItem>
                <SelectItem value="won">수주</SelectItem>
                <SelectItem value="lost">실주</SelectItem>
              </SelectContent>
            </Select>
            <Select value={customerFilter} onValueChange={handleCustomerFilterChange}>
              <SelectTrigger className="w-32" data-testid="select-customer-filter">
                <SelectValue placeholder="고객구분" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 고객</SelectItem>
                <SelectItem value="existing">연결됨</SelectItem>
                <SelectItem value="new">미연결</SelectItem>
                <SelectItem value="webInquiry">웹 문의</SelectItem>
                <SelectItem value="bookmarked">북마크</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-1.5 mt-2 items-center">
            {[
              { offset: "0", label: "이번달 예정" },
              { offset: "1", label: "다음달 예정" },
              { offset: "2", label: "다다음달 예정" },
            ].map(({ offset, label }) => (
              <Button
                key={offset}
                variant={expectedMonthFilter === offset ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => handleExpectedMonthToggle(offset)}
                data-testid={`button-expected-month-${offset}`}
              >
                {label}
              </Button>
            ))}
            <div className="ml-auto">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={handleBulkRescanDates}
                    disabled={bulkRescanRunning}
                    data-testid="button-bulk-rescan-dates"
                  >
                    {bulkRescanRunning ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <CalendarClock className="h-3 w-3" />
                    )}
                    {bulkRescanRunning ? bulkRescanProgress : "발생일자 갱신"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>OneDrive 폴더 생성일자를 일괄로 다시 가져옵니다</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12" />)}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  {[
                    { key: "salesNumber", label: "영업번호" },
                    { key: "customerName", label: "고객명" },
                    { key: "productInfo", label: "제품정보" },
                    { key: "year", label: "연도" },
                    { key: "createdAt", label: "발생일자" },
                    { key: "probability", label: "단계" },
                    { key: "status", label: "상태" },
                    { key: "expectedDate", label: "예상일자" },
                    { key: "lastQuoteSales", label: "판매가" },
                    { key: "lastQuoteCost", label: "원가" },
                    { key: "lastQuoteMargin", label: "마진" },
                  ].map(({ key, label }) => (
                    <TableHead
                      key={key}
                      className="cursor-pointer select-none hover:bg-muted/50"
                      onClick={() => handleSort(key)}
                    >
                      <div className="flex items-center gap-1">
                        {label}
                        {sortColumn === key ? (
                          sortDirection === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3 text-muted-foreground/40" />
                        )}
                      </div>
                    </TableHead>
                  ))}
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={13} className="text-center text-muted-foreground py-8">
                      {search ? "검색 결과가 없습니다" : "인콰이어리가 없습니다. OneDrive를 동기화하거나 새로 추가하세요."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((inq) => (
                    <InquiryRow
                      key={inq.id}
                      inq={inq}
                      onInlineUpdate={handleInlineUpdate}
                      onFavorite={handleFavorite}
                      onAcknowledge={handleAcknowledge}
                      onSelect={handleSelectInquiry}
                      onScan={handleScan}
                      scanningId={scanningId}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="text-sm text-muted-foreground" data-testid="text-result-count">
        총 {filtered.length}건
        {filtered.length > 0 && customerFilter === "all" && (
          <span className="ml-2">
            (연결 {filtered.filter(i => i.customerId).length} / 미연결 {filtered.filter(i => !i.customerId).length})
          </span>
        )}
      </div>

      <InquiryFormDialog open={showAddDialog} onOpenChange={setShowAddDialog} />
      <InquiryDetailDialog
        inquiryId={selectedInquiryId}
        open={!!selectedInquiryId}
        onOpenChange={handleCloseDetail}
      />
    </div>
  );
}
