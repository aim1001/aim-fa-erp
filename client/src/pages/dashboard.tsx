import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { FileText, TrendingUp, Target, Calendar, XCircle, Clock, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Plus, Globe, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { InquiryDetailDialog } from "@/pages/inquiry-detail";
import { InquiryFormDialog } from "@/pages/inquiry-form";
import { TaskListCard } from "@/components/task-list-card";
import { ProjectDetailModal } from "@/pages/project-list";
import { Dialog } from "@/components/ui/dialog";

const stageLabels: Record<number, string> = {
  0: "-",
  1: "1.문의",
  2: "2.미팅",
  3: "3.사양협의",
  4: "4.비딩",
  5: "5.발주전",
};

const stageColors: Record<number, string> = {
  0: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  1: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  2: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
  3: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  4: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  5: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

const CHART_COLORS = [
  "hsl(217, 91%, 60%)",
  "hsl(160, 60%, 45%)",
  "hsl(43, 96%, 56%)",
  "hsl(280, 65%, 60%)",
  "hsl(0, 84%, 60%)",
  "hsl(200, 70%, 50%)",
];

const statusLabels: Record<string, string> = {
  none: "-",
  active: "진행중",
  won: "수주",
  lost: "실주",
};

const statusColors: Record<string, string> = {
  none: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  active: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  won: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  lost: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

type UpcomingItem = { id: string; customerName: string; inquiryNumber: string; salesNumber: string | null; expectedDate: string | null; probability: number; status: string | null };

type SourceStatsData = {
  sourceSummary: { source: string; label: string; count: number }[];
  monthlyTrend: { month: string; label: string; year: number; count: number }[];
  conversionStats: { total: number; won: number; winRate: number };
  recentList: { id: string; inquiryNumber: string; customerName: string; productInfo: string | null; status: string | null; createdAt: string | null; snapshotContactName: string | null }[];
};

const EXCLUDED_BY_DEFAULT = [2020, 2021, 2022, 2023, 2024];

function WebInquirySourceTab({ onInquiryClick }: { onInquiryClick: (id: string) => void }) {
  const { data, isLoading } = useQuery<SourceStatsData>({
    queryKey: ["/api/inquiry-source-stats"],
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const { sourceSummary = [], monthlyTrend = [], conversionStats, recentList = [] } = data || {};
  const total = conversionStats?.total ?? 0;
  const won = conversionStats?.won ?? 0;
  const winRate = conversionStats?.winRate ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">홈페이지 총 문의</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="text-web-total">{total}</div>
            <p className="text-xs text-muted-foreground mt-1">홈페이지에서 유입된 전체 문의</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">수주 전환</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="text-web-won">{won}</div>
            <p className="text-xs text-muted-foreground mt-1">홈페이지 문의 중 수주 완료</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">수주 전환율</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="text-web-winrate">{winRate}%</div>
            <p className="text-xs text-muted-foreground mt-1">홈페이지 문의 → 수주 비율</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">유입 경로별 분포</CardTitle>
          </CardHeader>
          <CardContent>
            {sourceSummary.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">데이터가 없습니다</div>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={sourceSummary}
                      dataKey="count"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      label={({ label, count }) => `${label}: ${count}`}
                    >
                      {sourceSummary.map((_entry, index) => (
                        <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => [`${value}건`, "문의 수"]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">월별 홈페이지 유입 추이 (최근 12개월)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyTrend}>
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip formatter={(value) => [`${value}건`, "문의 수"]} labelFormatter={(label) => `${label}`} />
                  <Bar dataKey="count" name="문의 수" fill="hsl(217, 91%, 60%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">최근 홈페이지 문의</CardTitle>
        </CardHeader>
        <CardContent>
          {recentList.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">홈페이지 유입 문의가 없습니다</div>
          ) : (
            <div className="space-y-1 max-h-80 overflow-auto">
              {recentList.map(item => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/60 cursor-pointer group"
                  onClick={() => onInquiryClick(item.id)}
                  data-testid={`item-web-inquiry-${item.id}`}
                >
                  <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="font-mono text-xs text-muted-foreground shrink-0 w-20">{item.inquiryNumber}</span>
                  <span className="font-medium text-sm truncate flex-1">{item.customerName}</span>
                  {item.snapshotContactName && (
                    <span className="text-xs text-muted-foreground shrink-0">{item.snapshotContactName}</span>
                  )}
                  {item.productInfo && (
                    <span className="text-xs text-muted-foreground truncate max-w-[120px] shrink-0">{item.productInfo}</span>
                  )}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${statusColors[item.status || "none"] || statusColors.none}`}>
                    {statusLabels[item.status || "none"] || "-"}
                  </span>
                  {item.createdAt && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      {new Date(item.createdAt).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })}
                    </span>
                  )}
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0 transition-opacity" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function Dashboard() {
  const [, navigate] = useLocation();
  const [selectedInquiryId, setSelectedInquiryId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [showNewInquiry, setShowNewInquiry] = useState(false);
  const [upcomingPage, setUpcomingPage] = useState(0);
  const [noDateOpen, setNoDateOpen] = useState(false);

  const { data: years } = useQuery<number[]>({
    queryKey: ["/api/years"],
  });

  const [checkedYears, setCheckedYears] = useState<Set<number> | null>(null);

  const selectedYears = useMemo(() => {
    if (checkedYears !== null) return checkedYears;
    if (!years) return new Set<number>();
    return new Set(years.filter(y => !EXCLUDED_BY_DEFAULT.includes(y)));
  }, [checkedYears, years]);

  const toggleYear = (year: number) => {
    const base = new Set(selectedYears);
    if (base.has(year)) {
      base.delete(year);
    } else {
      base.add(year);
    }
    setCheckedYears(base);
  };

  const toggleAll = () => {
    if (!years) return;
    if (selectedYears.size === years.length) {
      setCheckedYears(new Set());
    } else {
      setCheckedYears(new Set(years));
    }
  };

  const queryParam = useMemo(() => {
    if (!years || selectedYears.size === 0) return "";
    const sorted = Array.from(selectedYears).sort((a, b) => a - b);
    return `?years=${sorted.join(",")}`;
  }, [selectedYears, years]);

  const { data: stats, isLoading } = useQuery<{
    total: number;
    byProbability: { range: string; count: number }[];
    byStatus: { status: string; count: number }[];
    byYear: { year: number; count: number }[];
    upcomingByMonth: { month: string; label: string; count: number; items: UpcomingItem[] }[];
    noDate: { count: number; items: UpcomingItem[] };
  }>({
    queryKey: ["/api/dashboard", queryParam],
    queryFn: async () => {
      if (selectedYears.size === 0) {
        return { total: 0, byProbability: [], byStatus: [], byYear: [] };
      }
      const res = await fetch(`/api/dashboard${queryParam}`);
      if (!res.ok) throw new Error("Failed to fetch dashboard stats");
      return res.json();
    },
    enabled: !!years,
  });

  if (!years) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  const activeCount = stats?.byStatus?.find(s => s.status === "active")?.count || 0;
  const wonCount = stats?.byStatus?.find(s => s.status === "won")?.count || 0;
  const lostCount = stats?.byStatus?.find(s => s.status === "lost")?.count || 0;
  const highStageCount = stats?.byProbability
    ?.filter(p => p.range.startsWith("4.") || p.range.startsWith("5."))
    .reduce((a, b) => a + b.count, 0) || 0;

  return (
    <div className="p-6 space-y-6 overflow-auto h-full">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-semibold" data-testid="text-dashboard-title">영업 대시보드</h1>
        <Button onClick={() => setShowNewInquiry(true)} data-testid="button-new-inquiry-dashboard">
          <Plus className="h-4 w-4 mr-1" />신규 인콰이어리
        </Button>
      </div>

      <InquiryFormDialog open={showNewInquiry} onOpenChange={setShowNewInquiry} />

      <TaskListCard onInquiryClick={(id) => setSelectedInquiryId(id)} onProjectClick={(id) => setSelectedProjectId(id)} />

      <Tabs defaultValue="sales" data-testid="tabs-dashboard">
        <TabsList>
          <TabsTrigger value="sales" data-testid="tab-sales">영업 현황</TabsTrigger>
          <TabsTrigger value="source" data-testid="tab-source">
            <Globe className="h-3.5 w-3.5 mr-1" />
            유입 분석
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="mt-4 space-y-6">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-4 flex-wrap">
                <span className="text-sm font-medium text-muted-foreground mr-1">연도 선택:</span>
                <div className="flex items-center gap-1">
                  <Checkbox
                    id="year-all"
                    checked={selectedYears.size === years.length}
                    onCheckedChange={toggleAll}
                    data-testid="checkbox-year-all"
                  />
                  <Label htmlFor="year-all" className="text-sm cursor-pointer">전체</Label>
                </div>
                {years.map(y => (
                  <div key={y} className="flex items-center gap-1">
                    <Checkbox
                      id={`year-${y}`}
                      checked={selectedYears.has(y)}
                      onCheckedChange={() => toggleYear(y)}
                      data-testid={`checkbox-year-${y}`}
                    />
                    <Label htmlFor={`year-${y}`} className="text-sm cursor-pointer">{y}</Label>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {isLoading ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32" />)}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Skeleton className="h-80" />
                <Skeleton className="h-80" />
              </div>
            </div>
          ) : selectedYears.size === 0 ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground">
              연도를 선택해주세요
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">총 인콰이어리</CardTitle>
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="text-total-inquiries">{stats?.total || 0}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">비딩/발주전</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="text-high-probability">{highStageCount}</div>
                  </CardContent>
                </Card>

                <Card
                  className="cursor-pointer transition-colors hover:bg-accent/50"
                  onClick={() => navigate("/inquiries?status=active")}
                  data-testid="card-active"
                >
                  <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">진행중</CardTitle>
                    <Target className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="text-active-count">{activeCount}</div>
                  </CardContent>
                </Card>

                <Card
                  className="cursor-pointer transition-colors hover:bg-accent/50"
                  onClick={() => navigate("/inquiries?status=won")}
                  data-testid="card-won"
                >
                  <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">수주</CardTitle>
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="text-won-count">{wonCount}</div>
                  </CardContent>
                </Card>

                <Card
                  className="cursor-pointer transition-colors hover:bg-accent/50"
                  onClick={() => navigate("/inquiries?status=lost")}
                  data-testid="card-lost"
                >
                  <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">실주</CardTitle>
                    <XCircle className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="text-lost-count">{lostCount}</div>
                  </CardContent>
                </Card>
              </div>

              {stats?.upcomingByMonth && stats.upcomingByMonth.length > 0 && (() => {
                const totalPages = Math.ceil(stats.upcomingByMonth.length / 3);
                const pageItems = stats.upcomingByMonth.slice(upcomingPage * 3, upcomingPage * 3 + 3);
                const hasPrev = upcomingPage > 0;
                const hasNext = upcomingPage < totalPages - 1;
                return (
                  <div className="flex items-center gap-2">
                    {hasPrev && (
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => setUpcomingPage(p => p - 1)}
                        data-testid="btn-upcoming-prev"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1">
                      {pageItems.map((m, idx) => {
                        const globalIdx = upcomingPage * 3 + idx;
                        return (
                          <Card key={m.month} data-testid={`card-upcoming-${globalIdx}`}>
                            <CardHeader
                              className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2 cursor-pointer hover:bg-accent/50 rounded-t-lg"
                              onClick={() => navigate(`/inquiries?expectedMonth=${globalIdx}`)}
                            >
                              <CardTitle className="text-sm font-medium">{m.label} ({m.month})</CardTitle>
                              <div className="flex items-center gap-1">
                                <span className="text-lg font-bold">{m.count}건</span>
                                <Clock className="h-4 w-4 text-muted-foreground" />
                              </div>
                            </CardHeader>
                            <CardContent>
                              {m.items.length > 0 ? (
                                <div className="space-y-1 max-h-40 overflow-auto">
                                  {m.items.map(item => (
                                    <div
                                      key={item.id}
                                      className="flex items-center gap-2 text-xs p-1.5 rounded hover:bg-muted/60 cursor-pointer"
                                      onClick={() => setSelectedInquiryId(item.id)}
                                      data-testid={`item-upcoming-${item.id}`}
                                    >
                                      <span className="font-mono text-muted-foreground shrink-0">{item.inquiryNumber}</span>
                                      <span className="truncate flex-1">{item.customerName}</span>
                                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${stageColors[item.probability] || stageColors[0]}`}>
                                        {stageLabels[item.probability] || "-"}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground">예정된 인콰이어리가 없습니다</p>
                              )}
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                    {hasNext && (
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => setUpcomingPage(p => p + 1)}
                        data-testid="btn-upcoming-next"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              })()}

              {stats?.noDate && stats.noDate.count > 0 && (
                <Collapsible open={noDateOpen} onOpenChange={setNoDateOpen} data-testid="card-nodate">
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between p-3 rounded-lg border bg-card cursor-pointer hover:bg-accent/50">
                      <div className="flex items-center gap-2">
                        {noDateOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        <span className="text-sm font-medium">일자 미정 (진행중)</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-bold">{stats.noDate.count}건</span>
                        <XCircle className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="space-y-1 mt-2 p-3 rounded-lg border bg-card max-h-48 overflow-auto">
                      {stats.noDate.items.map(item => (
                        <div
                          key={item.id}
                          className="flex items-center gap-2 text-xs p-1.5 rounded hover:bg-muted/60 cursor-pointer"
                          onClick={() => setSelectedInquiryId(item.id)}
                          data-testid={`item-nodate-${item.id}`}
                        >
                          <span className="font-mono text-muted-foreground shrink-0">{item.inquiryNumber}</span>
                          <span className="truncate flex-1">{item.customerName}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${stageColors[item.probability] || stageColors[0]}`}>
                            {stageLabels[item.probability] || "-"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">단계별 분포</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={(stats?.byProbability || []).filter(p => p.count > 0)}>
                          <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                          <YAxis allowDecimals={false} />
                          <Tooltip />
                          <Bar dataKey="count" name="건수" radius={[4, 4, 0, 0]}>
                            {(stats?.byProbability || []).filter(p => p.count > 0).map((_entry, index) => (
                              <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">상태별 현황</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={(stats?.byStatus || []).map(s => ({
                              ...s,
                              name: statusLabels[s.status] || s.status,
                            }))}
                            dataKey="count"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={80}
                            label={({ name, count }) => `${name}: ${count}`}
                          >
                            {(stats?.byStatus || []).map((_entry, index) => (
                              <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {stats?.byYear && stats.byYear.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">연도별 인콰이어리 수</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats.byYear}>
                          <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                          <YAxis allowDecimals={false} />
                          <Tooltip />
                          <Bar dataKey="count" name="건수" fill="hsl(217, 91%, 60%)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="source" className="mt-4">
          <WebInquirySourceTab onInquiryClick={(id) => setSelectedInquiryId(id)} />
        </TabsContent>
      </Tabs>

      <InquiryDetailDialog
        inquiryId={selectedInquiryId || ""}
        open={!!selectedInquiryId}
        onOpenChange={(open) => { if (!open) setSelectedInquiryId(null); }}
      />

      <Dialog open={!!selectedProjectId} onOpenChange={open => { if (!open) setSelectedProjectId(null); }}>
        {selectedProjectId && <ProjectDetailModal projectId={selectedProjectId} onClose={() => setSelectedProjectId(null)} />}
      </Dialog>
    </div>
  );
}
