/**
 * Shared layout for attempted ↔ corrected side-by-side rows.
 *
 * When showAttempted is true:  [attempted] → [arrow] → [corrected]
 * When showAttempted is false: [corrected] (full width)
 *
 * Uses CSS grid column transition. On hide, overflow + nowrap are
 * applied immediately so content clips without reflowing. On show,
 * overflow is released after the transition completes.
 */
import { useEffect, useState } from "react";
import { useShowAttempted } from "../ReviewModal";
import { DashedArrow } from "../../shared/DashedArrow";
import { palette } from "../../shared/tokens";

const DUR = 300; // ms — match grid transition duration

export function AttemptedCorrectedRow({ attempted, corrected, changed }: {
  attempted: React.ReactNode;
  corrected: React.ReactNode;
  changed?: boolean;
}) {
  const show = useShowAttempted();
  const arrowLabel = changed ? "Update" : "Keep";
  const arrowColor = changed ? palette.fern : palette.charcoalBrown;

  // On hide → false immediately (clip content); on show → true after transition
  const [expanded, setExpanded] = useState(show);
  useEffect(() => {
    if (!show) {
      setExpanded(false);
    } else {
      const timer = setTimeout(() => setExpanded(true), DUR);
      return () => clearTimeout(timer);
    }
  }, [show]);

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: show ? "1fr 80px 1fr" : "0fr 0px 1fr",
      transition: `grid-template-columns 0.3s ease-out`,
    }}>
      <div style={{ overflow: expanded ? "visible" : "hidden", minWidth: 0, whiteSpace: expanded ? "normal" : "nowrap" }}>
        {attempted}
      </div>
      <div style={{ overflow: expanded ? "visible" : "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <DashedArrow label={arrowLabel} color={arrowColor} />
      </div>
      <div style={{ minWidth: 0 }}>
        {corrected}
      </div>
    </div>
  );
}
