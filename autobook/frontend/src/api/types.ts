export type Status = "auto_posted" | "needs_clarification" | "rejected" | "accepted";

export type TransactionInputSource = "manual_text" | "csv_upload" | "pdf_upload" | "bank_feed";

export type AuthUser = {
  id: string;
  cognito_sub: string;
  email: string;
  role: string;
  role_source: string;
  token_use: string;
};

export type AuthTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  id_token?: string | null;
  refresh_token?: string | null;
};

export type ParseAccepted = {
  parse_id: string;
  status: "accepted";
  statement_count?: number;
};

export type BatchItem = {
  child_parse_id: string;
  statement_index: number;
  input_text?: string | null;
  status: string;
  clarification_id?: string | null;
  journal_entry_id?: string | null;
  error?: string | null;
};

export type BatchSummary = {
  total_statements: number;
  completed_statements: number;
  pending_statements: number;
  auto_posted_count: number;
  needs_clarification_count: number;
  resolved_count: number;
  rejected_count: number;
  failed_count: number;
  status: string;
  items: BatchItem[];
};

export type ParseStatus = {
  parse_id: string;
  status:
    | "accepted"
    | "processing"
    | "auto_posted"
    | "needs_clarification"
    | "resolved"
    | "rejected"
    | "failed";
  stage?: string | null;
  occurred_at: string;
  updated_at: string;
  input_text?: string | null;
  explanation?: string | null;
  confidence?: {
    overall: number;
    auto_post_threshold?: number;
  } | null;
  proposed_entry?: {
    journal_entry_id?: string | null;
    lines: JournalLine[];
  } | null;
  clarification_id?: string | null;
  journal_entry_id?: string | null;
  error?: string | null;
  batch?: BatchSummary | null;
};

export type JournalLine = {
  /**
   * Stable id assigned by the LLM-interaction store on ingest. Used for
   * diff alignment between attempted and corrected traces. Optional because
   * other consumers (LedgerEntry, ParseResponse.proposed_entry) construct
   * JournalLine values from backend data that doesn't carry ids.
   */
  id?: string;
  account_code: string;
  account_name: string;
  type: "debit" | "credit";
  amount: number;
};

export type ParseResponse = {
  parse_id: string;
  status: Status;
  explanation: string;
  confidence: {
    overall: number;
    auto_post_threshold?: number;
  };
  parse_time_ms?: number;
  proposed_entry: {
    journal_entry_id?: string | null;
    lines: JournalLine[];
  };
  clarification_id?: string | null;
};

export type ParseRequest = {
  input_text: string;
  source: Extract<TransactionInputSource, "manual_text" | "bank_feed">;
  currency?: string;
  stages?: string[];
  store?: boolean;
  post_stages?: string[];
};

export type ClarificationItem = {
  clarification_id: string;
  status: "pending" | "resolved" | "rejected";
  source_text: string;
  explanation: string;
  confidence: {
    overall: number;
  };
  proposed_entry?: {
    journal_entry_id?: string | null;
    lines: JournalLine[];
  } | null;
};

export type ClarificationsResponse = {
  items: ClarificationItem[];
  count: number;
};

export type ResolveClarificationRequest = {
  action: "approve" | "edit" | "reject";
  edited_entry?: {
    journal_entry_id?: string | null;
    lines: JournalLine[];
  };
};

export type ResolveClarificationResponse = {
  clarification_id: string;
  status: "resolved" | "rejected";
  journal_entry_id?: string;
};

export type LedgerEntry = {
  journal_entry_id: string;
  date: string;
  occurred_at?: string;
  description: string;
  status: "posted";
  lines: JournalLine[];
};

export type AccountBalance = {
  account_code: string;
  account_name: string;
  balance: number;
};

export type LedgerResponse = {
  entries: LedgerEntry[];
  balances: AccountBalance[];
  summary: {
    total_debits: number;
    total_credits: number;
  };
};

export type StatementSection = {
  title: string;
  rows: Array<{
    label: string;
    amount: number;
    debit?: number;
    credit?: number;
  }>;
};

export type StatementType = "balance_sheet" | "income_statement" | "trial_balance";

export type StatementsResponse = {
  statement_type: StatementType;
  period: {
    as_of?: string;
    from?: string;
    to?: string;
  };
  sections: StatementSection[];
  totals: Record<string, number>;
};

