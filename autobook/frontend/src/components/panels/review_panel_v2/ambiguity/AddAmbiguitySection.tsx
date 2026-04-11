/**
 * Add Additional Ambiguity step.
 * Subsection with title, explanation, and add button.
 */
import { ReviewSectionLayout } from "../shared/ReviewSectionLayout";
import { ReviewSubsection } from "../shared/ReviewSubsection";
import { palette } from "../../shared/tokens";
import { useDraftStore } from "../../store";
import s from "../../panels.module.css";

export function AddAmbiguitySection() {
  const setCorrected = useDraftStore((st) => st.setCorrected);

  const handleAdd = () => {
    setCorrected((draft) => {
      if (!draft.output_decision_maker) {
        draft.output_decision_maker = { decision: "PROCEED", rationale: "", ambiguities: [] };
      }
      if (!draft.output_decision_maker.ambiguities) {
        draft.output_decision_maker.ambiguities = [];
      }
      draft.output_decision_maker.ambiguities.push({
        id: `a-new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        aspect: "",
        ambiguous: true,
        input_contextualized_conventional_default: "",
        input_contextualized_ifrs_default: "",
        clarification_question: "",
        cases: [],
      });
    });
  };

  return (
    <ReviewSectionLayout>
      <ReviewSubsection title="Additional Ambiguity" explanation="Add an ambiguity that the agent missed or failed to detect.">
        <button
          className={s.buttonTransition}
          style={{
            width: "100%",
            background: "rgba(204, 197, 185, 0.2)",
            border: "none",
            borderRadius: 4,
            padding: "6px 10px",
            fontSize: 10,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: palette.carbonBlack,
            cursor: "pointer",
            textAlign: "center",
          }}
          onClick={handleAdd}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(204, 197, 185, 0.3)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(204, 197, 185, 0.2)"; }}
        >
          + Add ambiguity
        </button>
      </ReviewSubsection>
    </ReviewSectionLayout>
  );
}
