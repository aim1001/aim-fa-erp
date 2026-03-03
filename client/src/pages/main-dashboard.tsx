import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation, Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  FileText, FolderKanban, Receipt, Package,
  TrendingUp, AlertTriangle, Clock, Target,
  ArrowRight, Trophy, XCircle, Banknote, Check, ListTodo
} from "lucide-react";

type MainDashboardData = {
  sales: {
    activeCount: number;
    biddingPreorderCount: number;
    thisMonthCount: number;
    nextMonthCount: number;
    recentWon: { id: string; inquiryNumber: string; customerName: string }[];
    recentLost: { id: string; inquiryNumber: string; customerName: string }[];
  };
  projects: {
    activeCount: number;
    totalCount: number;
    overduePaymentCount: number;
    overduePaymentAmount: number;
  };
  finance: {
    overdueInvoiceCount: number;
    overdueInvoiceAmount: number;
    unissuedCount: number;
    unissuedAmount: number;
    uncollectedCount: number;
    uncollectedAmount: number;
    salesInvoiceCount: number;
    purchaseInvoiceCount: number;
  };
  trade: {
    itemCount: number;
    purchaseItemCount: number;
  };
};

type PendingTask = {
  id: string;
  inquiryId: string;
  content: string;
  completed: boolean;
  dueDate: string | null;
  createdAt: string;
  inquiryNumber: string;
  customerName: string;
};

