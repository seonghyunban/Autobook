import { type ReactNode } from "react";
import { SidebarContext, useSidebarState } from "./SidebarContext";

/**
 * Top-level app shell. Pure CSS-grid layout container that arranges its
 * children into four named regions: header / sidebar / body / footer.
 *
 * Each child component (`AppHeader`, `AppSidebar`, `AppBody`, `AppFooter`)
 * self-places via its own `gridArea`, so AppShell doesn't need to know
 * anything about what's inside.
 *
 * Owns the sidebar collapse state via `useSidebarState()` (which persists
 * to localStorage) and exposes it through `SidebarContext` so the inner
 * `Sidebar` panel — or any other consumer — can read/toggle it without
 * prop-drilling.
 *
 * Usage:
 *   <AppShell>
 *     <AppHeader />
 *     <AppSidebar />
 *     <AppBody><YourPage /></AppBody>
 *     <AppFooter />
 *   </AppShell>
 */
export function AppShell({ children }: { children: ReactNode }) {
  const sidebar = useSidebarState();

  return (
    <SidebarContext.Provider value={sidebar}>
      <div
        data-sidebar={sidebar.collapsed ? "collapsed" : "expanded"}
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gridTemplateRows: "auto 1fr auto",
          gridTemplateAreas: `
            "header  header"
            "sidebar body"
            "footer  footer"
          `,
          height: "100dvh",
        }}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}
