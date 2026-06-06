import {
  LayoutDashboard, LogOut,
  Wallet, FolderKanban,
  ChevronRight, Package,
  Settings, Users, TrendingUp, CalendarDays
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
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function AppSidebar() {
  const [location] = useLocation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);

  const isInquiryPage = location === "/inquiries";
  const isProjectPage = location === "/projects";
  const isSalesDashboard = location === "/sales-dashboard";
  const isOpticsCalculator = location === "/optics-calculator";
  const isSalesSection = isSalesDashboard || isInquiryPage || location === "/customers" || location === "/items";
  const isProjectSection = isProjectPage || location === "/sales-invoices";
  const isFinanceSection = ["/management", "/payment-plan"].includes(location);
  const isPurchaseSection = ["/purchase-items", "/purchase-orders", "/vendor-ledger", "/vendors", "/purchase-invoices"].includes(location);

  const [salesOpen, setSalesOpen] = useState(isSalesSection);
  const [projectOpen, setProjectOpen] = useState(isProjectSection);
  const [financeOpen, setFinanceOpen] = useState(isFinanceSection);
  const [purchaseOpen, setPurchaseOpen] = useState(isPurchaseSection);

  useEffect(() => {
    if (isSalesSection) setSalesOpen(true);
    if (isProjectSection) setProjectOpen(true);
    if (isFinanceSection) setFinanceOpen(true);
    if (isPurchaseSection) setPurchaseOpen(true);
  }, [location]);

  const sectionLabelClass = "cursor-pointer hover:text-sidebar-foreground transition-colors";
  const activeSectionLabelClass = "text-sidebar-primary";

  return (
    <Sidebar>
      <SidebarContent>
        {/* 전체 대시보드 */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  data-active={location === "/"}
                  className="data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground"
                  data-testid="nav-main-dashboard"
                >
                  <Link href="/"><LayoutDashboard className="h-4 w-4" /><span>대시보드</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  data-active={location === "/calendar"}
                  className="data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground"
                  data-testid="nav-calendar"
                >
                  <Link href="/calendar"><CalendarDays className="h-4 w-4" /><span>캘린더</span></Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* 영업 */}
        <SidebarGroup className="py-1">
          <Collapsible open={salesOpen} onOpenChange={setSalesOpen} className="group/sales">
            <SidebarGroupLabel asChild className={cn(sectionLabelClass, isSalesSection && activeSectionLabelClass)}>
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
                    <SidebarMenuButton
                      asChild
                      size="sm"
                      data-active={isSalesDashboard}
                      className="pl-8 data-[active=true]:bg-sidebar-primary/10 data-[active=true]:text-sidebar-primary"
                      data-testid="nav-sales-dashboard"
                    >
                      <Link href="/sales-dashboard"><span>영업 대시보드</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      size="sm"
                      data-active={isInquiryPage}
                      className="pl-8 data-[active=true]:bg-sidebar-primary/10 data-[active=true]:text-sidebar-primary"
                      data-testid="nav-inquiries"
                    >
                      <Link href="/inquiries"><span>인콰이어리</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      size="sm"
                      data-active={location === "/customers"}
                      className="pl-8 data-[active=true]:bg-sidebar-primary/10 data-[active=true]:text-sidebar-primary"
                      data-testid="nav-customers"
                    >
                      <Link href="/customers"><span>고객사</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      size="sm"
                      data-active={location === "/items"}
                      className="pl-8 data-[active=true]:bg-sidebar-primary/10 data-[active=true]:text-sidebar-primary"
                      data-testid="nav-products"
                    >
                      <Link href="/items"><span>판매제품관리</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        {/* 프로젝트 */}
        <SidebarGroup className="py-1">
          <Collapsible open={projectOpen} onOpenChange={setProjectOpen} className="group/project">
            <SidebarGroupLabel asChild className={cn(sectionLabelClass, isProjectSection && activeSectionLabelClass)}>
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
                    <SidebarMenuButton
                      asChild
                      size="sm"
                      data-active={isProjectPage && !params.get("status")}
                      className="pl-8 data-[active=true]:bg-sidebar-primary/10 data-[active=true]:text-sidebar-primary"
                      data-testid="nav-projects-all"
                    >
                      <Link href="/projects"><span>전체보기</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      size="sm"
                      data-active={isProjectPage && params.get("status") === "active"}
                      className="pl-8 data-[active=true]:bg-sidebar-primary/10 data-[active=true]:text-sidebar-primary"
                      data-testid="nav-projects-active"
                    >
                      <Link href="/projects?status=active"><span>진행중</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      size="sm"
                      data-active={isProjectPage && params.get("status") === "completed"}
                      className="pl-8 data-[active=true]:bg-sidebar-primary/10 data-[active=true]:text-sidebar-primary"
                      data-testid="nav-projects-completed"
                    >
                      <Link href="/projects?status=completed"><span>완료</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      size="sm"
                      data-active={location === "/sales-invoices"}
                      className="pl-8 data-[active=true]:bg-sidebar-primary/10 data-[active=true]:text-sidebar-primary"
                      data-testid="nav-sales-invoices"
                    >
                      <Link href="/sales-invoices"><span>매출계산서</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        {/* 경영지원 */}
        <SidebarGroup className="py-1">
          <Collapsible open={financeOpen} onOpenChange={setFinanceOpen} className="group/finance">
            <SidebarGroupLabel asChild className={cn(sectionLabelClass, isFinanceSection && activeSectionLabelClass)}>
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
                    <SidebarMenuButton
                      asChild
                      size="sm"
                      data-active={location === "/management"}
                      className="pl-8 data-[active=true]:bg-sidebar-primary/10 data-[active=true]:text-sidebar-primary"
                      data-testid="nav-management"
                    >
                      <Link href="/management"><span>경영 대시보드</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      size="sm"
                      data-active={location === "/payment-plan"}
                      className="pl-8 data-[active=true]:bg-sidebar-primary/10 data-[active=true]:text-sidebar-primary"
                      data-testid="nav-payment-plan"
                    >
                      <Link href="/payment-plan"><span>자금계획</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        {/* 구매 */}
        <SidebarGroup className="py-1">
          <Collapsible open={purchaseOpen} onOpenChange={setPurchaseOpen} className="group/purchase">
            <SidebarGroupLabel asChild className={cn(sectionLabelClass, isPurchaseSection && activeSectionLabelClass)}>
              <CollapsibleTrigger data-testid="nav-section-purchase">
                <Package className="h-4 w-4" />
                <span>구매</span>
                <ChevronRight className="ml-auto h-4 w-4 transition-transform duration-200 group-data-[state=open]/purchase:rotate-90" />
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      size="sm"
                      data-active={location === "/purchase-items"}
                      className="pl-8 data-[active=true]:bg-sidebar-primary/10 data-[active=true]:text-sidebar-primary"
                      data-testid="nav-purchasing"
                    >
                      <Link href="/purchase-items"><span>구매품관리</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      size="sm"
                      data-active={location === "/purchase-invoices"}
                      className="pl-8 data-[active=true]:bg-sidebar-primary/10 data-[active=true]:text-sidebar-primary"
                      data-testid="nav-purchase-invoices"
                    >
                      <Link href="/purchase-invoices"><span>매입계산서</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      size="sm"
                      data-active={location === "/purchase-orders"}
                      className="pl-8 data-[active=true]:bg-sidebar-primary/10 data-[active=true]:text-sidebar-primary"
                      data-testid="nav-orders"
                    >
                      <Link href="/purchase-orders"><span>발주관리</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      size="sm"
                      data-active={location === "/vendors"}
                      className="pl-8 data-[active=true]:bg-sidebar-primary/10 data-[active=true]:text-sidebar-primary"
                      data-testid="nav-vendors"
                    >
                      <Link href="/vendors"><span>공급업체</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        {/* 설정 & 로그아웃 */}
        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  size="sm"
                  data-active={location === "/staff"}
                  className="data-[active=true]:bg-sidebar-primary/10 data-[active=true]:text-sidebar-primary"
                  data-testid="nav-staff"
                >
                  <Link href="/staff">
                    <Users className="h-4 w-4" />
                    <span>인력풀</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  size="sm"
                  isActive={location === "/settings"}
                  className="data-[active=true]:bg-sidebar-primary/10 data-[active=true]:text-sidebar-primary"
                >
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
                size="sm"
                className="w-full text-muted-foreground text-xs"
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
