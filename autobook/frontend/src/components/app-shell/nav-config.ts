import type { ComponentType } from "react";
import { PiTableDuotone, PiClockCounterClockwiseDuotone } from "react-icons/pi";

/**
 * One entry in the app shell sidebar's navigation.
 *
 * Adding a new page to the sidebar = add one entry here + add the matching
 * <Route> in App.tsx. Nothing else needs to change — Sidebar.tsx maps over
 * this array and React Router NavLink handles active-state highlighting.
 */
export type NavItem = {
  /** React Router target path. */
  to: string;
  /** Visible label (hidden when sidebar is collapsed). */
  label: string;
  /** Icon component (react-icons or any { size? } component). */
  icon: ComponentType<{ size?: number }>;
  /**
   * Exact-match only. Use for parent routes that have children to prevent
   * the parent link from staying active when a child route is current.
   */
  end?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { to: "/draft", label: "Entry Drafter", icon: PiTableDuotone, end: true },
  { to: "/history", label: "Draft History", icon: PiClockCounterClockwiseDuotone },
];
