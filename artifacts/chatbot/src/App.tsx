import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AdminAuthProvider, useAdminAuth } from "@/context/admin-auth";
import { ThemeProvider } from "@/context/theme";
import NotFound from "@/pages/not-found";
import Console from "@/pages/console";
import Chat from "@/pages/chat";
import DashboardLogin from "@/pages/dashboard/login";
import DashboardLayout from "@/pages/dashboard/layout";
import DashboardOverview from "@/pages/dashboard/overview";
import CcKeysPage from "@/pages/dashboard/cc-keys";
import RcKeysPage from "@/pages/dashboard/rc-keys";
import UserKeysPage from "@/pages/dashboard/user-keys";
import ProvidersPage from "@/pages/dashboard/providers";
import LogsPage from "@/pages/dashboard/logs";

const queryClient = new QueryClient();

function DashboardGuard({ children }: { children: React.ReactNode }) {
  const { token } = useAdminAuth();
  if (!token) return <DashboardLogin />;
  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Console} />
      <Route path="/chat" component={Chat} />
      <Route path="/dashboard">
        {() => (
          <DashboardGuard>
            <DashboardLayout><DashboardOverview /></DashboardLayout>
          </DashboardGuard>
        )}
      </Route>
      <Route path="/dashboard/cc-keys">
        {() => (
          <DashboardGuard>
            <DashboardLayout><CcKeysPage /></DashboardLayout>
          </DashboardGuard>
        )}
      </Route>
      <Route path="/dashboard/rc-keys">
        {() => (
          <DashboardGuard>
            <DashboardLayout><RcKeysPage /></DashboardLayout>
          </DashboardGuard>
        )}
      </Route>
      <Route path="/dashboard/user-keys">
        {() => (
          <DashboardGuard>
            <DashboardLayout><UserKeysPage /></DashboardLayout>
          </DashboardGuard>
        )}
      </Route>
      <Route path="/dashboard/providers">
        {() => (
          <DashboardGuard>
            <DashboardLayout><ProvidersPage /></DashboardLayout>
          </DashboardGuard>
        )}
      </Route>
      <Route path="/dashboard/logs">
        {() => (
          <DashboardGuard>
            <DashboardLayout><LogsPage /></DashboardLayout>
          </DashboardGuard>
        )}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AdminAuthProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
          </AdminAuthProvider>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
