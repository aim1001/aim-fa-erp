import { Switch, Route } from "wouter";
import { queryClient, apiRequest } from "./lib/queryClient";
import { QueryClientProvider, useQuery, useMutation } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { AppSidebar } from "@/components/app-sidebar";
import { MessageSquare, Check, Trash2, Inbox } from "lucide-react";
import { useState } from "react";
import NotFound from "@/pages/not-found";
import MainDashboard from "@/pages/main-dashboard";
import Dashboard from "@/pages/dashboard";
import InquiryList from "@/pages/inquiry-list";
import CompanyList from "@/pages/company-list";
import CompanyDetail from "@/pages/company-detail";
import CustomerList from "@/pages/customer-list";
import CustomerDetail from "@/pages/customer-detail";
import VendorList from "@/pages/vendor-list";
import SalesInvoiceList from "@/pages/sales-invoice-list";
import PurchaseInvoiceList from "@/pages/purchase-invoice-list";
import PaymentPlan from "@/pages/payment-plan";
import ProjectList from "@/pages/project-list";
import ManagementDashboard from "@/pages/management-dashboard";
import ItemList from "@/pages/item-list";
import PurchaseItemList from "@/pages/purchase-item-list";
import PurchaseOrderList from "@/pages/purchase-order-list";
import SettingsPage from "@/pages/settings";
import StaffList from "@/pages/staff-list";
import Login from "@/pages/login";
import { getQueryFn } from "@/lib/queryClient";

function Router() {
  return (
    <Switch>
      <Route path="/" component={MainDashboard} />
      <Route path="/sales-dashboard" component={Dashboard} />
      <Route path="/inquiries" component={InquiryList} />
      <Route path="/customers" component={CustomerList} />
      <Route path="/customers/:id" component={CustomerDetail} />
      <Route path="/companies" component={CompanyList} />
      <Route path="/companies/:id" component={CompanyDetail} />
      <Route path="/vendors" component={VendorList} />
      <Route path="/sales-invoices" component={SalesInvoiceList} />
      <Route path="/purchase-invoices" component={PurchaseInvoiceList} />
      <Route path="/payment-plan" component={PaymentPlan} />
      <Route path="/projects" component={ProjectList} />
      <Route path="/management" component={ManagementDashboard} />
      <Route path="/items" component={ItemList} />
      <Route path="/purchase-items" component={PurchaseItemList} />
      <Route path="/purchase-orders" component={PurchaseOrderList} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/staff" component={StaffList} />
      <Route component={NotFound} />
    </Switch>
  );
}

const sidebarStyle = {
  "--sidebar-width": "16rem",
  "--sidebar-width-icon": "3rem",
};

function TelegramMemoButton() {
  const [open, setOpen] = useState(false);

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/telegram/memos/unread-count"],
    refetchInterval: 30000,
  });

  const { data: memos, refetch: refetchMemos, isLoading: memosLoading } = useQuery<Array<{
    id: string; messageId: number; text: string; fromName: string | null; isRead: boolean; createdAt: string;
  }>>({
    queryKey: ["/api/telegram/memos"],
    enabled: open,
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("PATCH", `/api/telegram/memos/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/telegram/memos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/telegram/memos/unread-count"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/telegram/memos/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/telegram/memos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/telegram/memos/unread-count"] });
    },
  });

  const unreadCount = unreadData?.count || 0;

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
    return `${(d.getMonth() + 1)}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  };

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) refetchMemos(); }}>
      <PopoverTrigger asChild>
        <button className="relative p-1.5 rounded-md hover:bg-accent transition-colors" data-testid="button-telegram-memos">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1" data-testid="badge-unread-count">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-3 border-b">
          <h4 className="text-sm font-semibold">텔레그램 메모</h4>
          <p className="text-xs text-muted-foreground">봇에게 보낸 메시지</p>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {memosLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <p className="text-sm">불러오는 중...</p>
            </div>
          ) : !memos || memos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Inbox className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">메모가 없습니다</p>
              <p className="text-xs">봇과 1:1 채팅에서 메시지를 보내세요</p>
            </div>
          ) : (
            memos.map((memo) => (
              <div
                key={memo.id}
                className={`p-3 border-b last:border-b-0 ${!memo.isRead ? "bg-blue-50/50 dark:bg-blue-950/20" : ""}`}
                data-testid={`memo-item-${memo.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm whitespace-pre-wrap break-words">{memo.text}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">{memo.fromName}</span>
                      <span className="text-xs text-muted-foreground">{formatTime(memo.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    {!memo.isRead && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => markReadMutation.mutate(memo.id)}
                        data-testid={`button-mark-read-${memo.id}`}
                      >
                        <Check className="h-3 w-3" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteMutation.mutate(memo.id)}
                      data-testid={`button-delete-memo-${memo.id}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AuthenticatedApp() {
  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1">
          <header className="flex items-center gap-2 p-2 border-b">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <span className="text-sm font-medium text-muted-foreground">Sales Manager</span>
            <div className="ml-auto">
              <TelegramMemoButton />
            </div>
          </header>
          <main className="flex-1 overflow-hidden">
            <Router />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function AppContent() {
  const { data: authStatus, isLoading, refetch } = useQuery<{ authenticated: boolean }>({
    queryKey: ["/api/auth/status"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground">로딩 중...</div>
      </div>
    );
  }

  if (!authStatus?.authenticated) {
    return <Login onSuccess={() => refetch()} />;
  }

  return <AuthenticatedApp />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppContent />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
