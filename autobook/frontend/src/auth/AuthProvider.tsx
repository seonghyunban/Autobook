import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  beginHostedLogin,
  beginLogout,
  clearAuthSession,
  completeHostedLogin,
  fetchAuthMe,
  getAccessToken,
  getCachedUser,
  isTokenExpired,
  passwordLogin,
  refreshAuthSession,
} from "../api/auth";
import { disconnectRealtimeUpdates, ensureConnection } from "../api/realtime";
import type { AuthUser } from "../api/types";

type AuthStatus = "loading" | "authenticated" | "anonymous";

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (email?: string) => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  completeLogin: (search: string) => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Resolve auth state synchronously from localStorage.
 * Called once as the useState initializer — no useEffect, no flash.
 *
 * Returns "authenticated" if we have a non-expired token + cached user,
 * "anonymous" if no token at all, or "loading" only when a token exists
 * but is expired (needs async refresh).
 */
function resolveInitialAuth(): { status: AuthStatus; user: AuthUser | null } {
  const token = getAccessToken();
  if (!token) return { status: "anonymous", user: null };
  const cached = getCachedUser();
  if (cached && !isTokenExpired(token)) return { status: "authenticated", user: cached };
  // Token exists but expired or no cache — needs async work
  return { status: "loading", user: null };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(resolveInitialAuth);
  const [status, setStatus] = useState<AuthStatus>(initial.status);
  const [user, setUser] = useState<AuthUser | null>(initial.user);

  useEffect(() => {
    if (initial.status === "authenticated") {
      // Resolved from cache — validate silently in background
      fetchAuthMe().catch(() => {});
      return;
    }
    if (initial.status === "anonymous") return;
    // "loading" — token expired, try refresh
    void refreshExpiredToken();
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      void ensureConnection();
      return;
    }

    disconnectRealtimeUpdates();
  }, [status, user?.id]);

  async function refreshExpiredToken() {
    try {
      const me = await refreshAuthSession();
      setUser(me);
      setStatus("authenticated");
    } catch {
      clearAuthSession();
      setUser(null);
      setStatus("anonymous");
    }
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      isAuthenticated: status === "authenticated",
      login: async (email?: string) => {
        await beginHostedLogin(email);
      },
      signInWithPassword: async (email: string, password: string) => {
        // Calls the backend's /auth/password-login route which talks to
        // Cognito on our behalf. On success the JWT is persisted and the
        // returned user becomes the auth context.
        const me = await passwordLogin(email, password);
        setUser(me);
        setStatus("authenticated");
      },
      logout: async () => {
        await beginLogout();
        setUser(null);
        setStatus("anonymous");
      },
      completeLogin: async (search: string) => {
        setStatus("loading");
        const me = await completeHostedLogin(search);
        setUser(me);
        setStatus("authenticated");
      },
      refreshUser: async () => {
        setStatus("loading");
        const me = await fetchAuthMe();
        setUser(me);
        setStatus("authenticated");
      },
    }),
    [status, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
