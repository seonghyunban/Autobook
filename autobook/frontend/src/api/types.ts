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

// ── Pipeline State (from agent service) ─────────────────

export type AmbiguityOutput = {
  aspect: string;
  ambiguous: boolean;
  input_contextualized_conventional_default?: string | null;
  input_contextualized_ifrs_default?: string | null;
  clarification_question?: string | null;
  cases?: Array<{ case: string; possible_entry?: Record<string, unknown> }>;
};

export type TaxOutput = {
  reasoning: string;
  tax_mentioned: boolean;
  classification: "taxable" | "zero_rated" | "exempt" | "out_of_scope";
  itc_eligible: boolean;
  amount_tax_inclusive: boolean;
  tax_rate: number | null;
  tax_context: string | null;
};

export type DecisionOutput = {
  decision: "PROCEED" | "MISSING_INFO" | "STUCK";
  rationale: string;
  ambiguities?: AmbiguityOutput[];
};

export type ClassifierDetection = {
  category: string;
  direction: string;
  taxonomy: string;
};

export type ClassifierOutput = {
  detections: ClassifierDetection[];
};

export type EntryOutput = {
  reason: string;
  currency: string;
  currency_symbol?: string;
  lines: JournalLine[];
};

export type PipelineState = {
  transaction_text: string;
  transaction_graph?: Record<string, unknown> | null;
  output_decision_maker?: DecisionOutput | null;
  output_debit_classifier?: ClassifierOutput | null;
  output_credit_classifier?: ClassifierOutput | null;
  output_tax_specialist?: TaxOutput | null;
  output_entry_drafter?: EntryOutput | null;
};

export type AgentResult = {
  decision: "PROCEED" | "MISSING_INFO" | "STUCK";
  entry?: EntryOutput;
  proceed_reason?: string;
  resolved_ambiguities?: AmbiguityOutput[];
  questions?: string[];
  ambiguities?: AmbiguityOutput[];
  stuck_reason?: string;
  capability_gaps?: Array<{ aspect: string; gap: string }>;
  pipeline_state?: PipelineState;
};
