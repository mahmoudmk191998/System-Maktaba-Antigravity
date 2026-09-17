# Universal Integration Onboarding & Lifecycle

## Overview

The Universal Integration Platform allows restaurant administrators to onboard any external digital channel (E-Commerce Web, Mobile App, Self-Service Kiosk, Delivery Aggregator) through a single unified flow.

## 1. Onboarding an Integration

### Request
```http
POST /api/v1/admin/integrations
Authorization: Bearer <ADMIN_API_KEY>
Content-Type: application/json

{
  "name": "Downtown Mobile App",
  "type": "mobile_app",
  "description": "iOS and Android customer ordering application",
  "allowed_branch_ids": ["branch_downtown_01"],
  "allowed_origins": ["https://app.downtown-eats.com"],
  "permissions": [
    "menu:read",
    "branches:read",
    "delivery:read",
    "orders:create",
    "orders:read"
  ],
  "rate_limit_tier": "premium",
  "webhook_url": "https://backend.downtown-eats.com/api/webhooks",
  "webhook_events": ["order.created", "order.status_updated"]
}
```

### Response
```json
{
  "success": true,
  "data": {
    "integration": {
      "id": "int_78a1bc23de45",
      "tenant_id": "tenant_downtown",
      "name": "Downtown Mobile App",
      "type": "mobile_app",
      "status": "active",
      "rate_limit_tier": "premium"
    },
    "api_client_id": "cli_90de1234",
    "api_key": "rms_live_cli_90de1234.rms_sec_abc123...",
    "secret_last4": "c123",
    "webhook_secret": "whsec_789xyz...",
    "instructions": {
      "auth_header": "Authorization: Bearer rms_live_cli_90de1234.rms_sec_abc123...",
      "architecture_flow": "Browser / App UI -> External Website Backend -> RMS Standalone API",
      "sdk_usage": "const rms = new RmsApiClient({ baseUrl: 'https://api.your-rms.com/api/v1', apiKey: '...' });"
    }
  }
}
```

> [!IMPORTANT]
> The `api_key` and `webhook_secret` are revealed **only once** at the time of creation or rotation. Store them securely in your backend environment secrets.

---

## 2. Integration Management Endpoints

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/v1/admin/integrations` | `POST` | Onboard new universal integration |
| `/api/v1/admin/integrations` | `GET` | List all tenant integrations |
| `/api/v1/admin/integrations/:id` | `GET` | Get integration details |
| `/api/v1/admin/integrations/:id` | `PATCH` | Update permissions, branches, origins, or status |
| `/api/v1/admin/integrations/:id` | `DELETE` | Revoke integration and disable API client |
| `/api/v1/admin/integrations/:id/rotate-secret` | `POST` | Rotate API client credentials |
