import { Outlet } from "react-router-dom";
import { AppShell } from "./AppShell";
import { AppHeader } from "./AppHeader";
import { AppSidebar } from "./AppSidebar";
import { AppBody } from "./AppBody";
import { AppFooter } from "./AppFooter";

/**
 * Layout route wrapper for React Router. Use as the `element` of a
 * parent route so the shell (header / sidebar / footer) stays mounted
 * across navigations — only the body swaps via <Outlet />.
 *
 * Usage:
 *   <Route element={<AppShellLayout />}>
 *     <Route path="/llm" element={<LLMInteractionPage />} />
 *     <Route path="/llm/history" element={<LLMHistoryPage />} />
 *   </Route>
 */
export function AppShellLayout() {
  return (
    <AppShell>
      <AppHeader />
      <AppSidebar />
      <AppBody><Outlet /></AppBody>
      <AppFooter />
    </AppShell>
  );
}
