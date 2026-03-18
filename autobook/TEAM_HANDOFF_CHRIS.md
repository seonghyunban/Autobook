# Frontend Handoff for Chris

## Current Frontend Status

Robert's frontend is functionally in place and deployed.

- deployed URL:
  - `https://ai-accountant490.netlify.app/`
- current deployment is mock-backed
- key screens are complete:
  - dashboard
  - transactions
  - clarifications
  - ledger
  - statements
- frontend tests and build pass locally

## Method Used

The frontend was built around stable contracts first.

- all APIs are mocked right now
- mock data lives in `autobook/frontend/src/mocks/fixtures`
- the UI depends on typed response shapes in `autobook/frontend/src/api/types.ts`
- the frontend intentionally does not depend on DB internals or ML intermediate outputs

This keeps the UI isolated from unfinished backend storage/model details.

## What You Should Know About the Frontend

The frontend already renders:

- parse results and posting recommendations
- clarification queue items
- ledger entries with filters
- dashboard balance cards
- statement tables and exports
- transaction file upload for CSV, PDF, and PNG/JPG through one UI entry point

The frontend needs data in business-ready form. It does not want token-level or model-level details.

Important current frontend data needs:

- stable IDs:
  - `parse_id`
  - `clarification_id`
  - `journal_entry_id`
- ledger entry structure:
  - `date`
  - `description`
  - `lines`
- account balances:
  - `account_code`
  - `account_name`
  - `balance`
- statement structure:
  - `statement_type`
  - `period`
  - `sections`
  - `totals`

Important current upload reality:

- CSV is the current grounded upload path
- PDF is mocked as text extraction for demo purposes
- PNG/JPG is mocked as OCR-style receipt intake for demo purposes
- all upload types are expected to normalize into the same `ParseResponse`

## My Assumptions About Your Part

I am assuming your side will own or heavily influence:

- DB-backed data shape for clarifications
- DB-backed data shape for ledger entries
- ID conventions
- statement data if it is derived from persisted ledger state
- any ML/data processing outputs that need to be persisted before UI retrieval

## What I Need From You

Please confirm these items:

1. final field names for ledger entries and balances
2. final field names for statement responses
3. final ID format for:
   - `clarification_id`
   - `journal_entry_id`
   - `parse_id`
4. whether ledger balances should be returned precomputed or derived client-side from entries
5. whether statements are generated per request or read from stored artifacts
6. one realistic sample payload for:
   - `POST /api/v1/parse/upload`
   - `GET /api/v1/clarifications`
   - `GET /api/v1/ledger`
   - `GET /api/v1/statements`

## What Remains To Decide

- whether clarification items include editable line details in v1
- whether uploaded PDF/image sources should be stored or just normalized and discarded
- whether the ledger endpoint supports server-side filtering or only raw list retrieval
- whether statements will support multiple statement types early or only one initially
- whether exported data should match exactly what the UI already renders

## Important Frontend Boundary

Please keep the API business-oriented.

The frontend should not have to know about:

- raw model outputs
- dataset-specific formats
- DAO layer details
- storage-specific naming

The frontend wants clean, renderable accounting objects only.
