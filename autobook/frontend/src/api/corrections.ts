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
  decision_kind?: string | null;
  decision_rationale?: string | null;
  tax_classification?: string | null;
  tax_rate?: number | null;
  tax_context?: string | null;
  tax_itc_eligible?: boolean | null;
  tax_amount_inclusive?: boolean | null;
  tax_mentioned?: boolean | null;
  note_tx_analysis?: string | null;
  note_ambiguity?: string | null;
  note_tax?: string | null;
  note_entry?: string | null;
  entry_reason?: string | null;
  lines?: { account_code: string; account_name: string; type: string; amount: number; currency?: string }[] | null;
};

export async function patchCorrection(draftId: string, patch: CorrectionPatch): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/drafts/${draftId}/correction`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(patch),
  });
  if (!response.ok) {
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
