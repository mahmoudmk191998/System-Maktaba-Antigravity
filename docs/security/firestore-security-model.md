# Firestore Security Model & Data Tiering

## Data Tier Classification

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Public Data (REST API Endpoints Only)                    │
│    - Branches, Categories, Active Products, Delivery Zones  │
│    - Accessed via HTTPS REST API (Rate-limited, CORS, Auth) │
├─────────────────────────────────────────────────────────────┤
│ 2. Authenticated POS / Staff Data (Firestore Client SDK)    │
│    - POS Orders, Tables, Shifts, Kitchen Items, Stock       │
│    - Requires Firebase Auth session (request.auth != null)  │
├─────────────────────────────────────────────────────────────┤
│ 3. Server-Only Sensitive Data (Firebase Admin SDK Exclusively)│
│    - API Clients & Secret Hashes                            │
│    - Audit Logs & Telemetry Events                          │
│    - Webhook Endpoints & Secrets                            │
│    - Branch Counters & Idempotency Records                  │
│    - Firestore Rule: `allow read, write: if false;`         │
└─────────────────────────────────────────────────────────────┘
```

## Security Invariants

1. **Client Isolation**: The browser or mobile client can never read `api_clients` or `webhook_endpoints`.
2. **Deterministic Sequence Numbers**: `branch_counters` cannot be manipulated or decremented from the browser.
3. **Replay & Idempotency Locking**: `idempotency_records` are locked and managed inside atomic backend transactions.
4. **Tenant Data Segregation**: Every document carries `tenant_id` and is strictly filtered by the backend services and security rules.
