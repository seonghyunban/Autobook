import { useDraftStore } from "../../store";
import { NotesTextarea } from "../../shared/NotesTextarea";
import type { NotesSectionKey } from "./types";

/**
 * Standard layout for a review step:
 *   - header (optional, e.g. graph visualization)
 *   - body (subsections — the main content)
 *   - footer (notes textarea, auto-bound to corrected.notes[sectionKey])
 *
 * If no notesKey is provided, the footer is omitted.
 */
export function ReviewSectionLayout({ header, children, notesKey, notesPlaceholder }: {
  header?: React.ReactNode;
  children: React.ReactNode;
  notesKey?: NotesSectionKey;
  notesPlaceholder?: string;
}) {
  const notes = useDraftStore((st) => notesKey ? (st.corrected.notes[notesKey] ?? "") : "");
  const setCorrected = useDraftStore((st) => st.setCorrected);

  const handleNotesChange = (v: string) => {
    if (!notesKey) return;
    setCorrected((draft) => {
      draft.notes[notesKey] = v;
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 40, flex: 1 }}>
      {header}
      {children}
      {notesKey && (
        <NotesTextarea
          placeholder={notesPlaceholder ?? "Any additional notes for this section."}
          value={notes}
          onChange={handleNotesChange}
        />
      )}
    </div>
  );
}
