import { T } from "../../shared/tokens";

export function AttemptedCorrectedLabels() {
  return (
    <div style={{ display: "flex", gap: 0 }}>
      <div style={{ flex: 1, textAlign: "center" }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: T.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>Attempted</span>
      </div>
      <div style={{ width: 80 }} />
      <div style={{ flex: 1, textAlign: "center" }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: T.textSecondary, textTransform: "uppercase", letterSpacing: "0.05em" }}>Corrected</span>
      </div>
    </div>
  );
}
