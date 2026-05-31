import React, { createContext, useContext, useEffect, useState } from "react";
import { adminApi } from "./admin-api";

interface AdminSession {
  actor_email: string;
  actor_role: string;
}

interface AdminContextType {
  session: AdminSession | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AdminContext = createContext<AdminContextType | null>(null);

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.me().then(({ ok, data }) => {
      if (ok && data.actor_email) {
        setSession({ actor_email: data.actor_email, actor_role: data.actor_role });
      }
    }).finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const { ok, data } = await adminApi.login(email, password);
    if (ok && data.ok) {
      setSession({ actor_email: data.actor_email, actor_role: data.actor_role });
      return { ok: true };
    }
    if (data.error === "too_many_attempts") return { ok: false, error: "Слишком много попыток. Подождите 10 минут." };
    return { ok: false, error: "Неверный email или пароль" };
  };

  const logout = async () => {
    await adminApi.logout();
    setSession(null);
  };

  return (
    <AdminContext.Provider value={{ session, loading, login, logout }}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used inside AdminProvider");
  return ctx;
}
