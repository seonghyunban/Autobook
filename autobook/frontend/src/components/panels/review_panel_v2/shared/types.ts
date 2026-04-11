import type { HumanCorrectedTrace } from "../../../../api/types";

/** Per-section key for the corrected.notes slot. */
export type NotesSectionKey = keyof HumanCorrectedTrace["notes"];

/** Definition of a review section for the dynamic step list. */
export type SectionDef = {
  key: string;
  title: string;
  component: React.ComponentType;
};
