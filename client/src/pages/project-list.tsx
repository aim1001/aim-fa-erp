import { useQuery, useMutation } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { RefreshCw, FolderOpen, ExternalLink } from "lucide-react";
import { useState } from "react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Project } from "@shared/schema";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export default function ProjectList() {
  const { toast } = useToast();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());

  const { data: years, isLoading: yearsLoading } = useQuery<number[]>({
    queryKey: ["/api/projects/years"],
  });

  const { data: projects, isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects", year],
    queryFn: async () => {
      const res = await fetch(`/api/projects?year=${year}`);
      return res.json();
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/projects/sync?year=${year}`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "동기화 완료", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    },
    onError: (err: Error) => {
      toast({ title: "동기화 실패", description: err.message, variant: "destructive" });
    },
  });

  const statusLabel = (status: string | null) => {
    switch (status) {
      case "active": return { text: "진행중", className: "text-blue-700 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-400" };
      case "completed": return { text: "완료", className: "text-green-700 bg-green-50 dark:bg-green-900/30 dark:text-green-400" };
      case "hold": return { text: "보류", className: "text-orange-700 bg-orange-50 dark:bg-orange-900/30 dark:text-orange-400" };
      default: return { text: status || "진행중", className: "text-gray-700 bg-gray-50 dark:bg-gray-900/30 dark:text-gray-400" };
    }
  };

  return (
    <div className="p-6 space-y-4 overflow-auto h-full">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-semibold" data-testid="text-project-list-title">프로젝트</h1>
        <div className="flex items-center gap-2">
          {yearsLoading ? (
            <Skeleton className="h-9 w-24" />
          ) : (
            <Select value={String(year)} onValueChange={v => setYear(parseInt(v))}>
              <SelectTrigger className="w-24 h-9" data-testid="select-project-year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(years || []).map(y => (
                  <SelectItem key={y} value={String(y)}>{y}년</SelectItem>
                ))}
                {years && !years.includes(year) && (
                  <SelectItem value={String(year)}>{year}년</SelectItem>
                )}
              </SelectContent>
            </Select>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            data-testid="button-sync-projects"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            동기화
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10" />)}</div>
      ) : projects && projects.length > 0 ? (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left py-2 px-3 font-medium text-xs w-24">번호</th>
                <th className="text-left py-2 px-3 font-medium text-xs">고객사</th>
                <th className="text-left py-2 px-3 font-medium text-xs">내용</th>
                <th className="text-center py-2 px-3 font-medium text-xs w-16">상태</th>
                <th className="text-center py-2 px-3 font-medium text-xs w-12">폴더</th>
              </tr>
            </thead>
            <tbody>
              {projects.map(p => {
                const status = statusLabel(p.status);
                return (
                  <tr
                    key={p.id}
                    className="border-b last:border-b-0 hover:bg-muted/30 transition-colors"
                    data-testid={`row-project-${p.id}`}
                  >
                    <td className="py-2 px-3">
                      <span className="text-xs font-mono font-medium" data-testid={`text-project-number-${p.id}`}>{p.projectNumber || "-"}</span>
                    </td>
                    <td className="py-2 px-3">
                      <span className="text-sm font-medium" data-testid={`text-project-customer-${p.id}`}>{p.customerName || "-"}</span>
                    </td>
                    <td className="py-2 px-3">
                      <span className="text-sm text-muted-foreground" data-testid={`text-project-desc-${p.id}`}>{p.description || "-"}</span>
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${status.className}`} data-testid={`text-project-status-${p.id}`}>
                        {status.text}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-center">
                      {p.onedriveWebUrl ? (
                        <a
                          href={p.onedriveWebUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          data-testid={`link-project-folder-${p.id}`}
                        >
                          <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                        </a>
                      ) : (
                        <FolderOpen className="h-4 w-4 text-muted-foreground/30" />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <FolderOpen className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <p>프로젝트가 없습니다. "동기화" 버튼을 눌러 OneDrive에서 가져오세요.</p>
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        {projects && projects.length > 0 && `총 ${projects.length}건`}
      </div>
    </div>
  );
}
