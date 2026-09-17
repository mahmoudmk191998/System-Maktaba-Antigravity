# Authentication & Credentials

All requests to the RMS REST API (with the exception of `/health`) require an API key passed in the `Authorization` header.

## Credential Format

```
Authorization: Bearer rms_live_<clientId>.<clientSecret>
```

- `<clientId>`: Begins with `cli_` (e.g. `cli_a1b2c3d4e5f6`)
- `<clientSecret>`: Begins with `rms_sec_` (e.g. `rms_sec_8f9e0a1b2c3d4e5f6a7b8c9d`)

## Headers Reference

| Header | Description | Required | Example |
| :--- | :--- | :--- | :--- |
| `Authorization` | Bearer token with client credentials | Yes | `Bearer rms_live_cli_xxx.rms_sec_yyy` |
| `X-Branch-ID` | Restaurant branch context | Recommended | `branch_sushi_main` |
| `X-Request-ID` | Unique request tracking identifier | Optional | `req_12345678` |
| `Idempotency-Key` | Required for order creation deduplication | Conditional | `idem_uuid_v4_string` |

## Error Responses

- `401 Unauthorized`: Missing or invalid API key, expired key, or disabled credential.
- `403 Forbidden`: API client lacks the required permission scope (e.g. `orders:create`) or requested branch is unauthorized.
