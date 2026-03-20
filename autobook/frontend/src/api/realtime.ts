import { subscribeToRealtimeUpdates as subscribeToMockRealtimeUpdates } from "../mocks/mockApi";
import type { RealtimeEvent, RealtimeListener } from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1";
const USE_MOCK_API = import.meta.env.VITE_USE_MOCK_API !== "false";

const realtimeListeners = new Set<RealtimeListener>();

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function deriveWebSocketUrl() {
  const configuredUrl = import.meta.env.VITE_WS_URL;
  if (configuredUrl) {
    return configuredUrl;
  }

  try {
    const apiUrl = new URL(API_BASE_URL);
    const protocol = apiUrl.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${apiUrl.host}/ws`;
  } catch {
    return "ws://localhost:8000/ws";
  }
}

function notifyListeners(event: RealtimeEvent) {
  for (const listener of realtimeListeners) {
    listener(event);
  }
}

function parseRealtimeEvent(payload: string) {
  try {
    const parsed = JSON.parse(payload) as Partial<RealtimeEvent>;
    if (
      parsed.type === "accounting.snapshot.updated" &&
      typeof parsed.reason === "string" &&
      typeof parsed.occurred_at === "string"
    ) {
      return {
        type: parsed.type,
        reason: parsed.reason,
        journal_entry_id:
          typeof parsed.journal_entry_id === "string" ? parsed.journal_entry_id : undefined,
        occurred_at: parsed.occurred_at,
      } as RealtimeEvent;
    }
  } catch {
    return null;
  }

  return null;
}

function scheduleReconnect() {
  if (reconnectTimer || realtimeListeners.size === 0 || typeof WebSocket === "undefined") {
    return;
  }

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    ensureSocketConnection();
  }, 1000);
}

function ensureSocketConnection() {
  if (USE_MOCK_API || socket || realtimeListeners.size === 0 || typeof WebSocket === "undefined") {
    return;
  }

  const nextSocket = new WebSocket(deriveWebSocketUrl());
  socket = nextSocket;

  nextSocket.addEventListener("message", (event) => {
    if (typeof event.data !== "string") {
      return;
    }

    const parsed = parseRealtimeEvent(event.data);
    if (parsed) {
      notifyListeners(parsed);
    }
  });

  nextSocket.addEventListener("close", () => {
    if (socket === nextSocket) {
      socket = null;
    }

    scheduleReconnect();
  });

  nextSocket.addEventListener("error", () => {
    nextSocket.close();
  });
}

export function subscribeToRealtimeUpdates(listener: RealtimeListener) {
  if (USE_MOCK_API) {
    return subscribeToMockRealtimeUpdates(listener);
  }

  realtimeListeners.add(listener);
  ensureSocketConnection();

  return () => {
    realtimeListeners.delete(listener);

    if (realtimeListeners.size > 0) {
      return;
    }

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    if (socket) {
      const activeSocket = socket;
      socket = null;
      activeSocket.close();
    }
  };
}
