import { getAccessToken } from "./auth";

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
  return headers;
}

export async function getTaxonomy(): Promise<TaxonomyDict> {
  const res = await fetch(`${API_BASE_URL}/taxonomy`, { headers: buildHeaders() });
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
