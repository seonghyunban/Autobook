# Frontend Real-Time Updates

Last updated: 2026-03-19

## Purpose

This document explains the current real-time update support in the frontend, how it is implemented today, and what is still needed from the backend team to make real WebSocket-driven updates work outside mock mode.

## Current Status

The frontend now supports real-time refresh behavior for:

- dashboard metrics and recent activity
- ledger entries and account balances
- statements derived from the ledger
- clarification queue changes

This works today in local development through a mocked event stream.

The frontend is also prepared for a real backend WebSocket connection, but the backend push endpoint and event contract still need to exist.

## How It Is Implemented

### 1. Shared Real-Time Event Contract

The frontend uses a small notification event rather than streaming full ledger payloads.

Current event shape:

```json
{
  "type": "accounting.snapshot.updated",
  "reason": "journal_entry.posted",
  "journal_entry_id": "je_123",
  "occurred_at": "2026-03-19T20:15:00Z"
}
```

Supported `reason` values:

- `journal_entry.posted`
- `clarification.queued`
- `clarification.resolved`
- `clarification.rejected`

This contract is defined in:

- `autobook/frontend/src/api/types.ts`

### 2. Shared Subscription Layer

The frontend listens for updates through one API-layer subscription entry point:

- `autobook/frontend/src/api/realtime.ts`

Behavior:

- if `VITE_USE_MOCK_API` is not `"false"`, the frontend subscribes to the mock event bus
- otherwise, the frontend opens a real browser `WebSocket`

WebSocket URL resolution:

1. use `VITE_WS_URL` if provided
2. otherwise derive `/ws` from `VITE_API_BASE_URL`
3. fallback to `ws://localhost:8000/ws`

The client also reconnects automatically after disconnects.

### 3. Mock Event Source

The mock API now does two things:

- mutates the in-memory stores for ledger, clarifications, and statements-related state
- emits a real-time notification after important changes

This lives in:

- `autobook/frontend/src/mocks/mockApi.ts`

Mock events are emitted when:

- a clear transaction is auto-posted
- an ambiguous transaction is added to the clarification queue
- a clarification is approved and posted
- a clarification is rejected
- a file upload causes one of the above outcomes

### 4. Page Refresh Strategy

The frontend does not depend on full data being sent over WebSocket.

Instead:

1. a push event arrives
2. the page receives the event through `subscribeToRealtimeUpdates(...)`
3. the page refetches its normal REST data

This keeps the real-time logic small and avoids duplicating ledger or statement business logic in the browser.

Current subscribed pages:

- `autobook/frontend/src/pages/DashboardPage.tsx`
- `autobook/frontend/src/pages/LedgerPage.tsx`
- `autobook/frontend/src/pages/StatementsPage.tsx`
- `autobook/frontend/src/pages/ClarificationPage.tsx`

## What You Should See Locally

When running the frontend in mock mode:

- creating a clear transaction should update dashboard and ledger views without a page refresh
- creating an ambiguous transaction should increase clarification counts without a page refresh
- approving a clarification should update ledger, statements, and dashboard without a page refresh

This is a real front-end subscription flow, even though the event source is currently mocked.

## What Is Still Needed To Make It Really Work

The backend team needs to provide the following.

### 1. A Real WebSocket Endpoint

Expected shape:

- local example: `ws://localhost:8000/ws`
- deployed example: `wss://<backend-host>/ws`

If they use a different path, the frontend can point to it through:

- `VITE_WS_URL`

### 2. Event Messages That Match the Frontend Contract

At minimum, the backend should send JSON messages shaped like:

```json
{
  "type": "accounting.snapshot.updated",
  "reason": "journal_entry.posted",
  "journal_entry_id": "je_123",
  "occurred_at": "2026-03-19T20:15:00Z"
}
```

The most important requirement is that:

- `type` is `accounting.snapshot.updated`
- `reason` is one of the supported reason strings
- `occurred_at` is an ISO timestamp

`journal_entry_id` is optional but useful.

### 3. Emission Rules

The backend should emit an update whenever any change affects the accounting snapshot shown in the UI.

Minimum events to emit:

- after a journal entry is posted
- after a clarification is created
- after a clarification is approved
- after a clarification is rejected
- after any action that changes balances, ledger rows, or dashboard counts

### 4. Snapshot Consistency

This is critical.

The frontend reacts to the push by calling existing REST endpoints again. That means the backend must ensure that the REST APIs already reflect the new state when the WebSocket event is sent.

These endpoints must stay authoritative:

- `GET /api/v1/clarifications`
- `GET /api/v1/ledger`
- `GET /api/v1/statements`

If the event is emitted before those endpoints show the updated state, the UI will refetch stale data.

### 5. Browser Connectivity Requirements

The backend team should confirm:

- local frontend origin can connect to the WebSocket endpoint
- deployed frontend origin can connect to the WebSocket endpoint
- any proxy or gateway in front of the backend supports WebSocket upgrade requests

### 6. Authentication Decision

Right now the frontend assumes a simple demo-style connection.

If the WebSocket endpoint will require authentication, the backend team needs to define:

- how the browser authenticates
- whether auth is cookie-based, token-based, or query-param based
- whether the same auth model is available in both local dev and deployment

If auth is added later, the frontend subscription client will need a small update.

## What frontend need

Frontend need these exact items:

1. the WebSocket URL for local development
2. the WebSocket URL for deployment
3. confirmation that they can emit `accounting.snapshot.updated` JSON events
4. the final list of supported `reason` values
5. confirmation that `/api/v1/clarifications`, `/api/v1/ledger`, and `/api/v1/statements` are already updated before the event is broadcast
6. confirmation of whether WebSocket auth is required

## Why This Design Was Chosen

The frontend intentionally uses push notifications plus REST refetching instead of pushing full accounting state over the socket.

This keeps the system simpler because:

- the backend remains the source of truth
- the frontend does not need duplicate merge logic for ledger state
- mock mode and live mode use the same page refresh path
- the WebSocket contract stays small and stable

## Verification Already Completed

The current implementation has been verified with:

- targeted frontend tests for dashboard, ledger, and statements refresh behavior
- a TypeScript build
- a Vite production build

This means the frontend side is ready for backend integration.
