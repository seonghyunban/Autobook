import { T } from "../../shared/tokens";
import { useShowAttempted } from "../ReviewModal";

const labelStyle = { fontSize: 10, fontWeight: 600, color: T.textSecondary, textTransform: "uppercase" as const, letterSpacing: "0.05em" };

export function AttemptedCorrectedLabels() {
  const show = useShowAttempted();

  return (
    <div style={{ display: "flex", gap: 0 }}>
      {show && (
        <div style={{ flex: 1, textAlign: "center" }}>
          <span style={labelStyle}>Attempted</span>
        </div>
      )}
      {show && <div style={{ width: 80 }} />}
      <div style={{ flex: 1, textAlign: "center" }}>
        <span style={labelStyle}>Corrected</span>
      </div>
    </div>
  );
}
