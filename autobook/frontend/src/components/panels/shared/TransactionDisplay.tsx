import { T } from "./tokens";
import { SectionSubheader } from "./SectionSubheader";

export function TransactionDisplay({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <SectionSubheader>Transaction</SectionSubheader>
      <div style={{
        background: "rgba(255, 252, 242, 0.3)",
        borderRadius: 6,
        padding: "10px 14px",
      }}>
        <span style={{ fontSize: 12, color: T.textPrimary, lineHeight: 1.5 }}>{text}</span>
      </div>
    </div>
  );
}
