# Frontend Handoff for Vivian

## Current Frontend Status

Robert's frontend work is ready for rule-engine and auth alignment.

- deployed URL:
  - `https://ai-accountant490.netlify.app/`
- current deployment is in mock mode
- implemented screens:
  - dashboard
  - transactions
  - clarifications
  - ledger
  - statements
- login and auth UI are intentionally deferred for now

## Method Used

The frontend was built around mocked API contracts first.

- all API calls are currently mocked
- the UI uses business-level fields only
- confidence gating is surfaced directly in the UI
- clarification flow is already wired visually

This means the frontend is ready to consume rule-engine outcomes as soon as they are stable.

## What You Should Know About the Frontend

The frontend currently assumes these rule-facing states exist:

- `auto_posted`
- `needs_clarification`
- `rejected`

It also assumes parse responses provide:

- `explanation`
- `confidence.overall`
- `confidence.auto_post_threshold`
- `proposed_entry.lines`
- `clarification_id`

Current upload presentation:

- CSV upload is implemented in the frontend
- PDF upload is presented as text-based document intake, but mocked
- PNG/JPG upload is presented as receipt intake, but mocked
- all file types currently flow into the same parse-result UI

The clarification page already supports:

- approve
- reject

The UI can support edit later, but it should stay minimal unless you confirm it is needed in v1.

## My Assumptions About Your Part

I am assuming your side will own or define:

- status semantics
- accounting validation rules
- what counts as a balanced or valid posting
- short user-facing explanations for rule outcomes
- future auth/login behavior when we stop using a demo user

## What I Need From You

Please confirm these items:

1. exact meaning of:
   - `auto_posted`
   - `needs_clarification`
   - `rejected`
2. whether `proposed_entry.lines` should always be balanced when returned
3. whether `rejected` responses still include a proposed entry or not
4. whether clarification editing is actually in scope for first backend integration
5. what minimum explanation text should look like for the UI
6. what the eventual auth/login plan is, even if it stays deferred for now
7. whether PDF/image inputs should produce the same status semantics as plain text and CSV

## What Remains To Decide

- whether the first live version includes any login at all
- whether the frontend should keep using a hardcoded demo user for the course demo
- whether clarification edit is needed or approve/reject is enough
- whether rule failures should surface as `rejected` or as API errors with messages
- whether image/PDF inputs should be supported in the first live backend version or remain demo-only

## Notes About Auth

There is currently no login page in the deployed app by design.

That was a scope decision to avoid blocking the product demo on unfinished auth.

If auth becomes necessary later, I need from your side:

- token/session format
- success response shape
- failure response shape
- redirect expectation after login

Until then, the frontend is operating with a demo-user assumption so the rest of the workflow stays testable.
