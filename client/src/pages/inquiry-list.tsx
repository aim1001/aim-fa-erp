import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { useState, useMemo, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Plus, ExternalLink, RefreshCw, Loader2, CalendarIcon, X, Link2, AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ko } from "date-fns/locale";
import { InquiryFormDialog } from "@/pages/inquiry-form";
import type { Inquiry } from "@shared/schema";

function parseDateString(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const statusLabels: Record<string, string> = {
  none: "-",
  active: "진행중",
  won: "수주",
  lost: "실주",
};

const statusVariants: Record<string, "default" | "secondary" | "destructive"> = {
  none: "secondary",
  active: "default",
  won: "default",
  lost: "destructive",
};

const statusRowClass: Record<string, string> = {
  none: "",
  active: "",
  won: "bg-green-50 dark:bg-green-950/30",
  lost: "bg-red-50 dark:bg-red-950/30",
};

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

  const urlParams = new URLSearchParams(searchString);
  const yearFilter = urlParams.get("year") || "all";
  const statusFilter = urlParams.get("status") || "all";

  const handleYearChange = (value: string) => {
    const params = new URLSearchParams(searchString);
    if (value === "all") {
      params.delete("year");
    } else {
      params.set("year", value);
    }
    const qs = params.toString();
    navigate(qs ? `/inquiries?${qs}` : "/inquiries");
  };

  const handleStatusChange = (value: string) => {
    const params = new URLSearchParams(searchString);
    if (value === "all") {
      params.delete("status");
    } else {
      params.set("status", value);
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

  const queryParams = new URLSearchParams();
  if (yearFilter !== "all") queryParams.set("year", yearFilter);
  if (statusFilter !== "all") queryParams.set("status", statusFilter);
  const queryString = queryParams.toString();

  const { data: inquiries, isLoading } = useQuery<Inquiry[]>({
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

  const inlineUpdateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Inquiry> }) => {
      const res = await apiRequest("PATCH", `/api/inquiries/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inquiries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    },
    onError: (err: any) => {
      toast({
        title: "수정 실패",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const handleInlineUpdate = useCallback((id: string, data: Partial<Inquiry>) => {
    inlineUpdateMutation.mutate({ id, data });
  }, []);

  const filtered = useMemo(() => {
    if (!inquiries) return [];
    if (!search) return inquiries;
    const s = search.toLowerCase();
    return inquiries.filter(i =>
      i.customerName.toLowerCase().includes(s) ||
      i.inquiryNumber.toLowerCase().includes(s) ||
      (i.productInfo && i.productInfo.toLowerCase().includes(s))
    );
  }, [inquiries, search]);

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

      <Card>
        <CardContent className="pt-4">
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="고객명, 영업번호 검색..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                data-testid="input-search"
              />
            </div>
            <Select value={yearFilter} onValueChange={handleYearChange}>
              <SelectTrigger className="w-32" data-testid="select-year">
                <SelectValue placeholder="연도" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 연도</SelectItem>
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
                <SelectItem value="won">수주</SelectItem>
                <SelectItem value="lost">실주</SelectItem>
              </SelectContent>
            </Select>
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
                  <TableHead>영업번호</TableHead>
                  <TableHead>고객명</TableHead>
                  <TableHead>제품정보</TableHead>
                  <TableHead>연도</TableHead>
                  <TableHead>단계</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>예상일자</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      {search ? "검색 결과가 없습니다" : "인콰이어리가 없습니다. OneDrive를 동기화하거나 새로 추가하세요."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((inq) => (
                    <TableRow
                      key={inq.id}
                      className={`cursor-pointer hover-elevate ${statusRowClass[inq.status || "none"] || ""}`}
                      onClick={() => navigate(`/inquiries/${inq.id}`)}
                      data-testid={`row-inquiry-${inq.id}`}
                    >
                      <TableCell className="font-mono text-sm">{inq.inquiryNumber}</TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-1.5">
                          {inq.customerName}
                          {inq.customerId ? (
                            <Link2 className="h-3 w-3 text-primary shrink-0" />
                          ) : (
                            <AlertCircle className="h-3 w-3 text-amber-500 shrink-0" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{inq.productInfo || "-"}</TableCell>
                      <TableCell>{inq.year}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Select
                          value={String(inq.probability || 0)}
                          onValueChange={(v) => handleInlineUpdate(inq.id, { probability: parseInt(v) })}
                          disabled={inlineUpdateMutation.isPending}
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
                          onValueChange={(v) => handleInlineUpdate(inq.id, { status: v })}
                          disabled={inlineUpdateMutation.isPending}
                        >
                          <SelectTrigger className="w-24 text-xs border-dashed" data-testid={`select-status-inline-${inq.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">-</SelectItem>
                            <SelectItem value="active">진행중</SelectItem>
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
                              disabled={inlineUpdateMutation.isPending}
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
                                  handleInlineUpdate(inq.id, { expectedDate: `${y}-${m}-${d}` });
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
                                  onClick={() => handleInlineUpdate(inq.id, { expectedDate: null })}
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
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); navigate(`/inquiries/${inq.id}`); }}>
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="text-sm text-muted-foreground" data-testid="text-result-count">
        총 {filtered.length}건
      </div>

      <InquiryFormDialog open={showAddDialog} onOpenChange={setShowAddDialog} />
    </div>
  );
}
