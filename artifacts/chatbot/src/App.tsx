import { useEffect, useRef } from "react";
import { Switch, Route, Redirect, useLocation, Router as WouterRouter } from "wouter";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AdminAuthProvider } from "@/context/admin-auth";
import { ThemeProvider } from "@/context/theme";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
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
import { useAdminAuth } from "@/context/admin-auth";

const queryClient = new QueryClient();

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk" as const,
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
    socialButtonsPlacement: "bottom" as const,
  },
  variables: {
    colorPrimary: "hsl(262 83% 58%)",
    colorForeground: "hsl(0 0% 98%)",
    colorMutedForeground: "hsl(240 5% 65%)",
    colorBackground: "hsl(240 10% 6%)",
    colorInput: "hsl(240 5% 14%)",
    colorInputForeground: "hsl(0 0% 98%)",
    colorNeutral: "hsl(240 5% 40%)",
    colorDanger: "hsl(0 72% 55%)",
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[hsl(240_10%_6%)] border border-[hsl(240_5%_12%)] rounded-xl w-[440px] max-w-full overflow-hidden shadow-2xl shadow-black/40",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[hsl(0_0%_98%)] font-bold",
    headerSubtitle: "text-[hsl(240_5%_65%)]",
    socialButtonsBlockButtonText: "text-[hsl(0_0%_98%)]",
    formFieldLabel: "text-[hsl(0_0%_85%)] text-sm",
    footerActionLink: "text-[hsl(262_83%_70%)] hover:text-[hsl(262_83%_80%)]",
    footerActionText: "text-[hsl(240_5%_65%)]",
    dividerText: "text-[hsl(240_5%_55%)]",
    identityPreviewEditButton: "text-[hsl(262_83%_70%)]",
    formFieldSuccessText: "text-green-400",
    alertText: "text-[hsl(0_0%_85%)]",
    logoBox: "py-1",
    logoImage: "w-10 h-10",
    socialButtonsBlockButton: "border-[hsl(240_5%_18%)] bg-[hsl(240_5%_10%)] hover:bg-[hsl(240_5%_14%)] text-[hsl(0_0%_98%)]",
    formButtonPrimary: "bg-[hsl(262_83%_58%)] hover:bg-[hsl(262_83%_50%)] text-white",
    formFieldInput: "bg-[hsl(240_5%_10%)] border-[hsl(240_5%_18%)] text-[hsl(0_0%_98%)] placeholder:text-[hsl(240_5%_45%)]",
    footerAction: "bg-[hsl(240_5%_8%)]",
    dividerLine: "bg-[hsl(240_5%_18%)]",
    alert: "bg-[hsl(0_62%_20%/0.3)] border-[hsl(0_62%_30%)]",
    otpCodeFieldInput: "bg-[hsl(240_5%_10%)] border-[hsl(240_5%_18%)] text-[hsl(0_0%_98%)]",
    formFieldRow: "",
    main: "",
  },
};

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/console" />
      </Show>
      <Show when="signed-out">
        <Landing />
      </Show>
    </>
  );
}

function ConsolePage() {
  return (
    <>
      <Show when="signed-in">
        <Console />
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function DashboardGuard({ children }: { children: React.ReactNode }) {
  const { token } = useAdminAuth();
  if (!token) return <DashboardLogin />;
  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route path="/console" component={ConsolePage} />
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

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "مرحباً بعودتك",
            subtitle: "سجّل دخولك للوصول إلى لوحة التحكم",
          },
        },
        signUp: {
          start: {
            title: "أنشئ حسابك",
            subtitle: "ابدأ باستخدام CommandCode API Gateway",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AdminAuthProvider>
            <ClerkQueryClientCacheInvalidator />
            <Router />
            <Toaster />
          </AdminAuthProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <ThemeProvider>
      <WouterRouter base={basePath}>
        <ClerkProviderWithRoutes />
      </WouterRouter>
    </ThemeProvider>
  );
}

export default App;
