# Frontend Handoff for Ben

## Current Frontend Status

Robert's frontend work is in a usable state.

- React + TypeScript app is built under `autobook/frontend`
- app routes are implemented:
  - `/`
  - `/transactions`
  - `/clarifications`
  - `/ledger`
  - `/statements`
- frontend is deployed at:
  - `https://ai-accountant490.netlify.app/`
- current deployment is in mock mode
- frontend tests pass locally
- production build passes locally

## Method Used

The frontend was built contract-first and mock-first.

- all current API calls go through `src/api/*`
- page components do not call `fetch` directly
- mock responses are used behind the same API layer as the future real backend
- the deployed Netlify build is currently using:
  - `VITE_USE_MOCK_API=true`

This means integration with the real backend should happen by changing env values and the backend availability, not by rewriting pages.

## What You Should Know About the Frontend

The frontend currently expects these endpoints:

- `POST /api/v1/parse`
- `POST /api/v1/parse/upload`
- `GET /api/v1/clarifications`
- `POST /api/v1/clarifications/{id}/resolve`
- `GET /api/v1/ledger`
- `GET /api/v1/statements`

The frontend depends on business outputs, not ML internals.

Important frontend-facing fields:

- `status`
- `confidence`
- `explanation`
- `proposed_entry`
- `clarification_id`
- `parse_time_ms`

The frontend is already wired for:

- natural language transaction parsing
- one file upload flow for CSV, PDF, and PNG/JPG
- clarification queue
- filterable ledger view
- statements view with CSV/PDF export

Important current reality:

- CSV upload is the grounded frontend path today
- PDF upload is UI-supported but mocked
- PNG/JPG upload is UI-supported but mocked
- all upload types currently return the same parse response shape

## My Assumptions About Your Part

I am assuming your side will own or coordinate:

- backend host and public base URL
- CORS setup for the deployed frontend origin
- endpoint availability and routing
- any infra-level deployment detail needed for live API mode
- LLM-facing shape decisions that affect `parse` response output

## What I Need From You

Please confirm these items:

1. the real backend base URL for the deployed frontend
2. whether the endpoint list above is acceptable as-is
3. whether `POST /api/v1/parse/upload` is acceptable as the single upload endpoint for CSV, PDF, and image files
4. CORS support for:
   - local Vite dev
   - `https://ai-accountant490.netlify.app/`
5. who is owning each endpoint implementation
6. one real sample response per endpoint once available

## What Remains To Decide

- whether the live API contract exactly matches the mock contract
- whether the single upload endpoint should accept PDF and image files in v1 or only CSV
- whether `parse_time_ms` will be returned in the first live version
- whether the deployed frontend should stay in mock mode for demo day or switch to live mode
- whether there will be one backend host for all routes or split ownership behind one gateway

## Notes for Integration

The deployment setup is already ready for env-based switching.

When the backend is ready, the frontend only needs:

- `VITE_USE_MOCK_API=false`
- `VITE_API_BASE_URL=<real backend url>`

No page-level rewrite should be necessary.
