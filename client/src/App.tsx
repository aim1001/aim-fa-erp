import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import InquiryList from "@/pages/inquiry-list";
import InquiryDetail from "@/pages/inquiry-detail";
import CompanyList from "@/pages/company-list";
import CompanyDetail from "@/pages/company-detail";
import CustomerList from "@/pages/customer-list";
import CustomerDetail from "@/pages/customer-detail";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/inquiries" component={InquiryList} />
      <Route path="/inquiries/:id" component={InquiryDetail} />
      <Route path="/customers" component={CustomerList} />
      <Route path="/customers/:id" component={CustomerDetail} />
      <Route path="/companies" component={CompanyList} />
      <Route path="/companies/:id" component={CompanyDetail} />
      <Route component={NotFound} />
    </Switch>
  );
}

const sidebarStyle = {
  "--sidebar-width": "16rem",
  "--sidebar-width-icon": "3rem",
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
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
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
