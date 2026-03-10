import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ListTodo, CalendarDays, RefreshCw, Plus, Trash2, FileText, FolderKanban, ShoppingCart, Receipt } from "lucide-react";

type InquiryTask = {
  id: string;
  inquiryId: string;
  content: string;
  completed: boolean;
  dueDate: string | null;
  dueTime: string | null;
  calendarEventId: string | null;
  createdAt: string;
  inquiryNumber: string;
  customerName: string;
};

type ProjectPendingTask = {
  id: string;
  projectId: string;
  content: string;
  completed: boolean;
  dueDate: string | null;
  dueTime: string | null;
  calendarEventId: string | null;
  createdAt: string;
  projectNumber: string;
  customerName: string;
};

type POTask = {
  id: string;
  purchaseOrderId: string | null;
  content: string;
  completed: boolean;
  dueDate: string | null;
  dueTime: string | null;
  calendarEventId: string | null;
  createdAt: string;
  orderNumber: string;
  vendor: string;
};

type FinTask = {
  id: string;
  category: string | null;
  content: string;
  completed: boolean;
  dueDate: string | null;
  dueTime: string | null;
  calendarEventId: string | null;
  createdAt: string;
};

type TabKey = "all" | "sales" | "project" | "purchase" | "finance";

const TABS: { key: TabKey; label: string; icon: typeof ListTodo; activeClass: string }[] = [
  { key: "all", label: "전체", icon: ListTodo, activeClass: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400 font-medium" },
  { key: "sales", label: "영업", icon: FileText, activeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 font-medium" },
  { key: "project", label: "프로젝트", icon: FolderKanban, activeClass: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 font-medium" },
  { key: "purchase", label: "구매발주", icon: ShoppingCart, activeClass: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 font-medium" },
  { key: "finance", label: "경영지원", icon: Receipt, activeClass: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 font-medium" },
];

export function TaskListCard({ onInquiryClick, onProjectClick }: { onInquiryClick?: (inquiryId: string) => void; onProjectClick?: (projectId: string) => void } = {}) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [newContent, setNewContent] = useState("");
  const [newDueDate, setNewDueDate] = useState("");

  const { data: inquiryTasks = [], isLoading: il } = useQuery<InquiryTask[]>({
    queryKey: ["/api/tasks/pending"],
  });

  const { data: projectTasks = [], isLoading: pl } = useQuery<ProjectPendingTask[]>({
    queryKey: ["/api/project-tasks/pending"],
  });

  const { data: poTasks = [], isLoading: pol } = useQuery<POTask[]>({
    queryKey: ["/api/purchase-order-tasks/pending"],
  });

  const { data: finTasks = [], isLoading: fl } = useQuery<FinTask[]>({
    queryKey: ["/api/finance-tasks/pending"],
  });

  const syncCalendarMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/tasks/sync-calendar", {});
      return res.json();
    },
    onSuccess: (data: { synced: number; failed: number; total: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/project-tasks/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-order-tasks/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/finance-tasks/pending"] });
      if (data.synced > 0) {
        toast({ title: `${data.synced}건 캘린더 등록 완료${data.failed > 0 ? ` (${data.failed}건 실패)` : ""}` });
      } else if (data.total === 0) {
        toast({ title: "등록할 항목이 없습니다" });
      } else {
        toast({ title: "캘린더 등록 실패", variant: "destructive" });
      }
    },
    onError: (err: Error) => {
      toast({ title: "캘린더 동기화 실패", description: err.message, variant: "destructive" });
    },
  });

  const toggleInquiryMutation = useMutation({
    mutationFn: ({ id }: { id: string }) =>
      apiRequest("PATCH", `/api/tasks/${id}`, { completed: true }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/pending"] });
      const task = inquiryTasks.find(t => t.id === vars.id);
      if (task) {
        queryClient.invalidateQueries({ queryKey: [`/api/inquiries/${task.inquiryId}/tasks`] });
      }
    },
  });

  const toggleProjectMutation = useMutation({
    mutationFn: ({ id }: { id: string }) =>
      apiRequest("PATCH", `/api/project-tasks/${id}`, { completed: true }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-tasks/pending"] });
      const task = projectTasks.find(t => t.id === vars.id);
      if (task) {
        queryClient.invalidateQueries({ queryKey: [`/api/projects/${task.projectId}/tasks`] });
      }
    },
  });

  const togglePOMutation = useMutation({
    mutationFn: ({ id }: { id: string }) =>
      apiRequest("PATCH", `/api/purchase-order-tasks/${id}`, { completed: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-order-tasks/pending"] });
    },
  });

  const toggleFinMutation = useMutation({
    mutationFn: ({ id }: { id: string }) =>
      apiRequest("PATCH", `/api/finance-tasks/${id}`, { completed: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance-tasks/pending"] });
    },
  });

  const deletePOMutation = useMutation({
    mutationFn: ({ id }: { id: string }) =>
      apiRequest("DELETE", `/api/purchase-order-tasks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-order-tasks/pending"] });
    },
  });

  const deleteFinMutation = useMutation({
    mutationFn: ({ id }: { id: string }) =>
      apiRequest("DELETE", `/api/finance-tasks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance-tasks/pending"] });
    },
  });

  const createPOMutation = useMutation({
    mutationFn: async (data: { content: string; dueDate?: string }) => {
      const res = await apiRequest("POST", "/api/purchase-order-tasks", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-order-tasks/pending"] });
      setNewContent("");
      setNewDueDate("");
    },
    onError: (err: Error) => {
      toast({ title: "할일 추가 실패", description: err.message, variant: "destructive" });
    },
  });

  const createFinMutation = useMutation({
    mutationFn: async (data: { content: string; dueDate?: string }) => {
      const res = await apiRequest("POST", "/api/finance-tasks", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance-tasks/pending"] });
      setNewContent("");
      setNewDueDate("");
    },
    onError: (err: Error) => {
      toast({ title: "할일 추가 실패", description: err.message, variant: "destructive" });
    },
  });

  const isOverdue = (d: string | null) => {
    if (!d) return false;
    return d < new Date().toISOString().split("T")[0];
  };

  const isLoading = il || pl || pol || fl;
  if (isLoading) return <Skeleton className="h-32" />;

  const unsyncedCount = [
    ...inquiryTasks.filter(t => t.dueDate && !t.calendarEventId),
    ...projectTasks.filter(t => t.dueDate && !t.calendarEventId),
    ...poTasks.filter(t => t.dueDate && !t.calendarEventId),
    ...finTasks.filter(t => t.dueDate && !t.calendarEventId),
  ].length;

  type TaskItem = {
    id: string;
    parentId: string;
    type: "inquiry" | "project" | "purchase" | "finance";
    content: string;
    dueDate: string | null;
    dueTime: string | null;
    label: string;
    subLabel: string;
    calendarEventId: string | null;
  };

  const salesItems: TaskItem[] = inquiryTasks.map(t => ({
    id: t.id, parentId: t.inquiryId, type: "inquiry" as const,
    content: t.content, dueDate: t.dueDate, dueTime: t.dueTime,
    label: t.inquiryNumber, subLabel: t.customerName, calendarEventId: t.calendarEventId,
  }));

  const projectItems: TaskItem[] = projectTasks.map(t => ({
    id: t.id, parentId: t.projectId, type: "project" as const,
    content: t.content, dueDate: t.dueDate, dueTime: t.dueTime,
    label: `P:${t.projectNumber}`, subLabel: t.customerName, calendarEventId: t.calendarEventId,
  }));

  const purchaseItems: TaskItem[] = poTasks.map(t => ({
    id: t.id, parentId: t.purchaseOrderId || "", type: "purchase" as const,
    content: t.content, dueDate: t.dueDate, dueTime: t.dueTime,
    label: t.orderNumber || "발주", subLabel: t.vendor, calendarEventId: t.calendarEventId,
  }));

  const financeItems: TaskItem[] = finTasks.map(t => ({
    id: t.id, parentId: "", type: "finance" as const,
    content: t.content, dueDate: t.dueDate, dueTime: t.dueTime,
    label: t.category || "경영", subLabel: "", calendarEventId: t.calendarEventId,
  }));

  const allItems = [...salesItems, ...projectItems, ...purchaseItems, ...financeItems]
    .sort((a, b) => {
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return 0;
    });

  const filteredItems = activeTab === "all" ? allItems
    : activeTab === "sales" ? salesItems
    : activeTab === "project" ? projectItems
    : activeTab === "purchase" ? purchaseItems
    : financeItems;

  const tabCounts: Record<TabKey, number> = {
    all: allItems.length,
    sales: salesItems.length,
    project: projectItems.length,
    purchase: purchaseItems.length,
    finance: financeItems.length,
  };

  const handleToggle = (item: TaskItem) => {
    if (item.type === "inquiry") toggleInquiryMutation.mutate({ id: item.id });
    else if (item.type === "project") toggleProjectMutation.mutate({ id: item.id });
    else if (item.type === "purchase") togglePOMutation.mutate({ id: item.id });
    else toggleFinMutation.mutate({ id: item.id });
  };

  const handleDelete = (item: TaskItem) => {
    if (item.type === "purchase") deletePOMutation.mutate({ id: item.id });
    else if (item.type === "finance") deleteFinMutation.mutate({ id: item.id });
  };

  const handleClick = (item: TaskItem) => {
    if (item.type === "inquiry") onInquiryClick?.(item.parentId);
    else if (item.type === "project") onProjectClick?.(item.parentId);
  };

  const canAddInline = activeTab === "purchase" || activeTab === "finance";

  const handleAddTask = () => {
    if (!newContent.trim()) return;
    const data: { content: string; dueDate?: string } = { content: newContent.trim() };
    if (newDueDate) data.dueDate = newDueDate;
    if (activeTab === "purchase") createPOMutation.mutate(data);
    else if (activeTab === "finance") createFinMutation.mutate(data);
  };

  const typeColorMap: Record<string, string> = {
    inquiry: "text-blue-600",
    project: "text-green-600",
    purchase: "text-amber-600",
    finance: "text-purple-600",
  };

  const typeBadge: Record<string, string> = {
    inquiry: "영업",
    project: "프로젝트",
    purchase: "발주",
    finance: "경영",
  };

  return (
    <Card className="border-l-4 border-l-cyan-500" data-testid="card-pending-tasks">
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-2 rounded-lg bg-cyan-50 dark:bg-cyan-900/20">
            <ListTodo className="h-5 w-5 text-cyan-600" />
          </div>
          <h2 className="font-semibold text-base">할일</h2>
          <span className="text-xs text-muted-foreground">{allItems.length}건</span>
          <div className="ml-auto">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => syncCalendarMutation.mutate()}
              disabled={syncCalendarMutation.isPending}
              data-testid="button-sync-calendar-all"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncCalendarMutation.isPending ? "animate-spin" : ""}`} />
              캘린더 동기화
              {unsyncedCount > 0 && <span className="text-[10px] bg-orange-100 text-orange-600 px-1.5 rounded-full">{unsyncedCount}</span>}
            </Button>
          </div>
        </div>

        <div className="flex gap-1 mb-3 border-b pb-2 overflow-x-auto">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const count = tabCounts[tab.key];
            return (
              <button
                key={tab.key}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-md transition-colors whitespace-nowrap ${
                  activeTab === tab.key ? tab.activeClass : "text-muted-foreground hover:bg-muted"
                }`}
                onClick={() => { setActiveTab(tab.key); setNewContent(""); setNewDueDate(""); }}
                data-testid={`tab-task-${tab.key}`}
              >
                <Icon className="h-3 w-3" />
                {tab.label}
                {count > 0 && <span className="text-[10px] ml-0.5">{count}</span>}
              </button>
            );
          })}
        </div>

        {canAddInline && (
          <div className="flex items-center gap-2 mb-2" data-testid="inline-add-task">
            <Input
              placeholder="새 할일 입력..."
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleAddTask(); }}
              className="h-7 text-sm flex-1"
              data-testid="input-new-task-content"
            />
            <Input
              type="date"
              value={newDueDate}
              onChange={e => setNewDueDate(e.target.value)}
              className="h-7 text-sm w-[130px]"
              data-testid="input-new-task-date"
            />
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              onClick={handleAddTask}
              disabled={!newContent.trim() || createPOMutation.isPending || createFinMutation.isPending}
              data-testid="button-add-task"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        <div className="space-y-1 max-h-[280px] overflow-y-auto">
          {filteredItems.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-4">할일이 없습니다</div>
          )}
          {filteredItems.map(task => (
            <div key={`${task.type}-${task.id}`} className="flex items-center gap-2 py-1 group" data-testid={`dashboard-task-${task.id}`}>
              <button
                className="shrink-0 w-4 h-4 rounded border border-muted-foreground/40 hover:border-cyan-500 flex items-center justify-center"
                onClick={() => handleToggle(task)}
                data-testid={`button-complete-task-${task.id}`}
              />
              {activeTab === "all" && (
                <span className={`text-[9px] font-medium shrink-0 px-1 py-0.5 rounded ${typeColorMap[task.type]} bg-opacity-10`}>
                  {typeBadge[task.type]}
                </span>
              )}
              {task.label && (
                <button
                  className={`text-xs font-mono ${typeColorMap[task.type]} hover:underline shrink-0`}
                  onClick={() => handleClick(task)}
                  data-testid={`link-parent-${task.id}`}
                >
                  {task.label}
                </button>
              )}
              {task.subLabel && (
                <span className="text-xs text-muted-foreground shrink-0 max-w-[80px] truncate">{task.subLabel}</span>
              )}
              <span
                className="text-sm flex-1 min-w-0 truncate cursor-pointer hover:text-cyan-600"
                onClick={() => handleClick(task)}
              >
                {task.content}
              </span>
              {task.dueDate && (
                <span className={`text-[10px] shrink-0 inline-flex items-center gap-0.5 ${isOverdue(task.dueDate) ? "text-red-500 font-medium" : "text-muted-foreground"}`}>
                  <CalendarDays className={`h-2.5 w-2.5 ${task.calendarEventId ? "text-green-500" : "text-muted-foreground/40"}`} />
                  {task.dueDate}{task.dueTime ? ` ${task.dueTime}` : ""}
                </span>
              )}
              {(task.type === "purchase" || task.type === "finance") && (
                <button
                  className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-500"
                  onClick={() => handleDelete(task)}
                  data-testid={`button-delete-task-${task.id}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
