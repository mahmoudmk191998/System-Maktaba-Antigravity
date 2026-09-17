# Universal Integrations

RMS treats every consumer (website, iOS/Android app, kiosk, POS, aggregator) as an independent **Universal Integration**.

## Integration Types
- `custom_website`: Customer-facing web ordering frontend.
- `mobile_app`: Native iOS and Android ordering applications.
- `kiosk`: Self-service dining room kiosks.
- `pos_terminal`: Cashier counter point-of-sale device.
- `delivery_aggregator`: Third-party delivery platforms.
- `third_party_service`: External loyalty or accounting systems.
- `other`: Generic custom applications.

## Onboarding API
```http
POST /api/v1/admin/integrations
Authorization: Bearer <ADMIN_KEY>
Content-Type: application/json

{
  "name": "Downtown Kiosk #1",
  "type": "kiosk",
  "allowed_branch_ids": ["branch_downtown"],
  "permissions": ["menu:read", "orders:create", "branches:read"],
  "rate_limit_tier": "standard"
}
```
