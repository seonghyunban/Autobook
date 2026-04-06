import { palette, T } from "./tokens";
import { SectionSubheader } from "./SectionSubheader";
import s from "../../LLMInteractionPage.module.css";

export function NotesTextarea({ placeholder }: { placeholder: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: "auto" }}>
      <SectionSubheader>Additional Notes</SectionSubheader>
      <textarea
        className={s.scrollable}
        placeholder={placeholder}
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
