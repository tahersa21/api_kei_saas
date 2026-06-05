import { type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAdminAuth } from "@/context/admin-auth";
import {
  Terminal, LayoutDashboard, Key, Users, ScrollText, LogOut, ChevronRight,
  Server, Globe, UserCircle, Settings, GitBranch, FlaskConical, Cpu,
} from "lucide-react";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/users", label: "Users", icon: UserCircle },
  { href: "/dashboard/cc-keys", label: "CC Keys", icon: Key },
  { href: "/dashboard/rc-keys", label: "RC Keys", icon: Server },
  { href: "/dashboard/user-keys", label: "User Keys", icon: Users },
  { href: "/dashboard/providers", label: "Providers", icon: Globe },
  { href: "/dashboard/models", label: "Models", icon: Cpu },
  { href: "/dashboard/routing", label: "Routing", icon: GitBranch },
  { href: "/dashboard/playground", label: "Playground", icon: FlaskConical },
  { href: "/dashboard/logs", label: "Logs", icon: ScrollText },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { logout } = useAdminAuth();
  const [location] = useLocation();

  return (
    <div className="flex h-screen max-h-screen bg-background text-foreground font-mono overflow-hidden">
      {/* Sidebar */}
      <aside className="flex-none w-52 border-r border-border/50 bg-card/30 flex flex-col">
        <div className="flex items-center gap-2 px-4 py-4 border-b border-border/50">
          <Terminal className="w-4 h-4 text-primary" />
          <span className="font-bold tracking-tight text-sm">CommandCode</span>
        </div>

        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {NAV.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? location === href : location.startsWith(href);
            return (
              <Link key={href} href={href}>
                <a className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-xs transition-colors cursor-pointer
                  ${active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/20"}`}>
                  <Icon className="w-3.5 h-3.5 flex-none" />
                  <span>{label}</span>
                  {active && <ChevronRight className="w-3 h-3 ml-auto opacity-50" />}
                </a>
              </Link>
            );
          })}
        </nav>

        <div className="px-2 pb-4">
          <button
            onClick={logout}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-md text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
