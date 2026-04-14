import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type {
  AgentAttemptedTrace,
  HumanCorrectedTrace,
  AgentResultWire,
  HumanEditableTax,
  TraceBase,
} from "../../api/types";
import type { ReasoningChunk, SectionId } from "./reasoning_panel/ReasoningPanel";
import type { ChunkManifest } from "./reasoning_panel/reconstructReasoning";
import { captureManifest } from "./reasoning_panel/reconstructReasoning";
import { patchCorrection } from "../../api/corrections";
import { EMPTY_ATTEMPTED_TRACE } from "./dummyData";

/**
 * Draft state management store.
 *
 * Two layers:
 *   - Zustand: in-memory, powers React UI via selectors
 *   - DB: persistent (synced via flushIfDirty on modal close / navigation / submit)
 *
 * Rules:
 *   - dirty flag only set by saveCorrection/setCorrected, never by loadDraft or commitResult
 *   - loadDraft always loads from DB (no caching)
 */

type ReasoningSections = Record<SectionId, ReasoningChunk[]>;

const emptyReasoning = (): ReasoningSections => ({
  normalization: [], ambiguity: [], gap: [], proceed: [], debit: [], credit: [], tax: [], entry: [],
});


// ── Store type ───────────────────────────────────────────

type DraftStore = {
  draftId: string | null;
  inputText: string;
  attempted: AgentAttemptedTrace;
  corrected: HumanCorrectedTrace;
  reasoningSections: ReasoningSections;
  chunkManifest: ChunkManifest | null;
  dirty: boolean;

  /**
   * Load a draft into the store from DB data.
   * Does NOT set dirty — this is a programmatic load.
   */
  loadDraft: (opts: {
    draftId: string;
    attempted: AgentAttemptedTrace;
    corrected: HumanCorrectedTrace;
    reasoning: ReasoningSections;
    manifest?: ChunkManifest | null;
  }) => void;

  /**
   * Commit a completed pipeline result. Captures reasoning manifest,
   * sets attempted + corrected. Does NOT set dirty.
   */
  commitResult: (wire: AgentResultWire) => void;

  /**
   * Reset store for a new submission. Clears everything.
   * Does NOT set dirty.
   */
  resetForSubmit: () => void;

  /**
   * User edit — updates corrected, sets dirty.
   */
  saveCorrection: (updater: (draft: HumanCorrectedTrace) => void) => void;

  /**
   * Update reasoning sections (called by SSE handler).
   * Does NOT set dirty.
   */
  setReasoning: (updater: (draft: ReasoningSections) => void) => void;

  /**
   * Alias for saveCorrection — used by review panel selectors.
   */
  setCorrected: (updater: (draft: HumanCorrectedTrace) => void) => void;

  /**
   * Update the input text field.
   */
  setInputText: (text: string) => void;

  /**
   * Flush dirty corrections to DB. Called on modal close, navigation,
   * beforeunload. Returns a promise for await in navigation guards.
   */
  flushIfDirty: () => Promise<void>;

  /**
   * Clear dirty flag without flushing (used after explicit submit).
   */
  clearDirty: () => void;
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
 * Idempotent: existing ids are preserved.
 */
export function assignIds(trace: TraceBase): void {
  const edges = trace.transaction_graph?.edges;
  if (edges) {
    for (const edge of edges) {
      if (!edge.id) edge.id = nextId("e");
    }
  }

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

  const lines = trace.output_entry_drafter?.lines;
  if (lines) {
    for (const line of lines) {
      if (!line.id) line.id = nextId("l");
    }
  }
}

/**
 * Copy ids from source onto target by index for diff alignment.
 */
function alignIdsFrom(source: TraceBase, target: TraceBase): void {
  const sEdges = source.transaction_graph?.edges ?? [];
  const tEdges = target.transaction_graph?.edges ?? [];
  for (let i = 0; i < Math.min(sEdges.length, tEdges.length); i++) {
    tEdges[i].id = sEdges[i].id;
  }

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

  const sLines = source.output_entry_drafter?.lines ?? [];
  const tLines = target.output_entry_drafter?.lines ?? [];
  for (let i = 0; i < Math.min(sLines.length, tLines.length); i++) {
    tLines[i].id = sLines[i].id;
  }
}

// ── Wire conversion ───────────────────────────────────────

function normalizeEntry(raw: AgentResultWire["pipeline_state"]): AgentAttemptedTrace["output_entry_drafter"] {
  const e = raw?.output_entry_drafter;
  if (!e || !Array.isArray(e.lines)) return null;
  return e;
}

export function wireToTrace(wire: AgentResultWire): AgentAttemptedTrace {
  const ps = wire.pipeline_state ?? {};
  return {
    transaction_text: ps.transaction_text ?? "",
    transaction_graph: ps.transaction_graph ?? null,
    output_decision_maker: ps.output_decision_maker ?? null,
    output_tax_specialist: ps.output_tax_specialist ?? null,
    output_debit_classifier: ps.output_debit_classifier ?? null,
    output_credit_classifier: ps.output_credit_classifier ?? null,
    output_entry_drafter: normalizeEntry(ps),
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
  return {} as Record<string, string>;
}

function toEditableTax(tax: AgentAttemptedTrace["output_tax_specialist"]): HumanEditableTax | null {
  if (!tax) return null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { reasoning: _reasoning, ...editable } = tax;
  return editable;
}

export function attemptedToCorrected(attempted: AgentAttemptedTrace): HumanCorrectedTrace {
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

// ── Build patch for DB persistence ────────────────────────

function buildPatch(c: HumanCorrectedTrace) {
  const tax = c.output_tax_specialist;
  const dm = c.output_decision_maker;
  const entry = c.output_entry_drafter;
  const graph = c.transaction_graph;

  return {
    decision_kind: c.decision,
    decision_rationale: dm?.rationale ?? null,
    tax_classification: tax?.classification ?? null,
    tax_rate: tax?.tax_rate ?? null,
    tax_context: tax?.tax_context ?? null,
    tax_itc_eligible: tax?.itc_eligible ?? null,
    tax_amount_inclusive: tax?.amount_tax_inclusive ?? null,
    tax_mentioned: tax?.tax_mentioned ?? null,
    notes: Object.keys(c.notes).length > 0 ? c.notes : null,
    entry_reason: entry?.reason ?? null,
    lines: entry?.lines?.map((l) => ({
      account_code: l.account_code || "",
      account_name: l.account_name,
      type: l.type,
      amount: l.amount,
      currency: entry.currency || "CAD",
    })) ?? null,
    graph: graph?.nodes && graph?.edges
      ? {
          nodes: graph.nodes.map((n) => ({ index: n.index, name: n.name, role: n.role })),
          edges: graph.edges.map((e) => ({
            source_index: e.source_index,
            target_index: e.target_index,
            nature: e.nature,
            kind: e.kind,
            amount: e.amount,
            currency: e.currency,
          })),
        }
      : null,
    ambiguities: dm?.ambiguities?.map((a) => ({
      aspect: a.aspect,
      ambiguous: a.ambiguous,
      conventional_default: a.input_contextualized_conventional_default ?? null,
      ifrs_default: a.input_contextualized_ifrs_default ?? null,
      clarification_question: a.clarification_question ?? null,
      cases: (a.cases ?? []).map((ca) => ({
        case_text: ca.case,
        proposed_entry_json: (ca.possible_entry as Record<string, unknown>) ?? null,
      })),
    })) ?? null,
    classifications: entry?.lines
      ? entry.lines
          .map((l) => {
            const cls = c.debit_relationship[l.id ?? ""] ?? c.credit_relationship[l.id ?? ""];
            if (!cls || !cls.type) return null;
            return {
              account_name: l.account_name,
              type: cls.type,
              direction: cls.direction ?? "",
              taxonomy: cls.taxonomy ?? "",
            };
          })
          .filter((x): x is NonNullable<typeof x> => x !== null)
      : null,
  };
}

// ── Store ─────────────────────────────────────────────────

const initialAttempted = structuredClone(EMPTY_ATTEMPTED_TRACE);
assignIds(initialAttempted);

export const useDraftStore = create<DraftStore>()(
  immer((set, get) => ({
    draftId: null,
    inputText: "",
    attempted: initialAttempted,
    corrected: attemptedToCorrected(initialAttempted),
    reasoningSections: emptyReasoning(),
    chunkManifest: null,
    dirty: false,

    loadDraft: (opts) =>
      set((state) => {
        const attempted = structuredClone(opts.attempted);
        assignIds(attempted);
        const corrected = structuredClone(opts.corrected);
        assignIds(corrected);
        alignIdsFrom(attempted, corrected);
        state.draftId = opts.draftId;
        state.attempted = attempted;
        state.corrected = corrected;
        state.reasoningSections = opts.reasoning;
        state.chunkManifest = opts.manifest ?? null;
        state.dirty = false;
      }),

    commitResult: (wire) =>
      set((state) => {
        // Capture manifest from current SSE reasoning before overwriting
        const manifest = captureManifest(state.reasoningSections);
        const reasoning = { ...state.reasoningSections };

        const attempted = structuredClone(wireToTrace(wire));
        assignIds(attempted);
        const draftId = wire.draft_id ?? null;

        state.draftId = draftId;
        state.attempted = attempted;
        state.corrected = attemptedToCorrected(attempted);
        state.reasoningSections = reasoning;
        state.chunkManifest = manifest;
        state.dirty = false;
      }),

    resetForSubmit: () =>
      set((state) => {
        state.draftId = null;
        state.attempted = structuredClone(EMPTY_ATTEMPTED_TRACE);
        state.corrected = attemptedToCorrected(state.attempted);
        state.reasoningSections = emptyReasoning();
        state.chunkManifest = null;
        state.dirty = false;
      }),

    saveCorrection: (updater) =>
      set((state) => {
        updater(state.corrected);
        state.dirty = true;
      }),

    // Alias for saveCorrection — review panel uses st.setCorrected
    setCorrected: (updater) =>
      set((state) => {
        updater(state.corrected);
        state.dirty = true;
      }),

    setReasoning: (updater) =>
      set((state) => {
        updater(state.reasoningSections);
      }),

    setInputText: (text) =>
      set((state) => {
        state.inputText = text;
      }),

    flushIfDirty: async () => {
      const { dirty, draftId, corrected } = get();
      if (!dirty || !draftId) return;
      try {
        await patchCorrection(draftId, buildPatch(corrected));
        set((state) => { state.dirty = false; });
      } catch (err) {
        console.error("Flush to DB failed:", err);
      }
    },


    clearDirty: () =>
      set((state) => {
        state.dirty = false;
      }),
  }))
);

// Backwards compatibility aliases
export const useLLMInteractionStore = useDraftStore;

// The review panel accesses st.setCorrected via selectors.
// saveCorrection IS setCorrected + dirty flag.
// This type assertion makes the store compatible with existing selectors.
export type { DraftStore as LLMInteractionStore };
