import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import NotFound from "@/pages/not-found";
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
import Login from "@/pages/login";
import { getQueryFn } from "@/lib/queryClient";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
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
      <Route component={NotFound} />
    </Switch>
  );
}

const sidebarStyle = {
  "--sidebar-width": "16rem",
  "--sidebar-width-icon": "3rem",
};

function AuthenticatedApp() {
  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1">
          <header className="flex items-center gap-2 p-2 border-b">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <span className="text-sm font-medium text-muted-foreground">Sales Manager</span>
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
