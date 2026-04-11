import { SectionSubheader } from "../../shared/SectionSubheader";
import { T } from "../../shared/tokens";
import { DashedArrow } from "../../shared/DashedArrow";
import { EmptyBox } from "../../shared/EmptyBox";
import { CorrectedActionBar } from "./CorrectedActionBar";
import { AttemptedCorrectedLabels } from "./AttemptedCorrectedLabels";
import { STATUS_VISUAL, type DiffStatus } from "./diff";

export function AmbiguitySubRow({ label, attemptedContent, correctedContent, changed, added, onReset }: {
  label: string;
  attemptedContent: React.ReactNode;
  correctedContent: React.ReactNode;
  changed: boolean;
  added?: boolean;
  onReset: () => void;
}) {
  const status: DiffStatus = added ? "added" : changed ? "updated" : "kept";
  const visual = STATUS_VISUAL[status];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <AttemptedCorrectedLabels />
      <div style={{ display: "flex", gap: 0, alignItems: "stretch" }}>
        {added ? (
          <EmptyBox style={{ flex: 1 }} />
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, padding: "8px 10px", background: "rgba(204, 197, 185, 0.2)", borderRadius: 4, minWidth: 0 }}>
            {attemptedContent}
            <div style={{ height: 18 }} />
          </div>
        )}
        <DashedArrow label={visual.arrowLabel} color={visual.arrowColor} />
        <div style={{
          flex: 1, display: "flex", flexDirection: "column", gap: 10,
          padding: "8px 10px", background: "rgba(204, 197, 185, 0.2)", borderRadius: 4, minWidth: 0,
        }}>
          {correctedContent}
          <CorrectedActionBar variant={changed ? "corrected" : "attempted"} actions={[
            { label: "Reset", onClick: onReset },
          ]} />
        </div>
      </div>
    </div>
  );
}
