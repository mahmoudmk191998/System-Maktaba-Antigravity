# RMS REST API & SaaS Multi-Tenant Backend (Phase 1)

This document describes the architecture, security model, authentication flow, and development setup for the Restaurant Management System (RMS) Standalone REST API Backend.

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                 External Client Applications                │
│       (Sushi Bar Website, Customer Mobile App, etc.)        │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTPS REST API
                               │ Authorization: Bearer rms_live_<clientId>.<secret>
                               │ Header: X-Branch-ID: <branchId> (optional)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│               RMS Central API Backend Server                │
│                 (Express.js + TypeScript)                   │
├─────────────────────────────────────────────────────────────┤
│ 1. Security Headers (Helmet)                                │
│ 2. CORS Dynamic Origin Validator                            │
│ 3. Request ID Middleware (X-Request-ID Tagging)             │
│ 4. Structured JSON Logger                                   │
│ 5. Per-Client Rate Limiter (X-RateLimit-* Headers)          │
│ 6. API Authentication & Tenant Resolution Middleware        │
│ 7. Permission & Branch Access Guard Middleware              │
│ 8. Zod Schema Request Validation                            │
│ 9. Firebase Admin SDK (Privileged Database Layer)           │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                   Cloud Firestore Database                  │
│       (Multi-Tenant Collections: api_clients, orders, ...)  │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. API Versioning & Endpoints

All API endpoints reside under `/api/v1/`.

### Health Check Endpoint
- **Method:** `GET`
- **Route:** `/api/v1/health`
- **Authentication:** None (Public)
- **Response:**
```json
{
  "success": true,
  "service": "rms-api",
  "version": "v1"
}
```

---

## 3. Authentication & API Client Credentials

### Credential Structure
External clients authenticate using an API key pair:
- `client_id`: Public identifier (e.g. `cli_9c3406c7fce6fc925fa3aae3`)
- `client_secret`: Private secret (e.g. `rms_sec_8a7d6e5c4b3a2f1e0d9c8b7a`)

The secret is **NEVER** stored in plain text. Only a secure `bcrypt` hash is stored in Firestore under the `api_clients` collection.

### Authorization Header Format
External websites send their credential as a Bearer token:
```http
Authorization: Bearer rms_live_<client_id>.<client_secret>
```
Alternative colon format also supported:
```http
Authorization: Bearer <client_id>:<client_secret>
```

### Request Context Injection
Upon successful verification, the authentication middleware resolves and injects `req.apiClient`:
```typescript
interface RequestContext {
  clientId: string;
  tenantId: string;
  allowedBranchIds: string[];
  permissions: ApiPermission[];
}
```

---

## 4. Tenant Isolation

1. **Strict Context Binding:** The `tenant_id` is determined **exclusively** from the authenticated API client record in Firestore.
2. **Body & Query Spoofing Prevention:** If a client attempts to pass a different `tenant_id` in the request body, query parameter, or headers, the request is immediately rejected with `403 Forbidden` (`Tenant mismatch`).
3. **Automatic Injection:** The verified `tenant_id` is automatically attached to downstream business logic and document operations.

---

## 5. Branch Access Control

API clients can be restricted to specific branches via `allowed_branch_ids`:
- Empty list (`[]`): Unrestricted access to all branches belonging to the tenant.
- Populated list (`['branch_001', 'branch_002']`): Access to any other branch returns `403 Forbidden`.

The `requireBranchAccess()` middleware validates path parameters (`:branchId`), query parameters (`?branch_id=...`), headers (`X-Branch-ID`), and body fields.

---

## 6. Permissions Infrastructure

The system defines granular API permissions:
- `menu:read` — Read menu categories, items, and details.
- `offers:read` — Read active promotions, discounts, and coupons.
- `branches:read` — Read branches information and operating hours.
- `delivery:read` — Read delivery zones and pricing.
- `orders:create` — Place new orders from external websites.
- `orders:read` — Query order status and history.
- `orders:update` — Modify pending orders or statuses.
- `customers:read` — Query customer loyalty tiers and points.
- `reservations:create` — Create table reservations.
- `reservations:read` — Query table reservation availability.

Middleware guards:
- `requirePermission('orders:create')`
- `requireAnyPermission(['menu:read', 'orders:read'])`
- `requireAllPermissions(['orders:create', 'orders:read'])`

---

## 7. Rate Limiting

- **Header Tags:** `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.
- **Default Limit:** 100 requests per minute per client.
- **Configurable via Environment:** `API_RATE_LIMIT` and `API_RATE_WINDOW_MS`.
- **Exceeded Response:** `429 Too Many Requests` (`RATE_LIMIT_EXCEEDED`).

---

## 8. CORS & Security Headers

- **Helmet:** Protects against MIME sniffing, clickjacking, and enforces secure HTTP header defaults.
- **Dynamic CORS:** Verifies against `ALLOWED_ORIGINS` in development and per-client `allowed_origins` in production.
- **Wildcard Disabled:** `Access-Control-Allow-Origin: *` is strictly forbidden in production.

---

## 9. Error Handling & Standard Response Format

All responses follow a consistent envelope:

### Success Format:
```json
{
  "success": true,
  "data": { ... }
}
```

### Error Format:
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Permission denied: Missing required permission 'orders:create'"
  }
}
```

---

## 10. Environment Variables

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | `string` | `development` | `development`, `test`, or `production` |
| `PORT` | `number` | `4000` | HTTP port for the server |
| `API_RATE_LIMIT` | `number` | `100` | Max requests per sliding window |
| `API_RATE_WINDOW_MS` | `number` | `60000` | Sliding window in milliseconds (1 min) |
| `ALLOWED_ORIGINS` | `string` | `http://localhost:5173,...` | Allowed CORS origins (comma-separated) |
| `FIREBASE_PROJECT_ID` | `string` | - | Google Cloud Firebase Project ID |
| `FIREBASE_CLIENT_EMAIL` | `string` | - | Firebase Service Account Email |
| `FIREBASE_PRIVATE_KEY` | `string` | - | Firebase Service Account Private Key |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | `string` | - | Path to serviceAccountKey.json file |

---

## 11. Running the Server

### Development Mode:
```bash
cd server
npm install
npm run dev
```

### Running Tests:
```bash
cd server
npm test
```

### Building for Production:
```bash
cd server
npm run build
npm start
```