function TaskListCard() {
  const { data: tasks = [], isLoading } = useQuery<PendingTask[]>({
    queryKey: ["/api/tasks/pending"],
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id }: { id: string }) =>
      apiRequest("PATCH", `/api/tasks/${id}`, { completed: true }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/pending"] });
      const task = tasks.find(t => t.id === vars.id);
      if (task) {
        queryClient.invalidateQueries({ queryKey: [`/api/inquiries/${task.inquiryId}/tasks`] });
      }
    },
  });

  const isOverdue = (d: string | null) => {
    if (!d) return false;
    return d < new Date().toISOString().split("T")[0];
  };

  if (isLoading) return <Skeleton className="h-32" />;
  if (tasks.length === 0) return null;

  return (
    <Card className="border-l-4 border-l-cyan-500" data-testid="card-pending-tasks">
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-2 rounded-lg bg-cyan-50 dark:bg-cyan-900/20">
            <ListTodo className="h-5 w-5 text-cyan-600" />
          </div>
          <h2 className="font-semibold text-base">할일</h2>
          <span className="text-xs text-muted-foreground">{tasks.length}건</span>
        </div>
        <div className="space-y-1 max-h-[240px] overflow-y-auto">
          {tasks.map(task => (
            <div key={task.id} className="flex items-center gap-2 py-1 group" data-testid={`dashboard-task-${task.id}`}>
              <button
                className="shrink-0 w-4 h-4 rounded border border-muted-foreground/40 hover:border-cyan-500 flex items-center justify-center"
                onClick={() => toggleMutation.mutate({ id: task.id })}
                data-testid={`button-complete-task-${task.id}`}
              />
              <Link
                href={`/inquiries/${task.inquiryId}`}
                className="text-xs font-mono text-cyan-600 hover:underline shrink-0"
                data-testid={`link-inquiry-${task.id}`}
              >
                {task.inquiryNumber}
              </Link>
              <span className="text-xs text-muted-foreground shrink-0 max-w-[80px] truncate">{task.customerName}</span>
              <span className="text-sm flex-1 min-w-0 truncate">{task.content}</span>
              {task.dueDate && (
                <span className={`text-[10px] shrink-0 ${isOverdue(task.dueDate) ? "text-red-500 font-medium" : "text-muted-foreground"}`}>
                  {task.dueDate}
                </span>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function fmt(n: number) {
  if (!n) return "0";
  return n.toLocaleString();
}

export default function MainDashboard() {
  const [, navigate] = useLocation();
  const { data, isLoading } = useQuery<MainDashboardData>({
    queryKey: ["/api/main-dashboard"],
  });

  if (isLoading || !data) {
    return (
      <div className="p-6 space-y-6 overflow-auto h-full">
        <h1 className="text-2xl font-semibold">대시보드</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-48" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 overflow-auto h-full" data-testid="main-dashboard">
      <h1 className="text-2xl font-semibold">대시보드</h1>

      <TaskListCard />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-blue-500"
          onClick={() => navigate("/sales-dashboard")}
          data-testid="card-sales"
        >
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                  <FileText className="h-5 w-5 text-blue-600" />
                </div>
                <h2 className="font-semibold text-base">영업</h2>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="border rounded-lg p-2">
                <div className="text-[10px] text-muted-foreground">진행중</div>
                <div className="text-lg font-bold text-blue-600">{data.sales.activeCount}<span className="text-xs font-normal text-muted-foreground ml-0.5">건</span></div>
              </div>
              <div className="border rounded-lg p-2">
                <div className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Target className="h-3 w-3" />비딩/발주전</div>
                <div className="text-lg font-bold text-orange-600">{data.sales.biddingPreorderCount}<span className="text-xs font-normal text-muted-foreground ml-0.5">건</span></div>
              </div>
              <div className="border rounded-lg p-2">
                <div className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Clock className="h-3 w-3" />이번달 예정</div>
                <div className="text-sm font-semibold">{data.sales.thisMonthCount}건</div>
              </div>
              <div className="border rounded-lg p-2">
                <div className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Clock className="h-3 w-3" />다음달 예정</div>
                <div className="text-sm font-semibold">{data.sales.nextMonthCount}건</div>
              </div>
            </div>
            {(data.sales.recentWon.length > 0 || data.sales.recentLost.length > 0) && (
              <div className="space-y-1 border-t pt-2">
                {data.sales.recentWon.map(w => (
                  <div key={w.id} className="flex items-center gap-1.5 text-xs">
                    <Trophy className="h-3 w-3 text-green-500" />
                    <span className="font-mono text-muted-foreground">{w.inquiryNumber}</span>
                    <span className="font-medium text-green-700 dark:text-green-400">{w.customerName}</span>
                    <span className="text-green-600 text-[10px]">수주</span>
                  </div>
                ))}
                {data.sales.recentLost.map(l => (
                  <div key={l.id} className="flex items-center gap-1.5 text-xs">
                    <XCircle className="h-3 w-3 text-red-400" />
                    <span className="font-mono text-muted-foreground">{l.inquiryNumber}</span>
                    <span className="font-medium text-red-700 dark:text-red-400">{l.customerName}</span>
                    <span className="text-red-600 text-[10px]">실주</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-green-500"
          onClick={() => navigate("/projects")}
          data-testid="card-projects"
        >
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-green-50 dark:bg-green-900/20">
                  <FolderKanban className="h-5 w-5 text-green-600" />
                </div>
                <h2 className="font-semibold text-base">프로젝트</h2>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="border rounded-lg p-2">
                <div className="text-[10px] text-muted-foreground">진행중</div>
                <div className="text-lg font-bold text-green-600">{data.projects.activeCount}<span className="text-xs font-normal text-muted-foreground ml-0.5">건</span></div>
              </div>
              <div className="border rounded-lg p-2">
                <div className="text-[10px] text-muted-foreground">전체</div>
                <div className="text-lg font-bold">{data.projects.totalCount}<span className="text-xs font-normal text-muted-foreground ml-0.5">건</span></div>
              </div>
            </div>
            {data.projects.overduePaymentCount > 0 && (
              <div className="mt-2 border rounded-lg p-2 bg-red-50/50 dark:bg-red-900/10">
                <div className="flex items-center gap-1 text-xs text-red-600">
                  <AlertTriangle className="h-3 w-3" />
                  <span className="font-medium">수금 지연 {data.projects.overduePaymentCount}건</span>
                  <span className="text-muted-foreground ml-auto">{fmt(data.projects.overduePaymentAmount)}원</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-purple-500"
          onClick={() => navigate("/management")}
          data-testid="card-finance"
        >
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-900/20">
                  <Receipt className="h-5 w-5 text-purple-600" />
                </div>
                <h2 className="font-semibold text-base">경영지원</h2>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="border rounded-lg p-2">
                <div className="text-[10px] text-muted-foreground">매출계산서</div>
                <div className="text-sm font-semibold">{data.finance.salesInvoiceCount}건</div>
              </div>
              <div className="border rounded-lg p-2">
                <div className="text-[10px] text-muted-foreground">매입계산서</div>
                <div className="text-sm font-semibold">{data.finance.purchaseInvoiceCount}건</div>
              </div>
            </div>
            <div className="mt-2 space-y-1.5">
              {data.finance.overdueInvoiceCount > 0 && (
                <div className="border rounded-lg p-2 bg-red-50/50 dark:bg-red-900/10">
                  <div className="flex items-center gap-1 text-xs text-red-600">
                    <AlertTriangle className="h-3 w-3" />
                    <span className="font-medium">미발행 지연 {data.finance.overdueInvoiceCount}건</span>
                    <span className="text-muted-foreground ml-auto">{fmt(data.finance.overdueInvoiceAmount)}원</span>
                  </div>
                </div>
              )}
              {data.finance.uncollectedCount > 0 && (
                <div className="border rounded-lg p-2 bg-orange-50/50 dark:bg-orange-900/10">
                  <div className="flex items-center gap-1 text-xs text-orange-600">
                    <Banknote className="h-3 w-3" />
                    <span className="font-medium">미수금 {data.finance.uncollectedCount}건</span>
                    <span className="text-muted-foreground ml-auto">{fmt(data.finance.uncollectedAmount)}원</span>
                  </div>
                </div>
              )}
              {data.finance.overdueInvoiceCount === 0 && data.finance.uncollectedCount === 0 && (
                <div className="text-xs text-green-600 flex items-center gap-1 p-1">
                  <TrendingUp className="h-3 w-3" />지연/미수금 없음
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-amber-500"
          onClick={() => navigate("/items")}
          data-testid="card-trade"
        >
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20">
                  <Package className="h-5 w-5 text-amber-600" />
                </div>
                <h2 className="font-semibold text-base">구매/판매</h2>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="border rounded-lg p-2">
                <div className="text-[10px] text-muted-foreground">판매 품목</div>
                <div className="text-lg font-bold text-amber-600">{data.trade.itemCount}<span className="text-xs font-normal text-muted-foreground ml-0.5">건</span></div>
              </div>
              <div className="border rounded-lg p-2">
                <div className="text-[10px] text-muted-foreground">구매 품목</div>
                <div className="text-lg font-bold">{data.trade.purchaseItemCount}<span className="text-xs font-normal text-muted-foreground ml-0.5">건</span></div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
