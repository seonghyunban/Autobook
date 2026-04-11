import { useLLMInteractionStore } from "../../../../store";
import { useShallow } from "zustand/react/shallow";
import type { AmbiguityOutput } from "../../../../../../api/types";
import { SummarySection } from "../primitives/SummarySection";
import { SummarySubsection } from "../primitives/SummarySubsection";
import { SummaryField } from "../primitives/SummaryField";
import { SummaryFieldList } from "../primitives/SummaryFieldList";

/**
 * Section 2 — Ambiguity.
 *
 * Renders one subsection per ambiguity in the corrected list (so user-disabled
 * ambiguities — which are removed from corrected — never appear here), plus a
 * Conclusion subsection with the user's decision and rationale, and an
 * optional Notes subsection.
 */
export function AmbiguitySummary() {
  const ambiguities = useLLMInteractionStore(
    useShallow((st) => (st.corrected.output_decision_maker?.ambiguities ?? []) as AmbiguityOutput[])
  );
  const decision = useLLMInteractionStore((st) => st.corrected.decision);
  const rationale = useLLMInteractionStore(
    (st) => st.corrected.output_decision_maker?.rationale ?? ""
  );
  const notes = useLLMInteractionStore((st) => st.corrected.notes.ambiguity);

  const decisionLabel = decision === "PROCEED" ? "Complete" : "Incomplete";

  return (
    <SummarySection title="Ambiguity">
      {ambiguities.map((amb) => (
        <AmbiguityBlock key={amb.id} ambiguity={amb} />
      ))}
      <SummarySubsection title="Conclusion">
        <SummaryField label="Decision" value={decisionLabel} />
        <SummaryField label="Rationale" value={rationale} />
      </SummarySubsection>
      <SummarySubsection title="Notes">
        <SummaryField label="Additional notes" value={notes} />
      </SummarySubsection>
    </SummarySection>
  );
}

function AmbiguityBlock({ ambiguity }: { ambiguity: AmbiguityOutput }) {
  const caseStrings = (ambiguity.cases ?? []).map((c) => c.case ?? "");
  return (
    <SummarySubsection title={`Ambiguity${ambiguity.aspect ? ` — ${ambiguity.aspect}` : ""}`}>
      <SummaryField label="Aspect" value={ambiguity.aspect ?? ""} />
      <SummaryField
        label="Conventional default"
        value={ambiguity.input_contextualized_conventional_default ?? ""}
      />
      <SummaryField
        label="IFRS default"
        value={ambiguity.input_contextualized_ifrs_default ?? ""}
      />
      <SummaryField
        label="Clarification question"
        value={ambiguity.clarification_question ?? ""}
      />
      {caseStrings.length > 0 && (
        <SummaryFieldList label="Cases" items={caseStrings} ordered />
      )}
    </SummarySubsection>
  );
}
