# Authentication & API Keys

All requests to protected RMS endpoints must include an API credential in the HTTP `Authorization` header.

## Header Format
```http
Authorization: Bearer rms_live_<client_id>.<secret>
```

## Credential Structure
- **Prefix**: `rms_live_`
- **Client ID**: 24 alphanumeric characters identifying the integration.
- **Separator**: `.` (dot)
- **Secret**: Cryptographically secure random 64-character token.

## Security Rules
1. Never expose your API Secret in frontend client code (e.g. React/Vue/Angular in browser).
2. Store credentials in server-side environment variables (`RMS_API_KEY`).
3. Rotate keys immediately if a secret is accidentally committed or exposed.
