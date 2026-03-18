# Frontend Architecture and Integration Plan

## Purpose

This document defines the frontend scope for AI Accountant (Autobook), the planned React + TypeScript structure, the UI behavior we will implement first, and the assumptions we make about backend and other team-owned systems.

This is a frontend-owned plan. It is intentionally minimal and optimized for:

- a 2-week implementation window
- A5 requirements around observability and testability
- a startup-style demo that shows the full workflow
- low coupling to unfinished backend and ML components

## Scope Boundary

The frontend team is responsible for:

- React application setup
- routing and shared layout
- page implementation
- API client layer
- mock data and fixture-driven development
- basic UI states for parse, clarification, ledger, and statements

The frontend team is not responsible for implementing:

- authentication backend
- database schema or DAO layer
- ML models or training code
- rule engine accounting logic
- ledger posting logic
- financial statement generation logic
- infra or deployment refactors

## Product Scope for Frontend

We will build a minimal but more product-like demo surface:

1. Dashboard home
2. Transaction input and parse result
3. Clarification queue
4. Ledger view
5. Statements view

We will not build login for the initial version.

For demo and development, we assume a hardcoded demo user or fixed `user_id` handled outside the UI.

## Routing Strategy

We will use React Router with five routes:

- `/` -> `DashboardPage`
- `/transactions` -> `TransactionPage`
- `/clarifications` -> `ClarificationPage`
- `/ledger` -> `LedgerPage`
- `/statements` -> `StatementsPage`

This matches the intended product flow while adding a stronger home screen and a dedicated reporting page:

`Dashboard -> Transaction -> Clarification -> Ledger -> Statements`

## Shared Layout

The app should have one shared layout to make the product feel coherent.

Planned layout:

- top bar with product name: `AI Accountant`
- simple nav links:
  - `Dashboard`
  - `Transaction`
  - `Clarifications`
  - `Ledger`
  - `Statements`

Planned file:

- `src/layout/AppLayout.tsx`

## Planned Frontend Structure

```text
autobook/frontend/
  src/
    layout/
      AppLayout.tsx
    pages/
      DashboardPage.tsx
      TransactionPage.tsx
      ClarificationPage.tsx
      LedgerPage.tsx
      StatementsPage.tsx
    api/
      client.ts
      types.ts
      parse.ts
      clarifications.ts
      ledger.ts
      statements.ts
    mocks/
      fixtures/
        parse-auto-posted.json
        parse-needs-clarification.json
        clarification-resolved.json
        statements-sample.json
      mockApi.ts
    components/
      TransactionForm.tsx
      ParseResultCard.tsx
      ClarificationList.tsx
      LedgerTable.tsx
```

Notes:

- We will implement pages first.
- We will extract reusable components only after duplication appears.
- Pages must never call `fetch` directly.
- All network and mock access goes through `src/api/*`.

## UI Behavior

### Transaction Page

Primary goal:

- accept natural language transaction input
- accept uploaded transaction files through one upload path
- submit to parse API
- display the parse result and next action

Expected behavior:

1. User enters a transaction description
2. User submits
3. Show loading state
4. Show parse result
5. If `status = auto_posted`
   - show success state
   - show button to go to ledger
6. If `status = needs_clarification`
   - show warning state
   - show button to go to clarification queue

Displayed fields should include:

- explanation
- confidence
- status
- proposed journal entry preview
- `parse_time_ms` if provided

Upload behavior:

- CSV is supported in the current frontend flow
- PDF is exposed as a text-based upload path in the UI, but currently mocked
- PNG/JPG is exposed as a receipt-style upload path in the UI, but currently mocked
- all uploaded files still normalize into the same parse result contract

### Clarification Page

Primary goal:

- show ambiguous transactions that need review
- let the user approve, reject, or minimally edit before posting

Expected behavior:

1. Load pending clarification items
2. Show list of items
3. Select an item to inspect its proposed entry
4. Support actions:
   - approve
   - reject
   - edit and submit, only if backend contract is stable enough

Implementation note:

- approval and rejection are required
- full inline journal editing is optional and should stay minimal

### Ledger Page

Primary goal:

- show posted entries, integrity status, and account balances in one place

Expected behavior:

1. Show ledger metrics and balance integrity
2. Support simple client-side filtering
3. Render posted entries and account balances
4. Link cleanly to the dedicated statements page

### Dashboard Page

Primary goal:

- provide a startup-style home screen tying together the major workflow steps

Expected behavior:

1. Show high-level metrics from clarifications, ledger, and statements
2. Offer quick navigation into transaction intake, clarifications, ledger, and statements
3. Surface recent activity so the app feels cohesive rather than page-based

### Statements Page

Primary goal:

- provide a dedicated reporting view for financial statement output

Expected behavior:

1. Show statement metadata such as type and period
2. Render statement sections and totals cleanly
3. Keep reporting separate from operational ledger review

## Minimal UI Elements

Required UI elements:

- `TransactionForm`
- `ParseResultCard`
- `ClarificationList`
- `LedgerTable`
- `StatusBadge`

`StatusBadge` should visually distinguish:

- `auto_posted`
- `needs_clarification`
- `rejected`

This is important because confidence gating is a core product feature.

## API Layer Rules

The frontend will treat the backend as a contract-based system.

Rules:

- Pages never call `fetch` directly
- API functions live only in `src/api/*`
- Mock and real implementations must share the same response shape
- Frontend must not depend on ML internals

Frontend-relevant fields:

