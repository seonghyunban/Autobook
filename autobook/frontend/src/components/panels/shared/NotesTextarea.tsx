import { palette, T } from "./tokens";
import { SectionSubheader } from "./SectionSubheader";
import s from "../panels.module.css";

/**
 * Controlled additional-notes textarea. The value lives in the
 * `corrected.notes.<sectionKey>` slice of the LLM interaction store —
 * each review section passes its own (value, onChange) pair so the
 * notes persist across step changes and modal close/reopen.
 */
export function NotesTextarea({
  placeholder,
  value,
  onChange,
}: {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: "auto" }}>
      <SectionSubheader>Additional Notes</SectionSubheader>
      <textarea
        className={s.scrollable}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          height: 120,
          boxSizing: "border-box",
          resize: "none",
          overflow: "auto",
          border: "none",
          borderRadius: T.inputRadius,
          padding: "10px 12px",
          fontSize: 12,
          color: palette.carbonBlack,
          background: "rgba(255, 252, 242, 0.5)",
          outline: "none",
          fontFamily: "inherit",
          lineHeight: 1.5,
        }}
      />
    </div>
  );
}
