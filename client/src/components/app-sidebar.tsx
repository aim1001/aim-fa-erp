import { LayoutDashboard, FileText, RefreshCw, Building2, Target, Trophy, XCircle, LogOut, Truck, Receipt, ReceiptText, Calendar, Clock, Wallet, FolderKanban, ClipboardList, CheckCircle2, AlertCircle, WifiOff, Link2, Unlink } from "lucide-react";
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
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest, getQueryFn } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useEffect } from "react";

export function AppSidebar() {
  const [location] = useLocation();
  const searchString = useSearch();
  const { toast } = useToast();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('onedrive_connected') === 'true') {
      toast({ title: "OneDrive 연결 완료", description: "OneDrive가 성공적으로 연결되었습니다." });
      queryClient.invalidateQueries({ queryKey: ["/api/onedrive/status"] });
      window.history.replaceState({}, '', '/');
    }
    const error = params.get('onedrive_error');
    if (error) {
      toast({ title: "OneDrive 연결 실패", description: decodeURIComponent(error), variant: "destructive" });
      window.history.replaceState({}, '', '/');
    }
  }, []);

  const { data: onedriveStatus, isLoading: statusLoading } = useQuery<{
    connected: boolean;
    message: string;
    expiresAt?: string;
    accountInfo?: string;
    errorType?: string;
    authUrl?: string;
  } | null>({
    queryKey: ["/api/onedrive/status"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    refetchInterval: 5 * 60 * 1000,
    staleTime: 2 * 60 * 1000,
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("GET", "/api/onedrive/auth");
      return res.json();
    },
    onSuccess: (data) => {
      if (data.authUrl) {
        window.open(data.authUrl, '_blank');
      }
    },
    onError: (err: Error) => {
      toast({ title: "연결 시작 실패", description: err.message, variant: "destructive" });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/onedrive/disconnect");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/onedrive/status"] });
      toast({ title: "연결 해제됨", description: "OneDrive 연결이 해제되었습니다." });
    },
    onError: (err: Error) => {
      toast({ title: "연결 해제 실패", description: err.message, variant: "destructive" });
    },
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/onedrive/refresh");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/onedrive/status"], data);
      toast({
        title: data.connected ? "연결 확인됨" : "연결 실패",
        description: data.message,
        variant: data.connected ? "default" : "destructive",
      });
    },
    onError: (err: Error) => {
      toast({ title: "연결 확인 실패", description: err.message, variant: "destructive" });
    },
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
              <SidebarMenuItem>
                <SidebarMenuButton asChild data-active={location === "/management"} data-testid="nav-management">
                  <Link href="/management"><ClipboardList /><span>경영지원 대시보드</span></Link>
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
            <div className="px-2 space-y-2">
              <div className="flex items-center gap-2 px-1 py-1.5 text-xs" data-testid="status-onedrive-connection">
                {statusLoading ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    <span className="text-muted-foreground">확인 중...</span>
                  </>
                ) : !onedriveStatus ? (
                  <>
                    <AlertCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground truncate">상태 확인 불가</span>
                  </>
                ) : onedriveStatus.connected ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-green-600 dark:text-green-400 truncate cursor-default">
                          {onedriveStatus.accountInfo || "연결됨"}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        <p>{onedriveStatus.message}</p>
                      </TooltipContent>
                    </Tooltip>
                  </>
                ) : (
                  <>
                    <WifiOff className="h-3.5 w-3.5 text-destructive shrink-0" />
                    <span className="text-destructive truncate">연결 안 됨</span>
                  </>
                )}
                {onedriveStatus?.connected && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => refreshMutation.mutate()}
                        disabled={refreshMutation.isPending}
                        className="ml-auto shrink-0"
                        data-testid="button-refresh-onedrive"
                      >
                        <RefreshCw className={`text-muted-foreground ${refreshMutation.isPending ? "animate-spin" : ""}`} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <p>연결 상태 새로고침</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>

              {onedriveStatus?.connected ? (
                <>
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
                  <Button
                    variant="ghost"
                    className="w-full text-muted-foreground"
                    onClick={() => disconnectMutation.mutate()}
                    disabled={disconnectMutation.isPending}
                    data-testid="button-disconnect-onedrive"
                  >
                    <Unlink className="h-4 w-4" />
                    <span>연결 해제</span>
                  </Button>
                </>
              ) : !statusLoading && (
                <Button
                  variant="default"
                  className="w-full"
                  onClick={() => connectMutation.mutate()}
                  disabled={connectMutation.isPending}
                  data-testid="button-connect-onedrive"
                >
                  <Link2 className="h-4 w-4" />
                  <span>{connectMutation.isPending ? "연결 중..." : "OneDrive 연결"}</span>
                </Button>
              )}
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
