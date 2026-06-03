import { useState } from "react";
import { useAdminAuth } from "@/context/admin-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Terminal, Lock, Mail, Loader2 } from "lucide-react";

export default function DashboardLogin() {
  const { login } = useAdminAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    setError("");
    const result = await login(email, password);
    setLoading(false);
    if (!result.ok) setError(result.error ?? "Invalid credentials");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center font-mono">
      <div className="w-full max-w-sm space-y-6 px-4">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
              <Terminal className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight">CommandCode</span>
          </div>
          <p className="text-xs text-muted-foreground uppercase tracking-widest">Admin Access</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
            <Input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(""); }}
              placeholder="Admin email"
              className="pl-9 h-10 bg-card border-border/50 font-mono text-sm"
              autoFocus
              autoComplete="email"
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
            <Input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
              placeholder="Admin password"
              className="pl-9 h-10 bg-card border-border/50 font-mono text-sm"
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className="text-xs text-destructive font-sans">{error}</p>
          )}

          <Button
            type="submit"
            disabled={loading || !email.trim() || !password.trim()}
            className="w-full h-10 font-mono text-sm"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sign In"}
          </Button>
        </form>
      </div>
    </div>
  );
}
