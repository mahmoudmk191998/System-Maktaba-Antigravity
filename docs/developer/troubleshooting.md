# Troubleshooting & FAQs

Common integration issues and their solutions.

## Common Issues

### 1. HTTP 401 Unauthorized
- **Cause**: Missing `Authorization: Bearer <key>` header or incorrect API secret.
- **Fix**: Verify your secret key and ensure it begins with `rms_live_`.

### 2. HTTP 403 Forbidden
- **Cause**: Missing permission (e.g. `orders:create`) or requested branch is not in `allowed_branch_ids`.
- **Fix**: Update integration permissions or branch access in the Admin Portal.

### 3. HTTP 429 Rate Limit Exceeded
- **Cause**: Exceeded tier request quota.
- **Fix**: Check `Retry-After` header and implement exponential backoff, or request an upgrade to `premium` tier.

### 4. Webhook Not Receiving Events
- **Cause**: Endpoint URL unreachable, returned 5xx, or circuit breaker is OPEN.
- **Fix**: Check `GET /api/v1/admin/integrations/:id/webhook-health` and inspect the dead-letter queue.
