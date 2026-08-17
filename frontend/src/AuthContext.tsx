import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { router } from "expo-router";
import { api, getToken, setToken, clearToken, setUnauthorizedHandler, User } from "@/src/api";

type AuthState = {
  user: User | null;
  loading: boolean;
  loginEmail: (email: string, password: string) => Promise<void>;
  registerEmail: (payload: { first_name: string; last_name: string; date_of_birth: string; phone: string; email: string; password: string }) => Promise<void>;
  finishAuth: (token: string, user: User) => Promise<void>;
  applyGoogleSessionId: (sessionId: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const t = await getToken();
    if (!t) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const r = await api.me();
      setUser(r.user);
    } catch {
      await clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // When any authenticated API call gets a 401 (expired/invalid token), drop the
  // session and send the user back to the login screen instead of a dead error.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      try { router.replace("/(auth)/login"); } catch {}
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const loginEmail = async (email: string, password: string) => {
    const r = await api.login(email, password);
    await setToken(r.token);
    setUser(r.user);
  };
  const registerEmail = async (payload: { first_name: string; last_name: string; date_of_birth: string; phone: string; email: string; password: string }) => {
    // Enumeration-safe signup: no account/token is issued here. The backend stages
    // a pending registration and emails a code; the account is created and the user
    // is logged in only after the code is verified (see finishAuth).
    await api.register(payload);
  };
  const finishAuth = async (token: string, user: User) => {
    await setToken(token);
    setUser(user);
  };
  const applyGoogleSessionId = async (sessionId: string) => {
    const r = await api.googleSession(sessionId);
    await setToken(r.session_token);
    setUser(r.user);
  };
  const logout = async () => {
    try {
      await api.logout();
    } catch {}
    await clearToken();
    setUser(null);
  };

  return (
    <AuthCtx.Provider
      value={{ user, loading, loginEmail, registerEmail, finishAuth, applyGoogleSessionId, logout, refresh }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
