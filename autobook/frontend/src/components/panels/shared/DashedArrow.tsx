export function DashedArrow({ label, color }: { label: string; color: string }) {
  return (
    <div style={{ width: 100, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }}>
      <span style={{ fontSize: 9, color, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
      <svg width="80" height="12" viewBox="0 0 80 12" style={{ display: "block" }}>
        <line x1="0" y1="6" x2="72" y2="6" stroke={color} strokeWidth="1.5" strokeDasharray="4 3">
          <animate attributeName="stroke-dashoffset" from="7" to="0" dur="0.6s" repeatCount="indefinite" />
        </line>
        <polyline points="68,2 76,6 68,10" fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
