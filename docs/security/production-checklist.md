# RMS Production Security Checklist

| Category | Control Item | Status | Verified In Code |
| :--- | :--- | :--- | :--- |
| **Authentication** | API Bearer token with Bcrypt secret verification | **PASS** | `server/src/middleware/auth.middleware.ts` |
| **Authorization** | Scope-based permissions (`API_PERMISSIONS`) | **PASS** | `server/src/middleware/permission.middleware.ts` |
| **Tenant Isolation** | Strict tenant ID matching on all services & queries | **PASS** | All services in `server/src/services/` |
| **Branch Isolation** | `X-Branch-ID` access control against client allowlist | **PASS** | `server/src/middleware/branch.middleware.ts` |
| **Firestore Security** | Server-only collections reject client access (`if false;`) | **PASS** | `firestore.rules` |
| **Firestore POS** | Authenticated POS operations require `request.auth != null` | **PASS** | `firestore.rules` |
| **API Keys & Secrets** | Secrets stored as salted hashes; one-time reveal | **PASS** | `server/src/services/apiClient.service.ts` |
| **CORS** | Strict domain whitelisting, rejects malicious origins | **PASS** | `server/src/middleware/cors.middleware.ts` |
| **Rate Limiting** | Tiered rate limiting (Free 100, Standard 500, Premium 2000) | **PASS** | `server/src/middleware/rateLimiter.ts` |
| **Rate Limit Headers** | `X-RateLimit-*` and `Retry-After` headers on 429 | **PASS** | `server/src/middleware/rateLimiter.ts` |
| **Webhooks Security** | HMAC-SHA256 signatures with constant-time equality check | **PASS** | `server/src/integration/rmsApiClient.ts` |
| **Webhook Replay Protection**| 300-second timestamp tolerance window | **PASS** | `server/src/integration/rmsApiClient.ts` |
| **SSRF Protection** | Webhooks reject `localhost`, `127.0.0.1`, private IP ranges | **PASS** | `server/src/utils/ssrf.ts` |
| **Logging Sanitization**| Redaction of passwords, tokens, API keys, and client secrets | **PASS** | `server/src/utils/logger.ts` |
| **API Analytics** | Non-blocking telemetry in `api_usage_events` without bodies | **PASS** | `server/src/middleware/analytics.middleware.ts` |
| **Input Validation** | Strict Zod validation schemas (`.strict()`) on all endpoints | **PASS** | All validators in `server/src/validators/` |
| **Request Body Limits** | Max payload limit enforced (1MB), returns 413 | **PASS** | `server/src/middleware/error.middleware.ts` |
| **Error Leakage** | Stack traces and DB internals hidden from production responses | **PASS** | `server/src/middleware/error.middleware.ts` |
| **Firebase Admin Only** | Firebase Admin SDK strictly inside `server/` | **PASS** | `server/package.json` vs root `package.json` |
| **Frontend Secrets** | Frontend bundle free of RSA keys and API secrets | **PASS** | `server/src/__tests__/security-hardening.test.ts` |
| **Deterministic Pricing**| Authoritative server-side pricing engine with zero rounding drift | **PASS** | `server/src/services/pricing/pricing.engine.ts` |
| **Idempotency** | SHA-256 request fingerprinting with 409 conflict detection | **PASS** | `server/src/services/order.service.ts` |
