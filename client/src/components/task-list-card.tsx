import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { ListTodo } from "lucide-react";

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
};

export function TaskListCard({ onInquiryClick, onProjectClick }: { onInquiryClick?: (inquiryId: string) => void; onProjectClick?: (projectId: string) => void } = {}) {
  const { data: inquiryTasks = [], isLoading: il } = useQuery<InquiryTask[]>({
    queryKey: ["/api/tasks/pending"],
  });

  const { data: projectTasks = [], isLoading: pl } = useQuery<ProjectPendingTask[]>({
    queryKey: ["/api/project-tasks/pending"],
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
                <span className={`text-[10px] shrink-0 ${isOverdue(task.dueDate) ? "text-red-500 font-medium" : "text-muted-foreground"}`}>
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
