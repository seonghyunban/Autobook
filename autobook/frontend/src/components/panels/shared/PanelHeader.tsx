import { T } from "./tokens";

export function PanelHeader({ title, help }: { title: React.ReactNode; help: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, overflow: "hidden", whiteSpace: "nowrap" }}>
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: T.textPrimary, flexShrink: 0 }}>
        {title}
      </h2>
      <p style={{ margin: 0, fontSize: 13, color: T.textSecondary, overflow: "hidden", textOverflow: "ellipsis" }}>{help}</p>
    </div>
  );
}
