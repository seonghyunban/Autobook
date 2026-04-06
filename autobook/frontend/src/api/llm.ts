import { getAccessToken } from "./auth";
import type { LLMInteractionResponse } from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1";

export type { LLMInteractionResponse };

export async function submitLLMInteraction(parseId: string, inputText: string): Promise<LLMInteractionResponse> {
  const token = getAccessToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}/llm`, {
    method: "POST",
    headers,
    body: JSON.stringify({ parse_id: parseId, input_text: inputText }),
  });

  if (!response.ok) {
    const fallback = `Request failed: ${response.status}`;
    try {
      const payload = (await response.json()) as { detail?: string };
      throw new Error(payload?.detail ? `${fallback} - ${payload.detail}` : fallback);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Request failed:")) throw err;
      throw new Error(fallback);
    }
  }

  return (await response.json()) as LLMInteractionResponse;
}
