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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    void bootstrapAuth();
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      void ensureConnection();
      return;
    }

    disconnectRealtimeUpdates();
  }, [status, user?.id]);

  async function bootstrapAuth() {
    const token = getAccessToken();
    if (!token) {
      setUser(null);
      setStatus("anonymous");
      return;
    }

    // Optimistic: if token isn't expired and we have a cached user,
    // render immediately. Validate silently in the background.
    const cached = getCachedUser();
    if (cached && !isTokenExpired(token)) {
      setUser(cached);
      setStatus("authenticated");
      // Silent background refresh — update cached user, don't block UI
      fetchAuthMe().catch(() => {});
      return;
    }

    // Token expired or no cache — try refresh
    try {
      const me = await refreshAuthSession();
      setUser(me);
      setStatus("authenticated");
      return;
    } catch {
      clearAuthSession();
    }

    setUser(null);
    setStatus("anonymous");
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
