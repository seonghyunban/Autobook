/**
 * Review Panel v2 — dynamic section list.
 *
 * Always visible:
 *   Parties Involved → Value Flow → Ambiguity N... → Add Ambiguity → Conclusion → Summary
 *
 * Conditional (corrected decision = PROCEED):
 *   Tax → Entry → D/C Relationship
 *
 * This component only handles the section list, step navigation, and progress dots.
 * Each section is a self-contained component that reads from the Zustand store.
 */
import { useMemo } from "react";
import { useDraftStore } from "../store";
import { useShallow } from "zustand/react/shallow";
import type { SectionDef } from "./shared/types";

// Section components
import { PartiesSection } from "./parties/PartiesSection";
import { ValueFlowSection } from "./value-flow/ValueFlowSection";
import { AmbiguitySection } from "./ambiguity/AmbiguitySection";
import { AddAmbiguitySection } from "./ambiguity/AddAmbiguitySection";
import { ConclusionSection } from "./ambiguity/ConclusionSection";
import { TaxSection } from "./tax/TaxSection";
import { EntrySection } from "./entry/EntrySection";
import { RelationshipSection } from "./relationship/RelationshipSection";
import { SummarySection } from "./summary/SummarySection";

/**
 * Build the dynamic section list based on store state.
 */
export function useReviewSections(): SectionDef[] {
  const ambiguityCount = useDraftStore(
    useShallow((st) => st.corrected.output_decision_maker?.ambiguities?.length ?? 0)
  );
  const correctedDecision = useDraftStore((st) => st.corrected.decision);

  return useMemo(() => {
    const sections: SectionDef[] = [];

    // Always visible
    sections.push({ key: "parties", title: "Parties Involved", component: PartiesSection });
    sections.push({ key: "value-flow", title: "Value Flow", component: ValueFlowSection });

    // One step per ambiguity
    for (let i = 0; i < ambiguityCount; i++) {
      const idx = i;
      sections.push({
        key: `ambiguity-${i}`,
        title: `Ambiguity ${i + 1}`,
        component: () => <AmbiguitySection index={idx} />,
      });
    }

    sections.push({ key: "add-ambiguity", title: "Add Ambiguity", component: AddAmbiguitySection });
    sections.push({ key: "conclusion", title: "Ambiguity Conclusion", component: ConclusionSection });

    // Conditional on corrected decision
    if (correctedDecision === "PROCEED" || !correctedDecision) {
      sections.push({ key: "tax", title: "Tax", component: TaxSection });
      sections.push({ key: "entry", title: "Entry", component: EntrySection });
      sections.push({ key: "relationship", title: "D/C Relationship", component: RelationshipSection });
    }

    // Always visible
    sections.push({ key: "summary", title: "Summary", component: SummarySection });

    return sections;
  }, [ambiguityCount, correctedDecision]);
}

/**
 * Re-export section components for direct use if needed.
 */
export {
  PartiesSection,
  ValueFlowSection,
  AmbiguitySection,
  AddAmbiguitySection,
  ConclusionSection,
  TaxSection,
  EntrySection,
  RelationshipSection,
  SummarySection,
};
