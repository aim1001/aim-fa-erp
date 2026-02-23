import { LayoutDashboard, FileText, Plus, RefreshCw, Building2 } from "lucide-react";
import { Link, useLocation, useSearch } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const navItems = [
  { title: "대시보드", url: "/", icon: LayoutDashboard },
  { title: "인콰이어리 목록", url: "/inquiries", icon: FileText },
  { title: "인콰이어리 추가", url: "/inquiries/new", icon: Plus },
  { title: "고객사 목록", url: "/companies", icon: Building2 },
];

export function AppSidebar() {
  const [location] = useLocation();
  const searchString = useSearch();
  const { toast } = useToast();

  const { data: years } = useQuery<number[]>({
    queryKey: ["/api/years"],
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/sync-onedrive");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "동기화 완료", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/inquiries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/years"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    },
    onError: (err: Error) => {
      toast({ title: "동기화 실패", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>영업 관리</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    data-active={location === item.url}
                    data-testid={`nav-${item.url.replace(/\//g, '-').slice(1) || 'dashboard'}`}
                  >
                    <Link href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>연도별</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {(years || []).map((year) => (
                <SidebarMenuItem key={year}>
                  <SidebarMenuButton
                    asChild
                    data-active={location === "/inquiries" && new URLSearchParams(searchString).get("year") === String(year)}
                    data-testid={`nav-year-${year}`}
                  >
                    <Link href={`/inquiries?year=${year}`}>
                      <FileText />
                      <span>{year}년</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>OneDrive</SidebarGroupLabel>
          <SidebarGroupContent>
            <div className="px-2">
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                data-testid="button-sync-onedrive"
              >
                <RefreshCw className={syncMutation.isPending ? "animate-spin" : ""} />
                <span>{syncMutation.isPending ? "동기화 중..." : "OneDrive 동기화"}</span>
              </Button>
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
