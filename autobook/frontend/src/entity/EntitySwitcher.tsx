import { useCallback, useEffect, useRef, useState } from "react";
import { GoChevronDown, GoCheck } from "react-icons/go";
import { useEntity } from "./EntityProvider";
import { palette, MOTION } from "../components/panels/shared/tokens";

/**
 * Notion-style workspace selector. Shows the active entity as a compact
 * clickable row; opens a popover dropdown listing all entities with a
 * checkmark on the active one.
 *
 * When `collapsed` is true (sidebar collapsed), renders only the initial
 * avatar — no name, no chevron. The popover still opens on click.
 */
export function EntitySwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const { entities, activeEntity, setActiveEntityId, loading } = useEntity();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, close]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, close]);

  if (loading) {
    return <div style={{ height: 36 }} />;
  }

  if (!activeEntity) {
    return null;
  }

  const initial = activeEntity.name.charAt(0).toUpperCase();

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: collapsed ? "6px" : "6px 8px",
          borderRadius: 6,
          border: "none",
          background: "transparent",
          cursor: "pointer",
          width: "100%",
          justifyContent: collapsed ? "center" : "flex-start",
          transition: `background ${MOTION.fast}ms ease`,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(204, 197, 185, 0.35)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
        }}
      >
        {/* Avatar initial */}
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: 4,
            background: palette.charcoalBrown,
            color: palette.floralWhite,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {initial}
        </div>

        {!collapsed && (
          <>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: palette.carbonBlack,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1,
                textAlign: "left",
              }}
            >
              {activeEntity.name}
            </span>
            <GoChevronDown
              size={14}
              style={{
                flexShrink: 0,
                color: palette.charcoalBrown,
                opacity: 0.6,
                transform: open ? "rotate(180deg)" : "rotate(0deg)",
                transition: `transform ${MOTION.fast}ms ease`,
              }}
            />
          </>
        )}
      </button>

      {/* Popover dropdown */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            minWidth: 220,
            background: palette.floralWhite,
            border: "1px solid rgba(204, 197, 185, 0.4)",
            borderRadius: 8,
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.12), 0 1px 4px rgba(0, 0, 0, 0.08)",
            padding: "4px 0",
            zIndex: 100,
          }}
        >
          {entities.map((e) => {
            const isActive = e.id === activeEntity.id;
            const entryInitial = e.name.charAt(0).toUpperCase();
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => {
                  setActiveEntityId(e.id);
                  close();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "8px 12px",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: `background ${MOTION.fast}ms ease`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(204, 197, 185, 0.25)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                {/* Avatar */}
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 4,
                    background: isActive ? palette.charcoalBrown : "rgba(204, 197, 185, 0.5)",
                    color: isActive ? palette.floralWhite : palette.charcoalBrown,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {entryInitial}
                </div>

                {/* Name */}
                <span
                  style={{
                    flex: 1,
                    fontSize: 13,
                    fontWeight: isActive ? 600 : 400,
                    color: palette.carbonBlack,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {e.name}
                </span>

                {/* Checkmark */}
                {isActive && (
                  <GoCheck
                    size={14}
                    style={{ flexShrink: 0, color: palette.charcoalBrown }}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