export type RealtimeEvent = {
  type: "entry.posted" | "clarification.created" | "clarification.resolved" | "pipeline.result" | "pipeline.error" | "pipeline.stage_started" | "pipeline.stage_skipped" | "agent.stream";
  journal_entry_id?: string;
  parse_id?: string;
  input_text?: string;
  occurred_at: string;
  confidence?: { overall: number };
  explanation?: string;
  status?: string;
  proposed_entry?: { lines: JournalLine[] };
  parse_time_ms?: number;
  stage?: string;
  result?: Record<string, unknown>;
  error?: string;
  batch?: BatchSummary;
  agent?: string;
  phase?: string;
  action?: string;
  section?: string;
  tag?: string;
  text?: string;
  label?: string;
  data?: Record<string, unknown>;
};

export type RealtimeListener = (event: RealtimeEvent) => void;

export type LLMInteractionRequest = {
  parse_id: string;
  input_text: string;
};

export type LLMEntry = {
  description: string;
  lines: JournalLine[];
};

export type LLMInteractionResponse = {
  parse_id: string;
};

// ── Trace types (LLM Interaction page) ──────────────────
//
// The LLM interaction page tracks two parallel "traces" of the same
// transaction:
//
//   1. AgentAttemptedTrace — what the agent produced.
//   2. HumanCorrectedTrace — what the agent should have produced,
//      according to the user. This is what the user submits back.
//
// They share `TraceBase`. The diff between the two drives all the
// per-row "Keep / Update / Add / Disable" visuals in the review panel.
//
// List elements (graph edges, ambiguities, cases, entry lines) carry a
// stable `id` field assigned by the store on ingest, so the diff can
// align corrected items with their attempted counterparts even after
// adds, deletes, or reorders.

// ── Transaction graph ───────────────────────────────────

export type NodeRole = "reporting_entity" | "counterparty" | "indirect_party";

export type TransactionGraphNode = {
  index: number;
  name: string;
  role: NodeRole;
};

export type EdgeKind =
  | "reciprocal_exchange"
  | "chained_exchange"
  | "non_exchange"
  | "relationship";

export type TransactionGraphEdge = {
  /** Stable id assigned on ingest. Frontend-only; stripped on submit. */
  id: string;
  source: string;
  source_index: number;
  target: string;
  target_index: number;
  nature: string;
  kind: EdgeKind;
  amount: number | null;
  currency: string | null;
};

export type TransactionGraph = {
  nodes: TransactionGraphNode[];
  edges: TransactionGraphEdge[];
};

// ── Decision maker output ───────────────────────────────

export type AmbiguityCase = {
  /** Stable id assigned on ingest. Frontend-only; stripped on submit. */
  id: string;
  case: string;
  possible_entry?: Record<string, unknown>;
};

export type AmbiguityOutput = {
  /** Stable id assigned on ingest. Frontend-only; stripped on submit. */
  id: string;
  aspect: string;
  ambiguous: boolean;
  input_contextualized_conventional_default?: string | null;
  input_contextualized_ifrs_default?: string | null;
  clarification_question?: string | null;
  cases?: AmbiguityCase[];
};

export type DecisionKind = "PROCEED" | "MISSING_INFO" | "STUCK";

export type DecisionOutput = {
  decision: DecisionKind;
  rationale: string;
  ambiguities?: AmbiguityOutput[];
};

// ── Tax specialist output ───────────────────────────────

export type TaxOutput = {
  reasoning: string;
  tax_mentioned: boolean;
  classification: "taxable" | "zero_rated" | "exempt" | "out_of_scope";
  itc_eligible: boolean;
  amount_tax_inclusive: boolean;
  tax_rate: number | null;
  tax_context: string | null;
};

/**
 * The user-editable subset of TaxOutput. Drops `reasoning` because there
 * is no UI control for it — only the agent populates that field. The
 * corrected trace uses this narrower type so "everything in corrected"
 * is exactly "everything the user can edit."
 */
export type HumanEditableTax = Omit<TaxOutput, "reasoning">;

// ── Entry drafter output ────────────────────────────────

export type EntryOutput = {
  reason: string;
  currency: string;
  currency_symbol?: string;
  lines: JournalLine[];
};

// ── Per-line debit/credit relationship ────────────────

