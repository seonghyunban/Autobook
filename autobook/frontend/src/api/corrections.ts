import { getAccessToken } from "./auth";
import { getActiveEntityId } from "./entityHeader";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1";

function headers(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const token = getAccessToken();
  if (token) h["Authorization"] = `Bearer ${token}`;
  const entityId = getActiveEntityId();
  if (entityId) h["X-Entity-Id"] = entityId;
  return h;
}

export type CorrectionPatch = {
  // Trace fields
  decision_kind?: string | null;
  decision_rationale?: string | null;
  tax_classification?: string | null;
  tax_rate?: number | null;
  tax_context?: string | null;
  tax_itc_eligible?: boolean | null;
  tax_amount_inclusive?: boolean | null;
  tax_mentioned?: boolean | null;
  notes?: Record<string, string> | null;
  // Entry
  entry_reason?: string | null;
  lines?: { account_code: string; account_name: string; type: string; amount: number; currency: string }[] | null;
  // Graph
  graph?: {
    nodes: { index: number; name: string; role: string }[];
    edges: { source_index: number; target_index: number; nature: string; kind: string; amount: number | null; currency: string | null }[];
  } | null;
  // Ambiguities
  ambiguities?: {
    aspect: string;
    ambiguous: boolean;
    conventional_default?: string | null;
    ifrs_default?: string | null;
    clarification_question?: string | null;
    cases: { case_text: string; proposed_entry_json?: Record<string, unknown> | null }[];
  }[] | null;
  // Classifications
  classifications?: {
    account_name: string;
    type: string;
    direction: string;
    taxonomy: string;
  }[] | null;
};

export async function patchCorrection(draftId: string, patch: CorrectionPatch): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/drafts/${draftId}/correction`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(patch),
  });
  if (!response.ok) {
    const body = await response.text();
    console.error("PATCH correction failed:", response.status, body);
    throw new Error(`Failed to save correction: ${response.status}`);
  }
}

export async function submitCorrection(draftId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/drafts/${draftId}/correction/submit`, {
    method: "POST",
    headers: headers(),
  });
  if (!response.ok) {
    throw new Error(`Failed to submit correction: ${response.status}`);
  }
}
