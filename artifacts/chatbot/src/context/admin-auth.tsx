import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

type AdminAuthCtx = {
  token: string | null;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
};

const STORAGE_KEY = "cc_admin_token";
const AdminAuthContext = createContext<AdminAuthCtx | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));

  const login = useCallback(async (email: string, password: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as { token?: string; error?: string };
      if (!res.ok || !data.token) return { ok: false, error: data.error ?? "Login failed" };
      localStorage.setItem(STORAGE_KEY, data.token);
      setToken(data.token);
      return { ok: true };
    } catch {
      return { ok: false, error: "Network error" };
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setToken(null);
  }, []);

  return <AdminAuthContext.Provider value={{ token, login, logout }}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): AdminAuthCtx {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used inside AdminAuthProvider");
  return ctx;
}

export function useAdminFetch() {
  const { token, logout } = useAdminAuth();
  return useCallback(
    async (url: string, options?: RequestInit): Promise<Response> => {
      const res = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(options?.headers ?? {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (res.status === 401) logout();
      return res;
    },
    [token, logout]
  );
}
