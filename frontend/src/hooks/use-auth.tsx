"use client";

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ApiError, UNAUTHORIZED_EVENT } from "@/services/api-client";
import * as authService from "@/services/auth-service";
import type { User } from "@/types/api";

type AuthStatus = "loading" | "authenticated" | "anonymous";

type AuthContextValue = {
  user: User | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  const signIn = useCallback((next: User) => {
    setUser(next);
    setStatus("authenticated");
  }, []);

  const signOut = useCallback(() => {
    setUser(null);
    setStatus("anonymous");
  }, []);

  // The session lives in an httpOnly cookie, so ask the backend who we are.
  useEffect(() => {
    authService
      .getMe()
      .then(signIn)
      .catch((error: unknown) => {
        if (!(error instanceof ApiError && error.status === 401)) console.error(error);
        signOut();
      });
  }, [signIn, signOut]);

  // Any 401 (e.g. the session expired) signs the user out everywhere.
  useEffect(() => {
    window.addEventListener(UNAUTHORIZED_EVENT, signOut);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, signOut);
  }, [signOut]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      login: async (email, password) => signIn(await authService.login(email, password)),
      register: async (name, email, password) => signIn(await authService.register(name, email, password)),
      logout: async () => {
        await authService.logout().catch(() => {});
        signOut();
      },
    }),
    [user, status, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>");
  return context;
}
