import { EmptyBox } from "../../shared/EmptyBox";
import { CorrectedActionBar } from "./CorrectedActionBar";
import { AttemptedCorrectedLabels } from "./AttemptedCorrectedLabels";
import { AttemptedCorrectedRow } from "./AttemptedCorrectedRow";
import type { DiffStatus } from "./diff";

export function AmbiguitySubRow({ label, attemptedContent, correctedContent, changed, added, onReset }: {
  label: string;
  attemptedContent: React.ReactNode;
  correctedContent: React.ReactNode;
  changed: boolean;
  added?: boolean;
  onReset: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <AttemptedCorrectedLabels />
      <AttemptedCorrectedRow
        changed={changed || !!added}
        attempted={
          added ? (
            <EmptyBox style={{ height: "100%" }} />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "8px 10px", background: "rgba(204, 197, 185, 0.2)", borderRadius: 4, height: "100%" }}>
              {attemptedContent}
              <div style={{ height: 18 }} />
            </div>
          )
        }
        corrected={
          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "8px 10px", background: "rgba(204, 197, 185, 0.2)", borderRadius: 4 }}>
            {correctedContent}
            <CorrectedActionBar variant={changed ? "corrected" : "attempted"} actions={[
              { label: "Reset", onClick: onReset },
            ]} />
          </div>
        }
      />
    </div>
  );
}
