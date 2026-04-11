/**
 * Add Additional Ambiguity step.
 * Header: —
 * Body: Add ambiguity button
 * Footer: —
 */
import { ReviewSectionLayout } from "../shared/ReviewSectionLayout";
import { AddButton } from "../../shared/AddButton";
import { useDraftStore } from "../../store";

export function AddAmbiguitySection() {
  const setCorrected = useDraftStore((st) => st.setCorrected);

  const handleAdd = () => {
    setCorrected((draft) => {
      const ambs = draft.output_decision_maker?.ambiguities;
      if (ambs) {
        ambs.push({
          id: "",
          aspect: "",
          ambiguous: true,
          input_contextualized_conventional_default: "",
          input_contextualized_ifrs_default: "",
          clarification_question: "",
          cases: [],
        });
      }
    });
  };

  return (
    <ReviewSectionLayout>
      <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
        <AddButton onClick={handleAdd} title="Add ambiguity" />
      </div>
    </ReviewSectionLayout>
  );
}
