"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

interface User {
  id: number;
  email: string;
  name: string | null;
}

interface Firm {
  id: number;
  name: string;
  industry: string | null;
  team_size: number | null;
  current_product: string | null;
  current_price_per_seat: number | null;
  current_monthly_spend: number | null;
  ai_description: string | null;
}

interface AuthContextType {
  user: User | null;
  firm: Firm | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<string | null>;
  register: (email: string, password: string, name: string) => Promise<string | null>;
  logout: () => Promise<void>;
  saveFirm: (data: Partial<Firm> & { name: string }) => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null, firm: null, loading: true,
  login: async () => null, register: async () => null,
  logout: async () => {}, saveFirm: async () => {}, refresh: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [firm, setFirm] = useState<Firm | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      setUser(data.user || null);
      setFirm(data.firm || null);
    } catch {
      setUser(null);
      setFirm(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = async (email: string, password: string): Promise<string | null> => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) return data.error;
    setUser(data.user);
    setFirm(data.firm || null);
    return null;
  };

  const register = async (email: string, password: string, name: string): Promise<string | null> => {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    });
    const data = await res.json();
    if (!res.ok) return data.error;
    setUser(data.user);
    return null;
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setFirm(null);
  };

  const saveFirm = async (data: Partial<Firm> & { name: string }) => {
    const res = await fetch("/api/firms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (res.ok) setFirm(result.firm);
  };

  return (
    <AuthContext.Provider value={{ user, firm, loading, login, register, logout, saveFirm, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}
