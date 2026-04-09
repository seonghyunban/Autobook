import { getAccessToken } from "./auth";
import { getActiveEntityId } from "./entityHeader";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1";

export type DraftListItem = {
  id: string;
  transaction_id: string;
  raw_text: string;
  decision: string | null;
  review_status: "pending" | "in_review" | "reviewed";
  created_at: string;
};

export type DraftDetail = {
  id: string;
  transaction_id: string;
  raw_text: string;
  created_at: string;
  graph: {
    nodes: { index: number; name: string; role: string }[];
    edges: {
      source_index: number;
      target_index: number;
      source: string;
      target: string;
      nature: string;
      kind: string;
      amount: number | null;
      currency: string | null;
    }[];
  } | null;
  correction_entry: {
    id: string;
    entry_reason: string | null;
    lines: {
      id: string;
      line_order: number;
      account_code: string;
      account_name: string;
      type: string;
      amount: number;
      currency: string;
      classification: { type: string; direction: string; taxonomy: string } | null;
    }[];
  } | null;
  entry: {
    id: string;
    entry_reason: string | null;
    lines: {
      id: string;
      line_order: number;
      account_code: string;
      account_name: string;
      type: string;
      amount: number;
      currency: string;
      classification: { type: string; direction: string; taxonomy: string } | null;
    }[];
  } | null;
  traces: {
    id: string;
    kind: string;
    origin_tier: number | null;
    decision_kind: string | null;
    decision_rationale: string | null;
    tax_reasoning: string | null;
    tax_classification: string | null;
    tax_rate: number | null;
    tax_context: string | null;
    tax_itc_eligible: boolean | null;
    tax_amount_inclusive: boolean | null;
    tax_mentioned: boolean | null;
    note_tx_analysis: string | null;
    note_ambiguity: string | null;
    note_tax: string | null;
    note_entry: string | null;
    ambiguities: {
      id: string;
      aspect: string;
      ambiguous: boolean;
      conventional_default: string | null;
      ifrs_default: string | null;
      clarification_question: string | null;
      cases: { id: string; case_text: string; proposed_entry_json: Record<string, unknown> | null }[];
    }[];
  }[];
};

function headers(): Record<string, string> {
  const h: Record<string, string> = {};
  const token = getAccessToken();
  if (token) h["Authorization"] = `Bearer ${token}`;
  const entityId = getActiveEntityId();
  if (entityId) h["X-Entity-Id"] = entityId;
  return h;
}

export async function fetchDrafts(): Promise<DraftListItem[]> {
  const response = await fetch(`${API_BASE_URL}/drafts`, { headers: headers() });
  if (!response.ok) throw new Error(`Failed to fetch drafts: ${response.status}`);
  const data = (await response.json()) as { drafts: DraftListItem[] };
  return data.drafts;
}

export async function fetchDraftDetail(draftId: string): Promise<DraftDetail> {
  const response = await fetch(`${API_BASE_URL}/drafts/${draftId}`, { headers: headers() });
  if (!response.ok) throw new Error(`Failed to fetch draft: ${response.status}`);
  return (await response.json()) as DraftDetail;
}
