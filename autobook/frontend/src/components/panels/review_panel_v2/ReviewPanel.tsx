/**
 * Review Panel v2 — dynamic section list.
 *
 * Always visible:
 *   Parties Involved → Value Flow → Ambiguity N... → Add Ambiguity → Conclusion → Summary
 *
 * Conditional (corrected decision = PROCEED):
 *   Tax → Entry → D/C Relationship
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
 *
 * Ambiguity sections are keyed by ID — one per attempted ambiguity
 * (always visible, disabled if user flagged as unambiguous) plus
 * any user-added ambiguities (removable).
 */
export function useReviewSections(): SectionDef[] {
  // Read attempted ambiguity IDs (stable — never change after pipeline.result)
  const attemptedAmbiguityIds = useDraftStore(
    useShallow((st) =>
      (st.attempted.output_decision_maker?.ambiguities ?? []).map((a) => a.id)
    )
  );

  // Read corrected ambiguity IDs (changes on add/remove)
  const correctedAmbiguityIds = useDraftStore(
    useShallow((st) =>
      (st.corrected.output_decision_maker?.ambiguities ?? []).map((a) => a.id)
    )
  );

  // Read corrected ambiguity aspects for titles (changes on edit, but won't remount)
  const correctedAspects = useDraftStore(
    useShallow((st) =>
      (st.corrected.output_decision_maker?.ambiguities ?? []).map((a) => a.aspect)
    )
  );

  // Read attempted aspects for disabled ambiguity titles
  const attemptedAspects = useDraftStore(
    useShallow((st) =>
      (st.attempted.output_decision_maker?.ambiguities ?? []).map((a) => a.aspect)
    )
  );

  const correctedDecision = useDraftStore((st) => st.corrected.decision);

  return useMemo(() => {
    const sections: SectionDef[] = [];

    // Always visible
    sections.push({ key: "parties", title: "Parties Involved", component: PartiesSection });
    sections.push({ key: "value-flow", title: "Value Flow", component: ValueFlowSection });

    // Attempted ambiguities first (always visible — disabled if not in corrected)
    const correctedIdSet = new Set(correctedAmbiguityIds);
    for (let i = 0; i < attemptedAmbiguityIds.length; i++) {
      const id = attemptedAmbiguityIds[i];
      const isInCorrected = correctedIdSet.has(id);
      const aspect = isInCorrected
        ? (correctedAspects[correctedAmbiguityIds.indexOf(id)] || `Ambiguity ${i + 1}`)
        : (attemptedAspects[i] || `Ambiguity ${i + 1}`);
      sections.push({
        key: `ambiguity-${id}`,
        title: `Ambiguity: ${aspect}`,
        component: AmbiguitySection,
        props: { ambiguityId: id },
      });
    }

    // User-added ambiguities (not in attempted)
    const attemptedIdSet = new Set(attemptedAmbiguityIds);
    for (let i = 0; i < correctedAmbiguityIds.length; i++) {
      const id = correctedAmbiguityIds[i];
      if (attemptedIdSet.has(id)) continue; // already added above
      const aspect = correctedAspects[i] || `New Ambiguity`;
      sections.push({
        key: `ambiguity-${id}`,
        title: `Ambiguity: ${aspect}`,
        component: AmbiguitySection,
        props: { ambiguityId: id },
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
  }, [attemptedAmbiguityIds, correctedAmbiguityIds, correctedAspects, attemptedAspects, correctedDecision]);
}

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
