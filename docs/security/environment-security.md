# Environment Variables Security Audit

## Variable Classification

### 1. Server-Only Secrets (MUST NEVER BE BUNDLED IN CLIENT)

These variables must exist solely in the backend runtime (`server/.env` or hosting secret store):

- `FIREBASE_PROJECT_ID` — Firebase project identifier for Admin SDK.
- `FIREBASE_CLIENT_EMAIL` — Service account email with administrative Firestore access.
- `FIREBASE_PRIVATE_KEY` — RSA Private Key for Admin SDK auth.
- `FIREBASE_SERVICE_ACCOUNT_PATH` — Optional path to private key JSON.
- `RMS_API_KEY` — API Bearer token for server-to-server calls.
- `RMS_WEBHOOK_SECRET` — HMAC signing secret.

> **CRITICAL RULE**: Server variables MUST NEVER start with `VITE_`, `NEXT_PUBLIC_`, or `PUBLIC_`.

### 2. Client-Exposed Public Variables (Safe for Browser Bundling)

These variables are compiled into the React / Vite frontend bundle:

- `VITE_FIREBASE_API_KEY` — Firebase public API web key (restricted by Firebase Auth & Firestore Rules).
- `VITE_FIREBASE_AUTH_DOMAIN` — Auth redirect domain.
- `VITE_FIREBASE_PROJECT_ID` — Project identifier.
- `VITE_FIREBASE_STORAGE_BUCKET` — Public cloud storage bucket.
- `VITE_FIREBASE_MESSAGING_SENDER_ID` — Push messaging sender.
- `VITE_FIREBASE_APP_ID` — Web client application ID.
- `VITE_API_URL` — Base URL of the RMS REST backend.

### 3. Deployment Audit Checklist

- [x] `.env` is listed in `.gitignore` at root and in `server/`.
- [x] No `FIREBASE_PRIVATE_KEY` exists in `src/` or `dist/`.
- [x] Build output (`dist/`) inspected: 0 secret references found.
