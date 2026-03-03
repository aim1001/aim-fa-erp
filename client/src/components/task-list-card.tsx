import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { ListTodo } from "lucide-react";

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

export function TaskListCard({ onInquiryClick }: { onInquiryClick?: (inquiryId: string) => void } = {}) {
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
              <button
                className="text-xs font-mono text-cyan-600 hover:underline shrink-0"
                onClick={() => onInquiryClick?.(task.inquiryId)}
                data-testid={`link-inquiry-${task.id}`}
              >
                {task.inquiryNumber}
              </button>
              <span className="text-xs text-muted-foreground shrink-0 max-w-[80px] truncate">{task.customerName}</span>
              <span
                className="text-sm flex-1 min-w-0 truncate cursor-pointer hover:text-cyan-600"
                onClick={() => onInquiryClick?.(task.inquiryId)}
              >
                {task.content}
              </span>
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
