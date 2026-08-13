"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import { authApi, usersApi } from "@/lib/api/auth";
import { onAuthEvent } from "@/lib/api/client";
import type { SocialProviderName, User } from "@/lib/api/types";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthContextValue {
  user: User | null;
  status: AuthStatus;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<User>;
  socialLogin: (type: SocialProviderName, token: string) => Promise<User>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  /** Re-read the authoritative record - after a profile or role change. */
  reloadUser: () => Promise<User | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * The session, as resolved by middleware before this rendered.
 *
 * There is no boot sequence and no loading state: `initialUser` arrives with
 * the server render, so the first paint already knows who is signed in. That
 * is the flicker every app of this shape gets wrong, removed by not having the
 * problem.
 */
export function AuthProvider({
  initialUser,
  children,
}: {
  initialUser: User | null;
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<User | null>(initialUser);
  const [rendered, setRendered] = useState<User | null>(initialUser);
  const router = useRouter();

  // A navigation re-runs middleware, which may resolve a different user. The
  // server is authoritative, so adopt it during render rather than a frame
  // later - React's documented way to reset state from a prop.
  if (initialUser !== rendered) {
    setRendered(initialUser);
    setUser(initialUser);
  }

  /**
   * Any call that establishes or ends a session announces it through the API
   * client. `router.refresh()` then re-runs middleware and the server render,
   * so the two views of the session cannot drift.
   */
  useEffect(
    () =>
      onAuthEvent((event) => {
        setUser(event.type === "session" ? event.session.user : null);
        router.refresh();
      }),
    [router],
  );

  const login = useCallback(async (email: string, password: string) => {
    const response = await authApi.login(email, password);
    return response.data.user;
  }, []);

  const socialLogin = useCallback(
    async (type: SocialProviderName, token: string) => {
      const response = await authApi.socialLogin(type, token);
      return response.data.user;
    },
    [],
  );

  const logout = useCallback(async () => {
    await authApi.logout();
  }, []);

  const logoutAll = useCallback(async () => {
    await authApi.logoutAll();
  }, []);

  const reloadUser = useCallback(async () => {
    try {
      const response = await usersApi.me();
      setUser(response.data.user);
      return response.data.user;
    } catch {
      return null;
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status: user ? "authenticated" : "unauthenticated",
      isAuthenticated: Boolean(user),
      isLoading: false,
      login,
      socialLogin,
      logout,
      logoutAll,
      reloadUser,
    }),
    [user, login, socialLogin, logout, logoutAll, reloadUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return context;
}
