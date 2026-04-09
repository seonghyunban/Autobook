import { useEffect, useRef, useState } from "react";
import { RiArrowUpSLine, RiArrowDownSLine } from "react-icons/ri";
import s from "../panels.module.css";
import { T, palette, FIELD_BASE_STYLE } from "./tokens";
import type { ReviewFieldBgPair } from "./ReviewTextField";

const DEFAULT_BG: ReviewFieldBgPair = {
  display: T.fieldBg,
  editing: T.fieldBgEditing,
};

export function DropdownSelect({
  value,
  options,
  placeholder = "Select ...",
  onChange,
  allowNew,
  style,
  bg = DEFAULT_BG,
  disabled = false,
}: {
  value: string | null;
  options: string[];
  placeholder?: string;
  /**
   * When provided, the dropdown is interactive (hover/click opens menu).
   * When omitted, the dropdown renders a static trigger (chevron stays for
   * visual consistency, but clicks/hover do nothing).
   */
  onChange?: (value: string) => void;
  allowNew?: boolean;
  style?: React.CSSProperties;
  /** Background pair. `display` is used for the trigger; `editing` for the open menu. */
  bg?: ReviewFieldBgPair;
  /** Explicitly inert (e.g. kind=relationship). Opacity 0.4, overrides interactive. */
  disabled?: boolean;
}) {
  const [hovering, setHovering] = useState(false);
  const [searching, setSearching] = useState(false);
  const [addNew, setAddNew] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const interactive = !!onChange && !disabled;
  const open = interactive && (hovering || searching);

  // Filter options by search query
  const filtered = query
    ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase()))
    : options;

  // Close search mode on outside click
  useEffect(() => {
    if (!searching) return;
    function handleClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setSearching(false);
        setHovering(false);
        setAddNew(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [searching]);

  // Focus input when entering search mode
  useEffect(() => {
    if (searching && !addNew) inputRef.current?.focus();
  }, [searching, addNew]);

  function handleSelect(val: string) {
    onChange?.(val);
    setSearching(false);
    setQuery("");
    setAddNew(false);
  }

  function handleTriggerClick() {
    if (!interactive) return;
    setSearching(true);
    setQuery("");
  }

  // ── Trigger / input dimensions ────────────────────────
  // All sub-elements share FIELD_BASE_STYLE so the dropdown lines up exactly
  // with ReviewTextField, SegmentedControl, and NumberField in any row.
  const triggerBaseStyle: React.CSSProperties = {
    ...FIELD_BASE_STYLE,
    ...bg.display,
    border: "none",
    width: "100%",
    textAlign: "left",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    overflow: "hidden",
    borderRadius: open ? "6px 6px 0 0" : 6,
    cursor: interactive ? "pointer" : "default",
  };

  const inputStyle: React.CSSProperties = {
    ...FIELD_BASE_STYLE,
    ...bg.editing,
    border: "none",
    outline: "none",
    width: "100%",
    borderRadius: "6px 6px 0 0",
  };

  const rootClass = disabled
    ? `${s.fieldHighlight} ${s.disabled}`
    : interactive
      ? s.fieldHighlight
      : s.fieldDisplay;

  // "Add new" mode: free-text input, confirm on Enter
  if (searching && addNew) {
    return (
      <div ref={rootRef} className={rootClass} style={{ position: "relative", display: "inline-block", ...style }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && query.trim()) handleSelect(query.trim()); }}
            placeholder="New category..."
            style={inputStyle}
          />
        </div>
        <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
          <label style={{ fontSize: 10, color: "rgba(37, 36, 34, 0.6)", cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}>
            <input type="checkbox" checked={addNew} onChange={() => setAddNew(false)} style={{ width: 10, height: 10 }} />
            Add new
          </label>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={rootClass}
      style={{ position: "relative", display: "inline-block", ...style }}
      onMouseEnter={() => { if (interactive) { setHovering(true); setQuery(""); } }}
      onMouseLeave={() => { if (interactive && !searching) setHovering(false); }}
    >
      {/* trigger */}
      {searching ? (
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search..."
          style={inputStyle}
        />
      ) : (
        <button
          className={s.buttonTransition}
          onClick={handleTriggerClick}
          disabled={!interactive}
          style={triggerBaseStyle}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {value ?? placeholder}
          </span>
          <span style={{ fontSize: 12, opacity: 0.5, flexShrink: 0, display: "flex", color: palette.floralWhite }}>
            {open ? <RiArrowUpSLine /> : <RiArrowDownSLine />}
          </span>
        </button>
      )}

      {/* dropdown menu — bg follows the trigger color */}
      <div
        className={s.buttonTransition}
        style={{
          position: "absolute",
          top: "100%",
          left: 0,
          right: 0,
          ...bg.editing,
          padding: 4,
          border: "none",
          borderRadius: "0 0 6px 6px",
          zIndex: 20,
          maxHeight: 180,
          overflowY: "auto",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
        }}
      >
        {filtered.map((opt) => (
          <div
            key={opt}
            className={s.buttonTransition}
            onClick={() => handleSelect(opt)}
            style={{
              padding: "2px 5px",
              fontSize: 12,
              cursor: "pointer",
              color: opt === value ? palette.charcoalBrown : palette.floralWhite,
              opacity: opt === value ? 1 : 0.7,
              background: opt === value ? palette.floralWhite : "transparent",
              borderRadius: 4,
              fontWeight: opt === value ? 600 : 400,
            }}
            onMouseEnter={(e) => {
              if (opt !== value) {
                e.currentTarget.style.background = "rgba(255, 252, 242, 0.15)";
                e.currentTarget.style.opacity = "1";
              }
            }}
            onMouseLeave={(e) => {
              if (opt !== value) {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.opacity = "0.7";
              }
            }}
          >
            {opt}
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: "5px 10px", fontSize: 11, color: palette.floralWhite, opacity: 0.5, fontStyle: "italic" }}>
            No matches
          </div>
        )}
        {allowNew && searching && (
          <div
            style={{
              padding: "5px 10px",
              borderTop: "1px solid rgba(204, 197, 185, 0.2)",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <label style={{ fontSize: 10, color: T.textMuted, cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}>
              <input type="checkbox" checked={addNew} onChange={() => { setAddNew(true); setQuery(""); }} style={{ width: 10, height: 10 }} />
              Add new
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
