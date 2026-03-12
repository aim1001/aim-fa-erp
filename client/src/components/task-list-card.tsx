import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ListTodo, CalendarDays, RefreshCw, Plus, Trash2, FileText, FolderKanban, ShoppingCart, Receipt, Pencil, Check, X } from "lucide-react";

type InquiryTask = {
  id: string;
  inquiryId: string;
  content: string;
  completed: boolean;
  dueDate: string | null;
  dueTime: string | null;
  calendarEventId: string | null;
  taskType: string | null;
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
  taskType: string | null;
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
  taskType: string | null;
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
  taskType: string | null;
  createdAt: string;
};

type MainTab = "todo" | "schedule";
type SubTabKey = "all" | "sales" | "project" | "purchase" | "finance";

type TaskItem = {
  id: string;
  parentId: string;
  type: "inquiry" | "project" | "purchase" | "finance";
  taskType: string;
  content: string;
  dueDate: string | null;
  dueTime: string | null;
  label: string;
  subLabel: string;
  calendarEventId: string | null;
};

const SUB_TABS: { key: SubTabKey; label: string; icon: typeof ListTodo; activeClass: string }[] = [
  { key: "all", label: "전체", icon: ListTodo, activeClass: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400 font-medium" },
  { key: "sales", label: "영업", icon: FileText, activeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 font-medium" },
  { key: "project", label: "프로젝트", icon: FolderKanban, activeClass: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 font-medium" },
  { key: "purchase", label: "구매발주", icon: ShoppingCart, activeClass: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 font-medium" },
  { key: "finance", label: "경영지원", icon: Receipt, activeClass: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 font-medium" },
];

export function TaskListCard({ onInquiryClick, onProjectClick }: { onInquiryClick?: (inquiryId: string) => void; onProjectClick?: (projectId: string) => void } = {}) {
  const { toast } = useToast();
  const [mainTab, setMainTab] = useState<MainTab>("todo");
  const [subTab, setSubTab] = useState<SubTabKey>("all");
  const [newContent, setNewContent] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [newStaffId, setNewStaffId] = useState("");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editDueTime, setEditDueTime] = useState("");

  const { data: companySettings } = useQuery<any>({
    queryKey: ["/api/company-settings"],
  });

  const { data: staffList = [] } = useQuery<any[]>({
    queryKey: ["/api/staff"],
  });

  useEffect(() => {
    if (!companySettings) return;
    const defaultId = subTab === "purchase"
      ? (companySettings.poDefaultStaffId || "")
      : subTab === "finance"
      ? (companySettings.financeDefaultStaffId || "")
      : "";
    setNewStaffId(defaultId);
  }, [subTab, companySettings]);

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

  const editInquiryMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string; content?: string; dueDate?: string | null; dueTime?: string | null }) =>
      apiRequest("PATCH", `/api/tasks/${id}`, data),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/pending"] });
      const task = inquiryTasks.find(t => t.id === vars.id);
      if (task) queryClient.invalidateQueries({ queryKey: [`/api/inquiries/${task.inquiryId}/tasks`] });
      setEditingTaskId(null);
    },
    onError: () => toast({ title: "할일 수정 실패", variant: "destructive" }),
  });

  const editProjectMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string; content?: string; dueDate?: string | null; dueTime?: string | null }) =>
      apiRequest("PATCH", `/api/project-tasks/${id}`, data),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-tasks/pending"] });
      const task = projectTasks.find(t => t.id === vars.id);
      if (task) queryClient.invalidateQueries({ queryKey: [`/api/projects/${task.projectId}/tasks`] });
      setEditingTaskId(null);
    },
    onError: () => toast({ title: "할일 수정 실패", variant: "destructive" }),
  });

  const editPOMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string; content?: string; dueDate?: string | null; dueTime?: string | null }) =>
      apiRequest("PATCH", `/api/purchase-order-tasks/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-order-tasks/pending"] });
      setEditingTaskId(null);
    },
    onError: () => toast({ title: "할일 수정 실패", variant: "destructive" }),
  });

  const editFinMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string; content?: string; dueDate?: string | null; dueTime?: string | null }) =>
      apiRequest("PATCH", `/api/finance-tasks/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance-tasks/pending"] });
      setEditingTaskId(null);
    },
    onError: () => toast({ title: "할일 수정 실패", variant: "destructive" }),
  });

  const createPOMutation = useMutation({
    mutationFn: async (data: { content: string; dueDate?: string; taskType: string; staffId?: string }) => {
      const res = await apiRequest("POST", "/api/purchase-order-tasks", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchase-order-tasks/pending"] });
      setNewContent("");
      setNewDueDate("");
      setNewStaffId(companySettings?.poDefaultStaffId || "");
    },
    onError: (err: Error) => {
      toast({ title: "추가 실패", description: err.message, variant: "destructive" });
    },
  });

  const createFinMutation = useMutation({
    mutationFn: async (data: { content: string; dueDate?: string; taskType: string; staffId?: string }) => {
      const res = await apiRequest("POST", "/api/finance-tasks", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/finance-tasks/pending"] });
      setNewContent("");
      setNewDueDate("");
      setNewStaffId(companySettings?.financeDefaultStaffId || "");
    },
    onError: (err: Error) => {
      toast({ title: "추가 실패", description: err.message, variant: "destructive" });
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

  const toTaskItem = (t: any, type: "inquiry" | "project" | "purchase" | "finance", label: string, subLabel: string, parentId: string): TaskItem => ({
    id: t.id, parentId, type,
    taskType: t.taskType || (type === "inquiry" || type === "project" ? "todo" : "schedule"),
    content: t.content, dueDate: t.dueDate, dueTime: t.dueTime,
    label, subLabel, calendarEventId: t.calendarEventId,
  });

  const allItems: TaskItem[] = [
    ...inquiryTasks.map(t => toTaskItem(t, "inquiry", t.inquiryNumber, t.customerName, t.inquiryId)),
    ...projectTasks.map(t => toTaskItem(t, "project", `P:${t.projectNumber}`, t.customerName, t.projectId)),
    ...poTasks.map(t => toTaskItem(t, "purchase", t.orderNumber || "발주", t.vendor, t.purchaseOrderId || "")),
    ...finTasks.map(t => toTaskItem(t, "finance", t.category || "경영", "", "")),
  ].sort((a, b) => {
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return 0;
  });

  const mainFiltered = allItems.filter(item => item.taskType === mainTab);

  const subFiltered = subTab === "all" ? mainFiltered
    : subTab === "sales" ? mainFiltered.filter(i => i.type === "inquiry")
    : subTab === "project" ? mainFiltered.filter(i => i.type === "project")
    : subTab === "purchase" ? mainFiltered.filter(i => i.type === "purchase")
    : mainFiltered.filter(i => i.type === "finance");

  const subCounts: Record<SubTabKey, number> = {
    all: mainFiltered.length,
    sales: mainFiltered.filter(i => i.type === "inquiry").length,
    project: mainFiltered.filter(i => i.type === "project").length,
    purchase: mainFiltered.filter(i => i.type === "purchase").length,
    finance: mainFiltered.filter(i => i.type === "finance").length,
  };

  const todoCount = allItems.filter(i => i.taskType === "todo").length;
  const scheduleCount = allItems.filter(i => i.taskType === "schedule").length;

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

  const startEdit = (item: TaskItem) => {
    setEditingTaskId(item.id);
    setEditContent(item.content);
    setEditDueDate(item.dueDate || "");
    setEditDueTime(item.dueTime || "");
  };

  const handleSaveEdit = (item: TaskItem) => {
    const updates: { id: string; content?: string; dueDate?: string | null; dueTime?: string | null } = { id: item.id };
    if (editContent.trim() !== item.content) updates.content = editContent.trim();
    if (editDueDate !== (item.dueDate || "")) updates.dueDate = editDueDate || null;
    if (editDueTime !== (item.dueTime || "")) updates.dueTime = editDueTime || null;
    if (updates.content === undefined && updates.dueDate === undefined && updates.dueTime === undefined) { setEditingTaskId(null); return; }
    if (item.type === "inquiry") editInquiryMutation.mutate(updates);
    else if (item.type === "project") editProjectMutation.mutate(updates);
    else if (item.type === "purchase") editPOMutation.mutate(updates);
    else editFinMutation.mutate(updates);
  };

  const handleClick = (item: TaskItem) => {
    if (item.type === "inquiry") onInquiryClick?.(item.parentId);
    else if (item.type === "project") onProjectClick?.(item.parentId);
  };

  const canAddInline = subTab === "purchase" || subTab === "finance";

  const handleAddTask = () => {
    if (!newContent.trim()) return;
    const data: { content: string; dueDate?: string; taskType: string; staffId?: string } = { content: newContent.trim(), taskType: mainTab };
    if (newDueDate) data.dueDate = newDueDate;
    if (newStaffId) data.staffId = newStaffId;
    if (subTab === "purchase") createPOMutation.mutate(data);
    else if (subTab === "finance") createFinMutation.mutate(data);
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
    <Card className={`border-l-4 ${mainTab === "todo" ? "border-l-cyan-500" : "border-l-indigo-500"}`} data-testid="card-pending-tasks">
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5">
            <button
              className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded-md transition-colors ${mainTab === "todo" ? "bg-background shadow-sm font-medium text-cyan-700 dark:text-cyan-400" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => { setMainTab("todo"); setSubTab("all"); setNewContent(""); setNewDueDate(""); }}
              data-testid="main-tab-todo"
            >
              <ListTodo className="h-3.5 w-3.5" />
              할일
              {todoCount > 0 && <span className="text-[10px] bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400 px-1.5 rounded-full">{todoCount}</span>}
            </button>
            <button
              className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded-md transition-colors ${mainTab === "schedule" ? "bg-background shadow-sm font-medium text-indigo-700 dark:text-indigo-400" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => { setMainTab("schedule"); setSubTab("all"); setNewContent(""); setNewDueDate(""); }}
              data-testid="main-tab-schedule"
            >
              <CalendarDays className="h-3.5 w-3.5" />
              일정
              {scheduleCount > 0 && <span className="text-[10px] bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 px-1.5 rounded-full">{scheduleCount}</span>}
            </button>
          </div>
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
          {SUB_TABS.map(tab => {
            const Icon = tab.icon;
            const count = subCounts[tab.key];
            return (
              <button
                key={tab.key}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-md transition-colors whitespace-nowrap ${
                  subTab === tab.key ? tab.activeClass : "text-muted-foreground hover:bg-muted"
                }`}
                onClick={() => { setSubTab(tab.key); setNewContent(""); setNewDueDate(""); }}
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
          <div className="flex items-center gap-1.5 mb-2 flex-wrap" data-testid="inline-add-task">
            <Input
              placeholder={mainTab === "todo" ? "새 할일 입력..." : "새 일정 입력..."}
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleAddTask(); }}
              className="h-7 text-sm flex-1 min-w-[120px]"
              data-testid="input-new-task-content"
            />
            <Input
              type="date"
              value={newDueDate}
              onChange={e => setNewDueDate(e.target.value)}
              className="h-7 text-sm w-[120px]"
              data-testid="input-new-task-date"
            />
            <Select value={newStaffId || "none"} onValueChange={v => setNewStaffId(v === "none" ? "" : v)}>
              <SelectTrigger className="h-7 text-xs w-[90px]" data-testid="select-new-task-staff">
                <SelectValue placeholder="담당자" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">없음</SelectItem>
                {staffList.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          {subFiltered.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-4">
              {mainTab === "todo" ? "할일이 없습니다" : "일정이 없습니다"}
            </div>
          )}
          {subFiltered.map(task => (
            <div key={`${task.type}-${task.id}`} data-testid={`dashboard-task-${task.id}`}>
              {editingTaskId === task.id ? (
                <div className="flex items-center gap-1.5 py-1">
                  <Input
                    value={editContent}
                    onChange={e => setEditContent(e.target.value)}
                    className="h-7 text-sm flex-1 min-w-0"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === "Enter" && editContent.trim()) handleSaveEdit(task);
                      if (e.key === "Escape") setEditingTaskId(null);
                    }}
                    data-testid={`input-edit-task-content-${task.id}`}
                  />
                  <Input
                    type="date"
                    value={editDueDate}
                    onChange={e => setEditDueDate(e.target.value)}
                    className="h-7 text-xs w-[120px] shrink-0"
                    data-testid={`input-edit-task-date-${task.id}`}
                  />
                  <Input
                    type="time"
                    value={editDueTime}
                    onChange={e => setEditDueTime(e.target.value)}
                    className="h-7 text-xs w-[90px] shrink-0"
                    data-testid={`input-edit-task-time-${task.id}`}
                  />
                  <button
                    className="shrink-0 text-green-600 hover:text-green-700"
                    disabled={!editContent.trim()}
                    onClick={() => handleSaveEdit(task)}
                    data-testid={`button-save-task-${task.id}`}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={() => setEditingTaskId(null)}
                    data-testid={`button-cancel-edit-${task.id}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 py-1 group">
                  <button
                    className={`shrink-0 w-4 h-4 rounded border ${mainTab === "todo" ? "border-muted-foreground/40 hover:border-cyan-500" : "border-muted-foreground/40 hover:border-indigo-500"} flex items-center justify-center`}
                    onClick={() => handleToggle(task)}
                    data-testid={`button-complete-task-${task.id}`}
                  />
                  {subTab === "all" && (
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
                    className={`text-sm flex-1 min-w-0 truncate cursor-pointer ${mainTab === "todo" ? "hover:text-cyan-600" : "hover:text-indigo-600"}`}
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
                  <button
                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-blue-500"
                    onClick={() => startEdit(task)}
                    data-testid={`button-edit-task-${task.id}`}
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
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
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
