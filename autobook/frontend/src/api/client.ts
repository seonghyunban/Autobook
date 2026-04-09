import { clearAuthSession, getAccessToken } from "./auth";
import { getActiveEntityId } from "./entityHeader";
import type {
  ClarificationsResponse,
  LedgerResponse,
  ParseAccepted,
  ParseStatus,
  ParseRequest,
  ResolveClarificationRequest,
  ResolveClarificationResponse,
  StatementType,
  StatementsResponse,
  TransactionInputSource,
} from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1";

function deriveUploadSource(file: File): Extract<TransactionInputSource, "csv_upload" | "pdf_upload"> {
  const fileName = file.name.toLowerCase();
  if (file.type === "text/csv" || fileName.endsWith(".csv")) {
    return "csv_upload";
  }

  if (file.type === "application/pdf" || fileName.endsWith(".pdf")) {
    return "pdf_upload";
  }

  throw new Error("Unsupported file type. Upload a CSV or text-based PDF.");
}

function buildHeaders(extraHeaders?: HeadersInit) {
  const token = getAccessToken();
  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const entityId = getActiveEntityId();
  if (entityId) {
    headers.set("X-Entity-Id", entityId);
  }
  return headers;
}

/**
 * Redirect to the login page on 401 responses from the API. Clears any
 * stale token before navigating. Called from `request()` and the file-
 * upload path so every fetch into the backend honors the redirect.
 */
function handleUnauthorized() {
  clearAuthSession();
  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    const from = window.location.pathname + window.location.search;
    window.location.assign(`/login?from=${encodeURIComponent(from)}`);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: buildHeaders(init?.headers),
    ...init,
  });

  if (response.status === 401) {
    handleUnauthorized();
    throw new Error("Unauthorized");
  }

  if (!response.ok) {
    throw new Error(await buildErrorMessage(response));
  }

  return (await response.json()) as T;
}

async function buildErrorMessage(response: Response): Promise<string> {
  const fallback = `Request failed: ${response.status}`;
  const contentType = response.headers.get("Content-Type") ?? "";

  try {
    if (contentType.includes("application/json")) {
      const payload = (await response.json()) as { detail?: string; message?: string } | null;
      const detail = payload?.detail ?? payload?.message;
      return detail ? `${fallback} - ${detail}` : fallback;
    }

    const text = (await response.text()).trim();
    return text ? `${fallback} - ${text}` : fallback;
  } catch {
    return fallback;
  }
}

export async function parseTransaction(input: ParseRequest): Promise<ParseAccepted> {
  return request<ParseAccepted>("/parse", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function uploadTransactionFile(
  file: File,
  options?: Pick<ParseRequest, "stages" | "store" | "post_stages">,
): Promise<ParseAccepted> {
  const source = deriveUploadSource(file);
  const formData = new FormData();
  formData.append("file", file);
  formData.append("source", source);
  if (options?.store !== undefined) {
    formData.append("store", String(options.store));
  }
  for (const stage of options?.stages ?? []) {
    formData.append("stages", stage);
  }
  for (const stage of options?.post_stages ?? []) {
    formData.append("post_stages", stage);
  }

  const token = getAccessToken();
  const entityId = getActiveEntityId();
  const uploadHeaders: Record<string, string> = {};
  if (token) uploadHeaders["Authorization"] = `Bearer ${token}`;
  if (entityId) uploadHeaders["X-Entity-Id"] = entityId;
  const response = await fetch(`${API_BASE_URL}/parse/upload`, {
    method: "POST",
    headers: uploadHeaders,
    body: formData,
  });

  if (response.status === 401) {
    handleUnauthorized();
    throw new Error("Unauthorized");
  }

  if (!response.ok) {
    throw new Error(await buildErrorMessage(response));
  }

  return (await response.json()) as ParseAccepted;
}

export async function getParseStatus(parseId: string): Promise<ParseStatus> {
  return request<ParseStatus>(`/parse/${parseId}`);
}

export async function getClarifications(): Promise<ClarificationsResponse> {
  return request<ClarificationsResponse>("/clarifications");
}

export async function resolveClarification(
  clarificationId: string,
  input: ResolveClarificationRequest,
): Promise<ResolveClarificationResponse> {
  return request<ResolveClarificationResponse>(`/clarifications/${clarificationId}/resolve`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getLedger(): Promise<LedgerResponse> {
  return request<LedgerResponse>("/ledger");
}

export async function getStatements(statementType?: StatementType, asOf?: string): Promise<StatementsResponse> {
  const params = new URLSearchParams();
  if (statementType) {
    params.set("statement_type", statementType);
  }
  if (asOf) {
    params.set("as_of", asOf);
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return request<StatementsResponse>(`/statements${suffix}`);
}