- `status`
- `confidence`
- `proposed_entry`
- `explanation`
- `clarification_id`
- `parse_time_ms`

Frontend should not depend on:

- token-level entity extraction output
- raw spaCy output
- intermediate ML stage data
- model-specific reasoning traces

## Expected Backend Endpoints

The frontend expects these endpoints to exist behind stable JSON contracts:

- `POST /api/v1/parse`
- `POST /api/v1/parse/upload`
- `GET /api/v1/clarifications`
- `POST /api/v1/clarifications/{id}/resolve`
- `GET /api/v1/ledger`
- `GET /api/v1/statements`

## Expected Contract Shape

### `POST /api/v1/parse`

Request:

```json
{
  "input_text": "Bought a laptop for $2400",
  "source": "manual",
  "currency": "CAD"
}
```

Response shape expected by frontend:

```json
{
  "parse_id": "parse_123",
  "status": "auto_posted",
  "explanation": "Posted to equipment and cash.",
  "confidence": {
    "overall": 0.94,
    "auto_post_threshold": 0.85
  },
  "parse_time_ms": 42,
  "proposed_entry": {
    "journal_entry_id": "je_123",
    "lines": [
      {
        "account_code": "1500",
        "account_name": "Equipment",
        "type": "debit",
        "amount": 2400
      },
      {
        "account_code": "1000",
        "account_name": "Cash",
        "type": "credit",
        "amount": 2400
      }
    ]
  },
  "clarification_id": null
}
```

### `GET /api/v1/clarifications`

Response shape expected by frontend:

```json
{
  "items": [
    {
      "clarification_id": "cl_123",
      "status": "pending",
      "source_text": "Transferred money",
      "explanation": "Transfer direction is unclear.",
      "confidence": {
        "overall": 0.51
      },
      "proposed_entry": {
        "lines": []
      }
    }
  ],
  "count": 1
}
```

### `POST /api/v1/clarifications/{id}/resolve`

Request:

```json
{
  "action": "approve"
}
```

Response shape expected by frontend:

```json
{
  "clarification_id": "cl_123",
  "status": "resolved",
  "journal_entry_id": "je_456"
}
```

### `GET /api/v1/ledger`

Response shape expected by frontend:

```json
{
  "entries": [],
  "balances": [],
  "summary": {
    "total_debits": 2400,
    "total_credits": 2400
  }
}
```

### `GET /api/v1/statements`

Response shape expected by frontend:

```json
{
  "statement_type": "balance_sheet",
  "period": {
    "as_of": "2026-03-31"
  },
  "sections": [],
  "totals": {}
}
```

## Mock Strategy

The frontend must be buildable before backend completion.

We will use fixed JSON fixtures and a mock API layer first.

Required fixtures:

1. clean auto-posted transaction
2. needs clarification transaction
3. resolved clarification result
4. statements sample response

Current upload mock behavior:

- CSV files return grounded demo results
- PDF files return mocked text-extraction style results
- PNG/JPG files return mocked OCR-style results
- all file types still return the same `ParseResponse`

Mock switching should be environment-based, for example:

- `VITE_USE_MOCK_API=true`

This allows the UI to switch between mock and real backend without page rewrites.

## Assumptions About Other Parts

The frontend assumes the following from other teams:

### Backend/API

- stable endpoint URLs
- stable JSON response shapes
- CORS configured for local frontend development
- clear error response format

### Rule Engine / Posting Logic

- `proposed_entry.lines` is balanced or intentionally withheld
- `status` is decided before response is returned
- explanations are short and user-facing

### Clarification System

- ambiguous transactions can be listed as pending tasks
- resolve action updates backend state consistently
- once resolved, approved items appear in ledger results

### Ledger / Statements

- ledger returns posted entries only
- statements are generated from posted ledger data
- statement output is consistent enough to render tables without backend-specific hacks

## What We Need From Other Parts

The frontend team needs the following from backend and other implementation owners:

1. agreed JSON contract samples for all 4 core flows
2. field names frozen early
3. sample error payloads
4. a decision on whether clarification editing is supported in the first backend version
5. a simple demo user mechanism, even if auth is deferred
6. local API base URL and run instructions once backend is ready

## Non-Goals for First Frontend Iteration

The first iteration will not include:

- production auth flow
- websocket-based real-time updates
- advanced filtering and search
- full accounting-editing UX
- admin panels
- infra dashboards

If needed for the demo, polling is acceptable in place of real-time subscriptions.

## Implementation Sequence

### Phase 1

- scaffold React app
- add routing
- add shared layout
- create mock API and fixtures

### Phase 2

- implement `TransactionPage`
- implement parse result rendering

### Phase 3

- implement `ClarificationPage`
- support approve and reject actions

### Phase 4

- implement `LedgerPage`
- add filtering and account balance summary

### Phase 5

- implement `DashboardPage`
- implement `StatementsPage`

### Phase 6

- integrate real backend where available
- fix contract mismatches in `src/api/*` only
- polish UI states and navigation

## Acceptance Criteria for Frontend

The frontend is considered ready when:

- all main pages are navigable
- dashboard shows summary cards and quick actions
- transaction submission works with mocks
- parse results clearly show status and confidence
- clarification queue supports review flow
- ledger page shows posted entries
- statements render on their own page
- switching from mock API to real API does not require page rewrites

## Final Guiding Principle

Build only the frontend slice we own.

Define clean seams with the backend.

Do not absorb unfinished backend, ML, auth, or infra work into the frontend scope unless a contract blocker makes it unavoidable.
