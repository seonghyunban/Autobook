import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import type {
  AgentAttemptedTrace,
  HumanCorrectedTrace,
  AgentResultWire,
  HumanEditableTax,
  TraceBase,
} from "../../api/types";
import type { ReasoningChunk, SectionId } from "./reasoning_panel/ReasoningPanel";
import { SECTION_ORDER } from "./reasoning_panel/ReasoningPanel";
import type { ChunkManifest } from "./reasoning_panel/reconstructReasoning";
import { EMPTY_ATTEMPTED_TRACE } from "./dummyData";

/**
 * Single page-scoped store for the LLM Interaction page.
 *
 * Holds two parallel traces of the same transaction:
 *   - `attempted` (AgentAttemptedTrace): what the agent produced
 *   - `corrected` (HumanCorrectedTrace): what the agent should have
 *     produced, according to the user
 *
 * Both share the same `TraceBase` fields. The diff between them drives
 * every per-row "Keep / Update / Add / Disable" visual in the review
 * panel — see `review_panel/diff.ts`.
 *
 * List elements (graph edges, ambiguities, cases, entry lines) are
 * tagged with stable ids on ingest so the diff can align corrected
 * items with their attempted counterparts even after edits.
 *
 * Used by:
 *   - LLMInteractionPage (entry panel, decision overlay, submit flow)
 *   - Every leaf component in the review modal (via fine-grained selectors)
 *
 * Not used for:
 *   - Per-leaf UI flags (collapsible open/closed, hover, focus) → useState
 *   - Page-level UI flags (loading, error, modal visibility) → useState
 *   - Refs (parseIdRef, DOM refs, timer handles) → useRef
 */
type ReasoningSections = Record<SectionId, ReasoningChunk[]>;

const emptyReasoning = (): ReasoningSections => ({
  normalization: [], ambiguity: [], gap: [], proceed: [], debit: [], credit: [], tax: [], entry: [],
});

type LLMInteractionStore = {
  draftId: string | null;
  inputText: string;
  attempted: AgentAttemptedTrace;
  corrected: HumanCorrectedTrace;
  reasoningSections: ReasoningSections;
  chunkManifest: ChunkManifest | null;

  /**
   * Atomic reset: sets both `attempted` and `corrected` to deep copies
   * of `newAttempted`, assigning fresh ids to all list elements. The
   * corrected copy starts with empty notes. Reasoning is cleared.
   *
   * Called at the two reset moments:
   *   1. On submit — with EMPTY_ATTEMPTED_TRACE to wipe
   *   2. On SSE pipeline.result — with the converted wire trace
   */
  resetAll: (newAttempted: AgentAttemptedTrace, draftId?: string | null) => void;

  /**
   * Merge saved correction fields into the corrected side.
   * Called after resetAll when loading a draft that has a correction.
   */
  hydrateCorrected: (saved: Partial<HumanCorrectedTrace>) => void;

  /**
   * Mutate the corrected draft via an immer recipe.
   */
  setCorrected: (updater: (draft: HumanCorrectedTrace) => void) => void;

  /**
   * Update reasoning sections (called by SSE handler).
   */
  setReasoning: (updater: (draft: ReasoningSections) => void) => void;

  /**
   * Update the input text field.
   */
  setInputText: (text: string) => void;

  /**
   * Store the chunk manifest (captured after SSE completes).
   */
  setChunkManifest: (manifest: ChunkManifest) => void;
};

// ── Id assignment helpers ─────────────────────────────────

let _idCounter = 0;
function nextId(prefix: string): string {
  _idCounter += 1;
  return `${prefix}-${_idCounter}`;
}

/**
 * Walk the trace and assign stable ids to every list element that
 * needs one for diff alignment. Mutates the trace in place.
 *
 * Idempotent: existing ids are preserved (so calling this on an already-
 * tagged trace is a no-op for those items).
 */
export function assignIds(trace: TraceBase): void {
  // Graph edges
  const edges = trace.transaction_graph?.edges;
  if (edges) {
    for (const edge of edges) {
      if (!edge.id) edge.id = nextId("e");
    }
  }

  // Ambiguities + their cases
  const ambiguities = trace.output_decision_maker?.ambiguities;
  if (ambiguities) {
    for (const amb of ambiguities) {
      if (!amb.id) amb.id = nextId("a");
      if (amb.cases) {
        for (const c of amb.cases) {
          if (!c.id) c.id = nextId("c");
        }
      }
    }
  }

  // Entry lines
  const lines = trace.output_entry_drafter?.lines;
  if (lines) {
    for (const line of lines) {
      if (!line.id) line.id = nextId("l");
    }
  }
}

/**
 * Copy ids from `source` onto `target` by index so the diff aligns
 * corrected items with their attempted counterparts. Items beyond the
 * source length keep their own ids (user additions).
 */
function alignIdsFrom(source: TraceBase, target: TraceBase): void {
  // Edges
  const sEdges = source.transaction_graph?.edges ?? [];
  const tEdges = target.transaction_graph?.edges ?? [];
  for (let i = 0; i < Math.min(sEdges.length, tEdges.length); i++) {
    tEdges[i].id = sEdges[i].id;
  }

  // Ambiguities + cases
  const sAmbs = source.output_decision_maker?.ambiguities ?? [];
  const tAmbs = target.output_decision_maker?.ambiguities ?? [];
  for (let i = 0; i < Math.min(sAmbs.length, tAmbs.length); i++) {
    tAmbs[i].id = sAmbs[i].id;
    const sCases = sAmbs[i].cases ?? [];
    const tCases = tAmbs[i].cases ?? [];
    for (let j = 0; j < Math.min(sCases.length, tCases.length); j++) {
      tCases[j].id = sCases[j].id;
    }
  }

  // Entry lines
  const sLines = source.output_entry_drafter?.lines ?? [];
  const tLines = target.output_entry_drafter?.lines ?? [];
  for (let i = 0; i < Math.min(sLines.length, tLines.length); i++) {
    tLines[i].id = sLines[i].id;
  }
}

