import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { FileText, TrendingUp, Target, Calendar } from "lucide-react";
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";

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

const EXCLUDED_BY_DEFAULT = [2020, 2021, 2022, 2023, 2024];

export default function Dashboard() {
  const [, navigate] = useLocation();

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
  const highStageCount = stats?.byProbability
    ?.filter(p => p.range.startsWith("4.") || p.range.startsWith("5."))
    .reduce((a, b) => a + b.count, 0) || 0;

  return (
    <div className="p-6 space-y-6 overflow-auto h-full">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-semibold" data-testid="text-dashboard-title">영업 대시보드</h1>
      </div>

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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
          </div>

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
    </div>
  );
}
