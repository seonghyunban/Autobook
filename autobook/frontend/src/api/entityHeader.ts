const STORAGE_KEY = "autobook.active_entity_id";

/**
 * Read the active entity ID from localStorage. Used by API call helpers
 * (client.ts, llm.ts) to attach the X-Entity-Id header without needing
 * React context access.
 *
 * The EntityProvider is the single writer of this key.
 */
export function getActiveEntityId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