// ── Wire conversion ───────────────────────────────────────

/**
 * Convert the loose SSE wire shape into a flat AgentAttemptedTrace.
 * The backend still nests fields under `pipeline_state` for historical
 * reasons; this lifts them to the top level.
 *
 * Does NOT assign ids — call `assignIds` after, or pass the result
 * through `resetAll` which handles both.
 */
export function wireToTrace(wire: AgentResultWire): AgentAttemptedTrace {
  const ps = wire.pipeline_state ?? {};
  return {
    transaction_text: ps.transaction_text ?? "",
    transaction_graph: ps.transaction_graph ?? null,
    output_decision_maker: ps.output_decision_maker ?? null,
    output_tax_specialist: ps.output_tax_specialist ?? null,
    output_debit_classifier: ps.output_debit_classifier ?? null,
    output_credit_classifier: ps.output_credit_classifier ?? null,
    output_entry_drafter: ps.output_entry_drafter ?? null,
    decision: wire.decision ?? null,
    debit_relationship: {},
    credit_relationship: {},
    rag_normalizer_hits: ps.rag_normalizer_hits ?? [],
    rag_local_hits: ps.rag_local_hits ?? [],
    rag_pop_hits: ps.rag_pop_hits ?? [],
    jurisdiction: (wire as Record<string, unknown>).jurisdiction as string | null ?? null,
  };
}

// ── Notes scaffold ────────────────────────────────────────

function emptyNotes(): HumanCorrectedTrace["notes"] {
  return {
    transactionAnalysis: "",
    ambiguity: "",
    tax: "",
    finalEntry: "",
  };
}

/**
 * Build a HumanCorrectedTrace from an AgentAttemptedTrace by deep-copying
 * the shared TraceBase fields and initializing empty notes. The rag_*_hits
 * fields are intentionally dropped — they're agent-internal state.
 */
/**
 * Strip the agent-only `reasoning` field from a TaxOutput, leaving the
 * 6 fields the user can actually edit. Returns null if input is null.
 */
function toEditableTax(tax: AgentAttemptedTrace["output_tax_specialist"]): HumanEditableTax | null {
  if (!tax) return null;
  // Destructure off `reasoning` and keep the rest.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { reasoning: _reasoning, ...editable } = tax;
  return editable;
}

/**
 * Build a HumanCorrectedTrace from an AgentAttemptedTrace.
 *
 * Keeps the shared TraceBase fields (deep-cloned), narrows the tax
 * specialist output to its editable subset, drops the agent-only
 * classifier outputs, and initializes empty notes. The result contains
 * exactly the fields the user can edit in the review panel.
 */
function attemptedToCorrected(
  attempted: AgentAttemptedTrace
): HumanCorrectedTrace {
  return {
    transaction_text: attempted.transaction_text,
    transaction_graph: structuredClone(attempted.transaction_graph),
    output_decision_maker: structuredClone(attempted.output_decision_maker),
    output_tax_specialist: toEditableTax(structuredClone(attempted.output_tax_specialist)),
    output_entry_drafter: structuredClone(attempted.output_entry_drafter),
    decision: attempted.decision,
    debit_relationship: structuredClone(attempted.debit_relationship),
    credit_relationship: structuredClone(attempted.credit_relationship),
    notes: emptyNotes(),
  };
}

// ── Store ─────────────────────────────────────────────────

const initialAttempted = structuredClone(EMPTY_ATTEMPTED_TRACE);
assignIds(initialAttempted);

export const useLLMInteractionStore = create<LLMInteractionStore>()(
  persist(
    immer((set) => ({
      draftId: null,
      inputText: "",
      attempted: initialAttempted,
      corrected: attemptedToCorrected(initialAttempted),
      reasoningSections: emptyReasoning(),
      chunkManifest: null,

      resetAll: (newAttempted, draftId) =>
        set((state) => {
          const attempted = structuredClone(newAttempted);
          assignIds(attempted);
          state.draftId = draftId ?? null;
          state.attempted = attempted;
          state.corrected = attemptedToCorrected(attempted);
        }),

      hydrateCorrected: (saved) =>
        set((state) => {
          const merged = { ...state.corrected, ...saved } as HumanCorrectedTrace;
          assignIds(merged);
          alignIdsFrom(state.attempted, merged);
          state.corrected = merged;
        }),

      setCorrected: (updater) =>
        set((state) => {
          updater(state.corrected);
        }),

      setReasoning: (updater) =>
        set((state) => {
          updater(state.reasoningSections);
        }),

      setInputText: (text) =>
        set((state) => {
          state.inputText = text;
        }),

      setChunkManifest: (manifest) =>
        set((state) => {
          state.chunkManifest = manifest;
        }),
    })),
    {
      name: "autobook-drafter",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        draftId: state.draftId,
        inputText: state.inputText,
        attempted: state.attempted,
        corrected: state.corrected,
        reasoningSections: state.reasoningSections,
        chunkManifest: state.chunkManifest,
      }),
    },
  )
);
