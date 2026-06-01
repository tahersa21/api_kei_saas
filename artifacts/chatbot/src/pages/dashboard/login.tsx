import { useState } from "react";
import { useAdminAuth } from "@/context/admin-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Terminal, Lock, Loader2 } from "lucide-react";

export default function DashboardLogin() {
  const { login } = useAdminAuth();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setLoading(true);
    setError("");
    const result = await login(password);
    setLoading(false);
    if (!result.ok) setError(result.error ?? "Invalid password");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center font-mono">
      <div className="w-full max-w-sm space-y-6 px-4">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <Terminal className="w-6 h-6 text-primary" />
            <span className="font-bold text-lg tracking-tight">CommandCode</span>
          </div>
          <p className="text-xs text-muted-foreground uppercase tracking-widest">Admin Dashboard</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
            <Input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
              placeholder="Admin password"
              className="pl-9 h-10 bg-card border-border/50 font-mono text-sm"
              autoFocus
            />
          </div>

          {error && (
            <p className="text-xs text-destructive font-sans">{error}</p>
          )}

          <Button type="submit" disabled={loading || !password.trim()} className="w-full h-10 font-mono text-sm">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enter"}
          </Button>
        </form>
      </div>
    </div>
  );
}
