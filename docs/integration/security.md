# Security & Best Practices

## 1. Secrets Management
- Store API secrets in secure environment variables (`.env`, Vault, or Cloud Secret Manager).
- Never commit secrets into git or client-side bundles (React, Vue, mobile apps).
- Rotate secrets immediately if compromised via `POST /api/v1/admin/api-clients/:id/rotate-secret`.

## 2. Rate Limits & Headers
RMS enforces tiered rate limits per API client:
- **Free**: 100 requests / minute
- **Standard**: 500 requests / minute
- **Premium**: 2000 requests / minute

Inspect the response headers:
- `X-RateLimit-Limit`: Current client quota.
- `X-RateLimit-Remaining`: Remaining calls in the current window.
- `X-RateLimit-Reset`: Seconds until window resets.
- `Retry-After`: Returned on HTTP `429 Too Many Requests`.

## 3. Replay Attack Prevention
Always verify the `X-RMS-Timestamp` header on webhooks and reject requests older than 300 seconds.

## 4. Origin & CORS
Configure explicit origin URLs in your API client (`allowed_origins`). Wildcard origins (`*`) are disallowed for production.
