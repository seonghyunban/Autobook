import { createContext, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "autobook.sidebar.collapsed";

/**
 * Shared sidebar collapse state for the app shell.
 *
 * `AppShell` provides the context (via `useSidebarState`); `Sidebar` and
 * any other consumer reads it via `useSidebar()`.
 */
export type SidebarContextValue = {
  collapsed: boolean;
  toggle: () => void;
};

export const SidebarContext = createContext<SidebarContextValue | null>(null);

/**
 * Hook for reading + toggling the sidebar collapse state.
 * Throws outside of `<AppShell>` so misuse is loud.
 */
export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    throw new Error("useSidebar must be used inside <AppShell>");
  }
  return ctx;
}

/**
 * Hook used by `AppShell` to own the collapse state and persist it to
 * localStorage. Reads the initial value once on mount; writes on every
 * change. Wrapped in try/catch for Safari private mode / quota errors —
 * if storage fails the toggle still works in-memory.
 *
 * Single source of truth for persistence. No other file touches localStorage.
 */
export function useSidebarState(): SidebarContextValue {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(collapsed));
    } catch {
      // Ignore quota / private-mode errors — in-memory state still works.
    }
  }, [collapsed]);

  return {
    collapsed,
    toggle: () => setCollapsed((c) => !c),
  };
}
