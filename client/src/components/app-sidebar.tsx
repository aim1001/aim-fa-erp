import { LayoutDashboard, FileText, RefreshCw, Building2, Target, Trophy, XCircle, LogOut, Truck, Receipt, ReceiptText, Calendar, Clock, Wallet, FolderKanban } from "lucide-react";
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
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

export function AppSidebar() {
  const [location] = useLocation();
  const searchString = useSearch();
  const { toast } = useToast();

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
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild data-active={location === "/"} data-testid="nav-dashboard">
                  <Link href="/"><LayoutDashboard /><span>대시보드</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>영업</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild data-active={location === "/inquiries" && !new URLSearchParams(searchString).get("status")} data-testid="nav-inquiries">
                  <Link href="/inquiries"><FileText /><span>인콰이어리</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild data-active={location === "/inquiries" && new URLSearchParams(searchString).get("status") === "active"} data-testid="nav-quick-active">
                  <Link href="/inquiries?status=active"><Target /><span>진행중</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild data-active={location === "/inquiries" && new URLSearchParams(searchString).get("status") === "won"} data-testid="nav-quick-won">
                  <Link href="/inquiries?status=won"><Trophy /><span>수주</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild data-active={location === "/inquiries" && new URLSearchParams(searchString).get("status") === "lost"} data-testid="nav-quick-lost">
                  <Link href="/inquiries?status=lost"><XCircle /><span>실주</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            <SidebarSeparator className="my-1" />
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild data-active={location === "/inquiries" && new URLSearchParams(searchString).get("period") === "6m"} data-testid="nav-period-6m">
                  <Link href="/inquiries?period=6m"><Clock /><span>최근 6개월</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild data-active={location === "/inquiries" && new URLSearchParams(searchString).get("period") === "1y"} data-testid="nav-period-1y">
                  <Link href="/inquiries?period=1y"><Calendar /><span>최근 1년</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            <SidebarSeparator className="my-1" />
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild data-active={location === "/projects"} data-testid="nav-projects">
                  <Link href="/projects"><FolderKanban /><span>프로젝트</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>경영지원</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild data-active={location === "/sales-invoices"} data-testid="nav-sales-invoices">
                  <Link href="/sales-invoices"><Receipt /><span>매출계산서</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild data-active={location === "/purchase-invoices"} data-testid="nav-purchase-invoices">
                  <Link href="/purchase-invoices"><ReceiptText /><span>매입계산서</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild data-active={location === "/payment-plan"} data-testid="nav-payment-plan">
                  <Link href="/payment-plan"><Wallet /><span>자금계획</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>관리</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild data-active={location === "/customers"} data-testid="nav-customers">
                  <Link href="/customers"><Building2 /><span>고객사</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild data-active={location === "/vendors"} data-testid="nav-vendors">
                  <Link href="/vendors"><Truck /><span>공급업체</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
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

        <SidebarGroup>
          <SidebarGroupContent>
            <div className="px-2">
              <Button
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={async () => {
                  await fetch("/api/logout", { method: "POST", credentials: "include" });
                  queryClient.setQueryData(["/api/auth/status"], { authenticated: false });
                  queryClient.clear();
                  window.location.href = "/";
                }}
                data-testid="button-logout"
              >
                <LogOut className="h-4 w-4" />
                <span>로그아웃</span>
              </Button>
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
