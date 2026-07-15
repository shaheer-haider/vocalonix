import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { api, type AuthSession } from "../api";

type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "error";

interface AuthContextValue {
  error: string | null;
  session: AuthSession | null;
  status: AuthStatus;
  login(input: {
    email: string;
    password: string;
    rememberMe?: boolean;
  }): Promise<void>;
  logout(): Promise<void>;
  logoutAll(): Promise<void>;
  refresh(): Promise<AuthSession | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  const restore = useCallback(async () => {
    const restored = await api.auth.session();
    setSession(restored);
    setStatus(restored ? "authenticated" : "unauthenticated");
    setError(null);
    return restored;
  }, []);

  useEffect(() => {
    let cancelled = false;

    void api.auth
      .session()
      .then((restored) => {
        if (cancelled) return;
        setSession(restored);
        setStatus(restored ? "authenticated" : "unauthenticated");
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setStatus("error");
        setError(caught instanceof Error ? caught.message : "Session unavailable.");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      error,
      session,
      status,
      login: async (input) => {
        await api.auth.login(input);
        await restore();
      },
      logout: async () => {
        await api.auth.logout();
        setSession(null);
        setStatus("unauthenticated");
      },
      logoutAll: async () => {
        await api.auth.logoutAll();
        setSession(null);
        setStatus("unauthenticated");
      },
      refresh: restore,
    }),
    [error, restore, session, status],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }
  return context;
}
