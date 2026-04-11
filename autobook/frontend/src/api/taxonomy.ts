import { getAccessToken } from "./auth";
import { getActiveEntityId } from "./entityHeader";

export type TaxonomyDict = Record<string, string[]>;

export type TaxonomyCreateRequest = {
  name: string;
  account_type: string;
};

export type TaxonomyCreateResponse = {
  id: string;
  name: string;
  account_type: string;
  is_default: boolean;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1";

function buildHeaders() {
  const token = getAccessToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const entityId = getActiveEntityId();
  if (entityId) headers["X-Entity-Id"] = entityId;
  return headers;
}

export async function getTaxonomy(jurisdiction?: string | null): Promise<TaxonomyDict> {
  const url = jurisdiction ? `${API_BASE_URL}/taxonomy?jurisdiction=${jurisdiction}` : `${API_BASE_URL}/taxonomy`;
  const res = await fetch(url, { headers: buildHeaders() });
  if (!res.ok) throw new Error(`Failed to fetch taxonomy: ${res.status}`);
  const data = (await res.json()) as { taxonomy: TaxonomyDict };
  return data.taxonomy;
}

export async function createTaxonomyEntry(
  input: TaxonomyCreateRequest,
): Promise<TaxonomyCreateResponse> {
  const res = await fetch(`${API_BASE_URL}/taxonomy`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Failed to create taxonomy entry: ${res.status}`);
  return (await res.json()) as TaxonomyCreateResponse;
}
