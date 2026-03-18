# Frontend Deployment

## Recommended Host

Use Netlify for the current frontend. The repo now includes a root-level [netlify.toml](/c:/Users/rober/OneDrive/Desktop/study_file/Third_year_winter/CSC490/AI-Accountant/netlify.toml) that treats [autobook/frontend](/c:/Users/rober/OneDrive/Desktop/study_file/Third_year_winter/CSC490/AI-Accountant/autobook/frontend) as the build root and configures SPA routing.

This is the cleanest option for the current repo shape because:
- the frontend lives in a subdirectory
- the app is a static Vite build
- the router needs a catch-all rewrite to `index.html`

## Deployment Modes

### 1. Mock Demo Deployment

Use this first if backend integration is not ready.

Set these environment variables in Netlify:
- `VITE_USE_MOCK_API=true`
- `VITE_API_BASE_URL=http://localhost:8000/api/v1`
- `VITE_DEMO_USER_ID=demo-user-1`
- `VITE_APP_NAME=AI Accountant`

Reference file:
- [autobook/frontend/.env.production.mock.example](/c:/Users/rober/OneDrive/Desktop/study_file/Third_year_winter/CSC490/AI-Accountant/autobook/frontend/.env.production.mock.example)

### 2. Live API Deployment

Use this only after backend routes and CORS are ready.

Set these environment variables in Netlify:
- `VITE_USE_MOCK_API=false`
- `VITE_API_BASE_URL=https://your-backend-host.example.com/api/v1`
- `VITE_DEMO_USER_ID=demo-user-1`
- `VITE_APP_NAME=AI Accountant`

Reference file:
- [autobook/frontend/.env.production.live.example](/c:/Users/rober/OneDrive/Desktop/study_file/Third_year_winter/CSC490/AI-Accountant/autobook/frontend/.env.production.live.example)

## Netlify Steps

1. Import the GitHub repository into Netlify.
2. Let Netlify read the repo-level `netlify.toml`.
3. Add the environment variables for either mock mode or live API mode.
4. Trigger the first deployment.

Expected build settings from the config:
- base directory: `autobook/frontend`
- build command: `npm ci && npm run build`
- publish directory: `dist`

## Local Pre-Deploy Check

Run this before pushing:

```powershell
cd c:\Users\rober\OneDrive\Desktop\study_file\Third_year_winter\CSC490\AI-Accountant\autobook\frontend
npm.cmd run test
npm.cmd run build
```

## Backend Assumptions For Live Mode

The live deployment assumes:
- backend is reachable from the public internet
- CORS allows the deployed frontend origin
- the frontend endpoints remain:
  - `POST /api/v1/parse`
  - `POST /api/v1/parse/upload`
  - `GET /api/v1/clarifications`
  - `POST /api/v1/clarifications/{id}/resolve`
  - `GET /api/v1/ledger`
  - `GET /api/v1/statements`

## Current Recommendation

Deploy the frontend in mock mode first. That gives the team a stable demo URL immediately and keeps backend integration as a later environment switch instead of a frontend rewrite.