/**
 * The classification (account type, direction, taxonomy) for a single
 * journal entry line. Both the agent and the user produce these — the
 * agent via its debit/credit classifier sub-agents, the user via the
 * D/C Relationship table in the Final Entry review step.
 *
 * Stored on `TraceBase` in two separate maps (`debit_relationship` and
 * `credit_relationship`) so the structure mirrors the agent's two
 * classifier sub-agents and the visual split in the UI. A line's
 * classification lives in the bucket matching its `JournalLine.type`.
 */
export type LineDcClassification = {
  type: string | null;       // Account type: Asset, Liability, Equity, Revenue, Expense
  direction: string | null;  // Increase or Decrease
  taxonomy: string | null;   // Specific taxonomy under the type
};

/** Per-line classifications, keyed by JournalLine.id. */
export type RelationshipMap = Record<string, LineDcClassification>;

// ── Trace shapes ────────────────────────────────────────

/**
 * Fields shared between the agent's attempt and the human's corrections.
 * Only fields that have an exact 1:1 type on both sides live here.
 *
 * The fields that exist only on one side, OR have a different shape
 * (e.g. tax — agent has reasoning, user does not), are added separately
 * by AgentAttemptedTrace and HumanCorrectedTrace below.
 */
export type TraceBase = {
  transaction_text: string;
  transaction_graph: TransactionGraph | null;
  output_decision_maker: DecisionOutput | null;
  output_entry_drafter: EntryOutput | null;
  decision: DecisionKind | null;
  /**
   * Per-line classifications for debit-side journal lines, keyed by
   * JournalLine.id. The agent populates this from its debit classifier
   * sub-agent; the user populates it via the D/C Relationship table in
   * the Final Entry review step. Both sides share the same shape so
   * the diff helper can align them by id.
   */
  debit_relationship: RelationshipMap;
  /**
   * Same as `debit_relationship` but for credit-side lines. A line's
   * classification lives in exactly one of the two maps, matching the
   * line's `type` field.
   */
  credit_relationship: RelationshipMap;
};

/**
 * What the agent produced. Includes:
 *   - Full TaxOutput (with `reasoning`, which the agent generates)
 *   - RAG hits for debugging (normalizer + agent corrections)
 *
 * The two relationship maps live on TraceBase and are populated by the
 * agent's classifier sub-agents on the attempted side; the user edits
 * the corrected side via the D/C Relationship table.
 */
export type AgentAttemptedTrace = TraceBase & {
  output_tax_specialist: TaxOutput | null;
  output_debit_classifier: Record<string, unknown[]> | null;
  output_credit_classifier: Record<string, unknown[]> | null;
  rag_normalizer_hits: unknown[];
  rag_local_hits: unknown[];
  rag_pop_hits: unknown[];
};

/**
 * What the human corrected — every field corresponds to a UI control in
 * the review panel. Represents "what the agent should have produced"
 * according to the user.
 *
 * Notably narrower than AgentAttemptedTrace:
 *   - `output_tax_specialist` uses HumanEditableTax (no `reasoning`)
 *   - No `output_debit_classifier` / `output_credit_classifier`
 *   - No `rag_*_hits`
 *   - Adds per-section `notes` (user-only)
 *
 * The summary panel iterates this type's fields, so anything in
 * HumanCorrectedTrace must also be rendered in the summary.
 */
export type HumanCorrectedTrace = TraceBase & {
  output_tax_specialist: HumanEditableTax | null;
  notes: {
    transactionAnalysis: string;
    ambiguity: string;
    tax: string;
    finalEntry: string;
  };
};

/**
 * Loose shape for the SSE `pipeline.result` event payload from the
 * backend. Converted into AgentAttemptedTrace at ingest. The backend
 * still nests fields under `pipeline_state` for historical reasons.
 */
export type AgentResultWire = {
  decision?: DecisionKind;
  draft_id?: string;
  pipeline_state?: {
    transaction_text?: string;
    transaction_graph?: TransactionGraph | null;
    output_decision_maker?: DecisionOutput | null;
    output_tax_specialist?: TaxOutput | null;
    output_debit_classifier?: Record<string, unknown[]> | null;
    output_credit_classifier?: Record<string, unknown[]> | null;
    output_entry_drafter?: EntryOutput | null;
    rag_normalizer_hits?: unknown[];
    rag_local_hits?: unknown[];
    rag_pop_hits?: unknown[];
  };
};
