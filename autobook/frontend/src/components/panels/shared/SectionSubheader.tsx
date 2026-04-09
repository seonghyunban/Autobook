import { T } from "./tokens";

export function SectionSubheader({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <span style={{ fontSize: 12, fontWeight: 600, color: T.textPrimary, textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "center", ...style }}>
      {children}
    </span>
  );
}
