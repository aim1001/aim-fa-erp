import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ListTodo, CalendarDays, RefreshCw } from "lucide-react";

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

type UnifiedTask = {
  id: string;
  parentId: string;
  type: "inquiry" | "project";
  content: string;
  dueDate: string | null;
  dueTime: string | null;
  number: string;
  customerName: string;
  calendarEventId: string | null;
};

export function TaskListCard({ onInquiryClick, onProjectClick }: { onInquiryClick?: (inquiryId: string) => void; onProjectClick?: (projectId: string) => void } = {}) {
  const { toast } = useToast();
  const { data: inquiryTasks = [], isLoading: il } = useQuery<InquiryTask[]>({
    queryKey: ["/api/tasks/pending"],
  });

  const { data: projectTasks = [], isLoading: pl } = useQuery<ProjectPendingTask[]>({
    queryKey: ["/api/project-tasks/pending"],
  });

  const syncCalendarMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/tasks/sync-calendar", {});
      return res.json();
    },
    onSuccess: (data: { synced: number; failed: number; total: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/project-tasks/pending"] });
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

  const isOverdue = (d: string | null) => {
    if (!d) return false;
    return d < new Date().toISOString().split("T")[0];
  };

  const isLoading = il || pl;
  if (isLoading) return <Skeleton className="h-32" />;

  const unsyncedCount = [
    ...inquiryTasks.filter(t => t.dueDate && !t.calendarEventId),
    ...projectTasks.filter(t => t.dueDate && !t.calendarEventId),
  ].length;

  const allTasks: UnifiedTask[] = [
    ...inquiryTasks.map(t => ({
      id: t.id,
      parentId: t.inquiryId,
      type: "inquiry" as const,
      content: t.content,
      dueDate: t.dueDate,
      dueTime: t.dueTime,
      number: t.inquiryNumber,
      customerName: t.customerName,
      calendarEventId: t.calendarEventId,
    })),
    ...projectTasks.map(t => ({
      id: t.id,
      parentId: t.projectId,
      type: "project" as const,
      content: t.content,
      dueDate: t.dueDate,
      dueTime: t.dueTime,
      number: t.projectNumber,
      customerName: t.customerName,
      calendarEventId: t.calendarEventId,
    })),
  ].sort((a, b) => {
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return 0;
  });

  if (allTasks.length === 0) return null;

  return (
    <Card className="border-l-4 border-l-cyan-500" data-testid="card-pending-tasks">
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-2 rounded-lg bg-cyan-50 dark:bg-cyan-900/20">
            <ListTodo className="h-5 w-5 text-cyan-600" />
          </div>
          <h2 className="font-semibold text-base">할일</h2>
          <span className="text-xs text-muted-foreground">{allTasks.length}건</span>
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
        <div className="space-y-1 max-h-[240px] overflow-y-auto">
          {allTasks.map(task => (
            <div key={`${task.type}-${task.id}`} className="flex items-center gap-2 py-1 group" data-testid={`dashboard-task-${task.id}`}>
              <button
                className="shrink-0 w-4 h-4 rounded border border-muted-foreground/40 hover:border-cyan-500 flex items-center justify-center"
                onClick={() => task.type === "inquiry"
                  ? toggleInquiryMutation.mutate({ id: task.id })
                  : toggleProjectMutation.mutate({ id: task.id })
                }
                data-testid={`button-complete-task-${task.id}`}
              />
              <button
                className="text-xs font-mono text-cyan-600 hover:underline shrink-0"
                onClick={() => task.type === "inquiry"
                  ? onInquiryClick?.(task.parentId)
                  : onProjectClick?.(task.parentId)
                }
                data-testid={`link-parent-${task.id}`}
              >
                {task.type === "project" ? `P:${task.number}` : task.number}
              </button>
              <span className="text-xs text-muted-foreground shrink-0 max-w-[80px] truncate">{task.customerName}</span>
              <span
                className="text-sm flex-1 min-w-0 truncate cursor-pointer hover:text-cyan-600"
                onClick={() => task.type === "inquiry"
                  ? onInquiryClick?.(task.parentId)
                  : onProjectClick?.(task.parentId)
                }
              >
                {task.content}
              </span>
              {task.dueDate && (
                <span className={`text-[10px] shrink-0 inline-flex items-center gap-0.5 ${isOverdue(task.dueDate) ? "text-red-500 font-medium" : "text-muted-foreground"}`}>
                  <CalendarDays className={`h-2.5 w-2.5 ${task.calendarEventId ? "text-green-500" : "text-muted-foreground/40"}`} />
                  {task.dueDate}{task.dueTime ? ` ${task.dueTime}` : ""}
                </span>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
