import { subscribeToRealtimeUpdates as subscribeToMockRealtimeUpdates } from "../mocks/mockApi";
import { isMockApiEnabled } from "../config/env";
import { getAccessToken } from "./auth";
import type { RealtimeEvent, RealtimeListener } from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1";
const WS_URL = import.meta.env.VITE_WS_URL;

const realtimeListeners = new Set<RealtimeListener>();

let currentUserId: string | null = null;
let eventSource: EventSource | null = null;
let socket: WebSocket | null = null;
let connectionKey: string | null = null;
let connectionReady: Promise<void> | null = null;
let resolveConnectionReady: (() => void) | null = null;

function deriveEventsUrl() {
  const token = getAccessToken();
  if (!token) {
    return null;
  }
  const params = new URLSearchParams({ access_token: token });
  return `${API_BASE_URL}/events?${params.toString()}`;
}

function deriveWebSocketUrl() {
  if (!WS_URL || !currentUserId) {
    return null;
  }

  const url = new URL(WS_URL);
  url.searchParams.set("userId", currentUserId);
  return url.toString();
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
      (parsed.type === "entry.posted" ||
        parsed.type === "clarification.created" ||
        parsed.type === "clarification.resolved") &&
      typeof parsed.occurred_at === "string"
    ) {
      return parsed as RealtimeEvent;
    }
  } catch {
    return null;
  }

  return null;
}

function resetConnectionState() {
  eventSource = null;
  socket = null;
  connectionKey = null;
  connectionReady = null;
  resolveConnectionReady = null;
}

export function setRealtimeIdentity(userId: string | null) {
  if (currentUserId !== userId) {
    disconnectRealtimeUpdates();
  }
  currentUserId = userId;
}

export function disconnectRealtimeUpdates() {
  if (eventSource) {
    eventSource.close();
  }
  if (socket) {
    socket.close();
  }
  resetConnectionState();
}

function connectEventSource(url: string): Promise<void> {
  connectionReady = new Promise<void>((resolve) => {
    resolveConnectionReady = resolve;
  });

  const source = new EventSource(url);
  eventSource = source;
  connectionKey = url;

  source.onopen = () => {
    resolveConnectionReady?.();
    resolveConnectionReady = null;
  };

  source.onmessage = (event) => {
    const parsed = parseRealtimeEvent(event.data);
    if (parsed) {
      notifyListeners(parsed);
    }
  };

  source.onerror = () => {
    if (source.readyState === EventSource.CLOSED && eventSource === source) {
      resetConnectionState();
    }
  };

  return connectionReady;
}

function connectWebSocket(url: string): Promise<void> {
  connectionReady = new Promise<void>((resolve) => {
    resolveConnectionReady = resolve;
  });

  const ws = new WebSocket(url);
  socket = ws;
  connectionKey = url;

  ws.onopen = () => {
    resolveConnectionReady?.();
    resolveConnectionReady = null;
  };

  ws.onmessage = (event) => {
    const payload = typeof event.data === "string" ? event.data : "";
    const parsed = parseRealtimeEvent(payload);
    if (parsed) {
      notifyListeners(parsed);
    }
  };

  ws.onclose = () => {
    if (socket === ws) {
      resetConnectionState();
    }
  };

  ws.onerror = () => {
    if (socket === ws && ws.readyState === WebSocket.CLOSED) {
      resetConnectionState();
    }
  };

  return connectionReady;
}

export function ensureSocketConnection(): Promise<void> {
  if (isMockApiEnabled()) {
    return Promise.resolve();
  }

  const wsConnectionUrl = deriveWebSocketUrl();
  if (wsConnectionUrl) {
    if (socket && connectionKey === wsConnectionUrl && connectionReady) {
      return connectionReady;
    }

    disconnectRealtimeUpdates();
    return connectWebSocket(wsConnectionUrl);
  }

  const sseUrl = deriveEventsUrl();
  if (!sseUrl) {
    disconnectRealtimeUpdates();
    return Promise.resolve();
  }

  if (eventSource && connectionKey === sseUrl && connectionReady) {
    return connectionReady;
  }

  disconnectRealtimeUpdates();
  return connectEventSource(sseUrl);
}

export async function waitForRealtimeConnection(timeoutMs = 1500) {
  await Promise.race([
    ensureSocketConnection(),
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, timeoutMs);
    }),
  ]);
}

export function subscribeToRealtimeUpdates(listener: RealtimeListener) {
  if (isMockApiEnabled()) {
    return subscribeToMockRealtimeUpdates(listener);
  }

  realtimeListeners.add(listener);
  void ensureSocketConnection();

  return () => {
    realtimeListeners.delete(listener);
  };
}
