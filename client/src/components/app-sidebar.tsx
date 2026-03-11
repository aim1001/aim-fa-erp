import {
  LayoutDashboard, FileText, RefreshCw, Building2, Target, LogOut,
  Truck, Receipt, ReceiptText, Wallet, FolderKanban, ClipboardList,
  CheckCircle2, AlertCircle, WifiOff, Link2, Unlink, ChevronRight, ShoppingCart,
  Package, ClipboardCheck, FolderCheck, FolderOpen, Settings, Users, TrendingUp,
  Cloud
} from "lucide-react";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest, getQueryFn } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useEffect, useState } from "react";

export function AppSidebar() {
  const [location] = useLocation();
  const searchString = useSearch();
  const { toast } = useToast();
  const params = new URLSearchParams(searchString);

  const isInquiryPage = location === "/inquiries";
  const isProjectPage = location === "/projects";
  const isSalesDashboard = location === "/sales-dashboard";
  const isSalesSection = isSalesDashboard || isInquiryPage;
  const isProjectSection = isProjectPage;
  const isFinanceSection = ["/management", "/sales-invoices", "/purchase-invoices", "/payment-plan"].includes(location);
  const isTradeSection = ["/purchase-items", "/items"].includes(location);
  const isCompanySection = ["/customers", "/vendors", "/staff"].includes(location);

  const [salesOpen, setSalesOpen] = useState(isSalesSection);
  const [projectOpen, setProjectOpen] = useState(isProjectSection);
  const [financeOpen, setFinanceOpen] = useState(isFinanceSection);
  const [tradeOpen, setTradeOpen] = useState(isTradeSection);
  const [companyOpen, setCompanyOpen] = useState(isCompanySection);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('onedrive_connected') === 'true') {
      toast({ title: "OneDrive 연결 완료", description: "OneDrive가 성공적으로 연결되었습니다." });
      queryClient.invalidateQueries({ queryKey: ["/api/onedrive/status"] });
      window.history.replaceState({}, '', '/');
    }
    const error = urlParams.get('onedrive_error');
    if (error) {
      toast({ title: "OneDrive 연결 실패", description: decodeURIComponent(error), variant: "destructive" });
      window.history.replaceState({}, '', '/');
    }
  }, []);

  useEffect(() => {
    if (isSalesSection) setSalesOpen(true);
    if (isProjectSection) setProjectOpen(true);
    if (isFinanceSection) setFinanceOpen(true);
    if (isTradeSection) setTradeOpen(true);
    if (isCompanySection) setCompanyOpen(true);
  }, [location]);

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
      queryClient.invalidateQueries({ queryKey: ["/api/main-dashboard"] });
    },
    onError: (err: Error) => {
      toast({ title: "동기화 실패", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Sidebar>
      <SidebarContent>
        {/* 전체 대시보드 */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild data-active={location === "/"} data-testid="nav-main-dashboard">
                  <Link href="/"><LayoutDashboard className="h-4 w-4" /><span>대시보드</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* 영업 */}
        <SidebarGroup>
          <Collapsible open={salesOpen} onOpenChange={setSalesOpen} className="group/sales">
            <SidebarGroupLabel asChild className="cursor-pointer hover:text-sidebar-foreground transition-colors">
              <CollapsibleTrigger data-testid="nav-section-sales">
                <TrendingUp className="h-4 w-4" />
                <span>영업</span>
                <ChevronRight className="ml-auto h-4 w-4 transition-transform duration-200 group-data-[state=open]/sales:rotate-90" />
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild data-active={isSalesDashboard} data-testid="nav-sales-dashboard">
                      <Link href="/sales-dashboard"><ClipboardList className="h-4 w-4" /><span>영업 대시보드</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild data-active={isInquiryPage} data-testid="nav-inquiries">
                      <Link href="/inquiries"><FileText className="h-4 w-4" /><span>인콰이어리</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        {/* 프로젝트 */}
        <SidebarGroup>
          <Collapsible open={projectOpen} onOpenChange={setProjectOpen} className="group/project">
            <SidebarGroupLabel asChild className="cursor-pointer hover:text-sidebar-foreground transition-colors">
              <CollapsibleTrigger data-testid="nav-section-project">
                <FolderKanban className="h-4 w-4" />
                <span>프로젝트</span>
                <ChevronRight className="ml-auto h-4 w-4 transition-transform duration-200 group-data-[state=open]/project:rotate-90" />
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild data-active={isProjectPage && !params.get("status")} data-testid="nav-projects-all">
                      <Link href="/projects"><FolderOpen className="h-4 w-4" /><span>전체보기</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild data-active={isProjectPage && params.get("status") === "active"} data-testid="nav-projects-active">
                      <Link href="/projects?status=active"><Target className="h-4 w-4" /><span>진행중</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild data-active={isProjectPage && params.get("status") === "completed"} data-testid="nav-projects-completed">
                      <Link href="/projects?status=completed"><FolderCheck className="h-4 w-4" /><span>완료</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        {/* 경영지원 */}
        <SidebarGroup>
          <Collapsible open={financeOpen} onOpenChange={setFinanceOpen} className="group/finance">
            <SidebarGroupLabel asChild className="cursor-pointer hover:text-sidebar-foreground transition-colors">
              <CollapsibleTrigger data-testid="nav-section-finance">
                <Wallet className="h-4 w-4" />
                <span>경영지원</span>
                <ChevronRight className="ml-auto h-4 w-4 transition-transform duration-200 group-data-[state=open]/finance:rotate-90" />
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild data-active={location === "/management"} data-testid="nav-management">
                      <Link href="/management"><ClipboardList className="h-4 w-4" /><span>경영 대시보드</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild data-active={location === "/sales-invoices"} data-testid="nav-sales-invoices">
                      <Link href="/sales-invoices"><Receipt className="h-4 w-4" /><span>매출계산서</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild data-active={location === "/purchase-invoices"} data-testid="nav-purchase-invoices">
                      <Link href="/purchase-invoices"><ReceiptText className="h-4 w-4" /><span>매입계산서</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild data-active={location === "/payment-plan"} data-testid="nav-payment-plan">
                      <Link href="/payment-plan"><Wallet className="h-4 w-4" /><span>자금계획</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        {/* 구매/판매 */}
        <SidebarGroup>
          <Collapsible open={tradeOpen} onOpenChange={setTradeOpen} className="group/trade">
            <SidebarGroupLabel asChild className="cursor-pointer hover:text-sidebar-foreground transition-colors">
              <CollapsibleTrigger data-testid="nav-section-trade">
                <ShoppingCart className="h-4 w-4" />
                <span>구매/판매</span>
                <ChevronRight className="ml-auto h-4 w-4 transition-transform duration-200 group-data-[state=open]/trade:rotate-90" />
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild data-active={location === "/purchase-items"} data-testid="nav-purchasing">
                      <Link href="/purchase-items"><ShoppingCart className="h-4 w-4" /><span>구매품관리</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild data-active={location === "/items"} data-testid="nav-products">
                      <Link href="/items"><Package className="h-4 w-4" /><span>판매제품관리</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild data-active={location === "/purchase-orders"} data-testid="nav-orders">
                      <Link href="/purchase-orders"><ClipboardCheck className="h-4 w-4" /><span>발주관리</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        {/* 업체관리 */}
        <SidebarGroup>
          <Collapsible open={companyOpen} onOpenChange={setCompanyOpen} className="group/company">
            <SidebarGroupLabel asChild className="cursor-pointer hover:text-sidebar-foreground transition-colors">
              <CollapsibleTrigger data-testid="nav-section-company">
                <Building2 className="h-4 w-4" />
                <span>업체관리</span>
                <ChevronRight className="ml-auto h-4 w-4 transition-transform duration-200 group-data-[state=open]/company:rotate-90" />
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild data-active={location === "/customers"} data-testid="nav-customers">
                      <Link href="/customers"><Building2 className="h-4 w-4" /><span>고객사</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild data-active={location === "/vendors"} data-testid="nav-vendors">
                      <Link href="/vendors"><Truck className="h-4 w-4" /><span>공급업체</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild data-active={location === "/staff"} data-testid="nav-staff">
                      <Link href="/staff"><Users className="h-4 w-4" /><span>인력풀</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        {/* OneDrive */}
        <SidebarGroup>
          <Collapsible className="group/onedrive">
            <SidebarGroupLabel asChild className="cursor-pointer hover:text-sidebar-foreground transition-colors">
              <CollapsibleTrigger data-testid="nav-section-onedrive">
                <Cloud className="h-4 w-4" />
                <span>OneDrive</span>
                {!statusLoading && onedriveStatus?.connected && (
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                )}
                {!statusLoading && onedriveStatus && !onedriveStatus.connected && (
                  <WifiOff className="h-3 w-3 text-destructive" />
                )}
                <ChevronRight className="ml-auto h-4 w-4 transition-transform duration-200 group-data-[state=open]/onedrive:rotate-90" />
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
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
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        {/* 설정 & 로그아웃 */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={location === "/settings"}>
                  <Link href="/settings" data-testid="link-settings">
                    <Settings className="h-4 w-4" />
                    <span>설정</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            <div className="px-2 mt-1">
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
