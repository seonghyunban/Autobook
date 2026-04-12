import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { GoSidebarCollapse, GoSidebarExpand } from "react-icons/go";
import { RiAccountCircleLine, RiLogoutBoxRLine } from "react-icons/ri";
import { useSidebar } from "./SidebarContext";
import { NAV_ITEMS } from "./nav-config";
import { panel, palette, T } from "../panels/shared/tokens";
import { useAuth } from "../../auth/AuthProvider";

const EXPANDED_WIDTH = 240;
const COLLAPSED_WIDTH = 56;

/**
 * The visible sidebar — a floating panel that lives inside the AppSidebar
 * grid slot. Uses the shared `panel` style so it visually matches the Entry
 * and Input panels in the LLM interaction page (translucent silver bg,
 * blurred backdrop, soft shadow, rounded corners).
 *
 * Owns the collapse toggle button and the navigation list. State + persistence
 * live in `SidebarContext` (via `useSidebar`); nav items live in `nav-config.ts`.
 *
 * Adding a nav entry never touches this file.
 */
export function Sidebar() {
  const { collapsed, toggle } = useSidebar();
  const { logout, user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  return (
    <div
      style={{
        ...panel,
        width: collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH,
        height: "100%",
        transition: "width 0.2s ease",
        overflow: "hidden",
        gap: 12,
        padding: collapsed ? "16px 8px" : "16px 12px",
      }}
    >
      {/* Toggle button */}
      <div style={{ display: "flex", justifyContent: collapsed ? "center" : "flex-end" }}>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-controls="app-sidebar"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 18,
            padding: 4,
            display: "flex",
            color: T.textSecondary,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = palette.carbonBlack; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = T.textSecondary; }}
        >
          {collapsed ? <GoSidebarExpand /> : <GoSidebarCollapse />}
        </button>
      </div>

      {/* Nav items */}
      <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            title={collapsed ? label : undefined}
            style={({ isActive }) => ({
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "8px 10px",
              minHeight: 36,
              boxSizing: "border-box",
              borderRadius: 6,
              textDecoration: "none",
              color: isActive ? palette.carbonBlack : "rgba(64, 61, 57, 0.8)",
              background: isActive ? "rgba(204, 197, 185, 0.4)" : "transparent",
              fontSize: 13,
              fontWeight: isActive ? 600 : 500,
              whiteSpace: "nowrap",
              justifyContent: collapsed ? "center" : "flex-start",
              transition: "background 0.15s ease, color 0.15s ease",
            })}
          >
            <span style={{ fontSize: 16, flexShrink: 0, display: "flex" }}>
              <Icon size={16} />
            </span>
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Account button — pushed to bottom */}
      <div ref={menuRef} style={{ marginTop: "auto", position: "relative" }}>
        {menuOpen && (
          <div style={{
            position: "absolute",
            bottom: "100%",
            left: 0,
            right: collapsed ? "auto" : 0,
            marginBottom: 4,
            background: palette.floralWhite,
            border: "1px solid rgba(204, 197, 185, 0.4)",
            borderRadius: 6,
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            padding: 4,
            minWidth: collapsed ? 140 : undefined,
            zIndex: 10,
          }}>
            <button
              type="button"
              onClick={async () => { setMenuOpen(false); await logout(); }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "8px 10px",
                background: "none",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 12,
                color: T.textPrimary,
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(204, 197, 185, 0.3)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
            >
              <RiLogoutBoxRLine size={14} />
              Log out
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          title={collapsed ? (user?.username ?? user?.email ?? "Account") : undefined}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            width: "100%",
            padding: "8px 10px",
            background: menuOpen ? "rgba(204, 197, 185, 0.3)" : "none",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 13,
            color: T.textSecondary,
            justifyContent: collapsed ? "center" : "flex-start",
            transition: "background 0.15s ease, color 0.15s ease",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = palette.carbonBlack; e.currentTarget.style.background = "rgba(204, 197, 185, 0.3)"; }}
          onMouseLeave={(e) => { if (!menuOpen) { e.currentTarget.style.color = T.textSecondary; e.currentTarget.style.background = "none"; } }}
        >
          <RiAccountCircleLine size={18} style={{ flexShrink: 0 }} />
          {!collapsed && <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12 }}>{user?.username ?? user?.email ?? "Account"}</span>}
        </button>
      </div>
    </div>
  );
}
