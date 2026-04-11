import { useDraftStore } from "../../store";
import { palette, T } from "../../shared/tokens";
import { ReviewTextField } from "../../shared/ReviewTextField";
import { DropdownSelect } from "../../shared/DropdownSelect";
import { ReviewSectionLayout } from "../shared/ReviewSectionLayout";
import { ReviewSubsection } from "../shared/ReviewSubsection";
import { AttemptedCorrectedLabels } from "../shared/AttemptedCorrectedLabels";
import { CorrectedActionBar } from "../shared/CorrectedActionBar";
import { AttemptedCorrectedRow } from "../shared/AttemptedCorrectedRow";

const SILVER_BG = "rgba(204, 197, 185, 0.2)";

export function ConclusionSection() {
  const attemptedDecision = useDraftStore((st) => st.attempted.decision);
  const attemptedRationale = useDraftStore((st) => st.attempted.output_decision_maker?.rationale ?? "");
  const correctedDecision = useDraftStore((st) => st.corrected.decision);
  const correctedRationale = useDraftStore((st) => st.corrected.output_decision_maker?.rationale ?? "");
  const setCorrected = useDraftStore((st) => st.setCorrected);

  const isComplete = attemptedDecision === "PROCEED";
  const correctedComplete = correctedDecision === "PROCEED";

  const handleSetComplete = (complete: boolean) => {
    setCorrected((draft) => { draft.decision = complete ? "PROCEED" : "MISSING_INFO"; });
  };
  const handleSetRationale = (v: string) => {
    setCorrected((draft) => { if (draft.output_decision_maker) draft.output_decision_maker.rationale = v; });
  };
  function handleReset() {
    setCorrected((draft) => {
      const attempted = useDraftStore.getState().attempted;
      draft.decision = attempted.decision;
      if (draft.output_decision_maker) {
        draft.output_decision_maker.rationale = attempted.output_decision_maker?.rationale ?? "";
      }
    });
  }

  const changed = correctedComplete !== isComplete || correctedRationale !== attemptedRationale;

  return (
    <ReviewSectionLayout notesKey="ambiguity" notesPlaceholder="Any additional notes about ambiguities or the decision.">
      <ReviewSubsection title="Ambiguity Conclusion" explanation="Whether the transaction has sufficient information to draft a journal entry.">
        <AttemptedCorrectedLabels />
        <AttemptedCorrectedRow
          changed={changed}
          attempted={
            <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "8px 10px", background: SILVER_BG, borderRadius: 4, height: "100%" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={T.fieldLabel}>Ambiguity Conclusion</span>
                <div style={{ fontSize: 12, color: T.textPrimary, lineHeight: 2.2 }}>
                  This transaction has{" "}
                  <DropdownSelect value={isComplete ? "Complete" : "Incomplete"} options={["Complete", "Incomplete"]} />
                  {" "}information to draft a journal entry.
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={T.fieldLabel}>Rationale</span>
                <ReviewTextField value={attemptedRationale} />
              </div>
              <div style={{ height: 18 }} />
            </div>
          }
          corrected={
            <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "8px 10px", background: SILVER_BG, borderRadius: 4 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={T.fieldLabel}>Ambiguity Conclusion</span>
                <div style={{ fontSize: 12, color: T.textPrimary, lineHeight: 2.2 }}>
                  This transaction has{" "}
                  <DropdownSelect value={correctedComplete ? "Complete" : "Incomplete"} options={["Complete", "Incomplete"]}
                    onChange={(v) => handleSetComplete(v === "Complete")} />
                  {" "}information to draft a journal entry.
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={T.fieldLabel}>Rationale</span>
                <ReviewTextField value={correctedRationale} onChange={handleSetRationale} />
              </div>
              <CorrectedActionBar variant={changed ? "corrected" : "attempted"} actions={[
                { label: "Reset", onClick: handleReset },
              ]} />
            </div>
          }
        />
      </ReviewSubsection>
    </ReviewSectionLayout>
  );
}
