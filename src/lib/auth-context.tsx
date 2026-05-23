import React, { createContext, useContext, useEffect, useState } from "react";
import { authApi } from "./api";

interface User {
  id: number;
  email: string;
  name: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sid = localStorage.getItem("session_id");
    if (!sid) { setLoading(false); return; }
    authApi.me()
      .then((d) => setUser(d.user))
      .catch(() => localStorage.removeItem("session_id"))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const d = await authApi.login(email, password);
    localStorage.setItem("session_id", d.session_id);
    setUser(d.user);
  };

  const register = async (email: string, password: string, name: string) => {
    const d = await authApi.register(email, password, name);
    localStorage.setItem("session_id", d.session_id);
    setUser(d.user);
  };

  const logout = async () => {
    await authApi.logout().catch(() => {});
    localStorage.removeItem("session_id");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
