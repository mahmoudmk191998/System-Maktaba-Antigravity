# Interactive Developer Playground

The **RMS Interactive Developer Playground** is a secure, browser-based API exploration and testing environment. It allows authorized restaurant administrators and developers to inspect endpoints, configure request parameters, and execute live API calls without exposing secret credentials to the client.

## Key Features

- **Multi-Tenant Isolation**: Only integrations belonging to the authenticated tenant are visible.
- **Server-Side Credential Proxy**: API keys and secrets are injected strictly on the server side. The browser never receives plaintext secrets.
- **SSRF & Open Proxy Guard**: Requests can only target authorized relative API routes (`/menu`, `/orders`, `/branches`, etc.). Arbitrary URLs and private IP ranges are blocked.
- **Live Code Generation**: Instantly generate copyable code snippets in **cURL**, **JavaScript / Fetch**, and **@rms/sdk**.
- **Destructive Action Confirmation**: State-changing operations (`POST /orders`, `PATCH /orders/:id/status`) require explicit confirmation.
- **Authoritative Idempotency**: Automatically generates and formats `Idempotency-Key` headers for safe order creation.

## Accessing the Playground

Navigate to `/developer/playground` in the RMS Web Application, or use the Playground API endpoints:

```http
GET  /api/v1/developer/playground/integrations
GET  /api/v1/developer/playground/openapi
POST /api/v1/developer/playground/execute
```

## Execute API Request Example

```http
POST /api/v1/developer/playground/execute
Authorization: Bearer <ADMIN_KEY>
Content-Type: application/json

{
  "integration_id": "int_kiosk_1",
  "version": "v1",
  "method": "GET",
  "path": "/branches"
}
```

### Response
```json
{
  "success": true,
  "data": {
    "status_code": 200,
    "duration_ms": 18,
    "request_id": "req_play_abc123",
    "headers": {
      "content-type": "application/json",
      "x-ratelimit-limit": "500",
      "x-ratelimit-remaining": "499"
    },
    "body": {
      "success": true,
      "data": [
        { "id": "branch_1", "name": "Downtown Branch", "is_active": true }
      ]
    },
    "code_examples": {
      "curl": "curl -X GET 'https://api.example-restaurant.com/api/v1/branches' -H 'Authorization: Bearer <YOUR_API_KEY>'",
      "sdk": "const branches = await rms.getBranches();"
    }
  }
}
```
