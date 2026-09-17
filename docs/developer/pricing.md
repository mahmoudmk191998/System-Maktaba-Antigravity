# Server-Side Pricing Engine

The RMS operates an authoritative, server-side pricing engine. Clients must NEVER calculate discounts, taxes, or total order values on the frontend.

## Pricing Preview Endpoint
```http
POST /api/v1/pricing/preview
Authorization: Bearer <API_KEY>
Content-Type: application/json

{
  "branch_id": "branch_123",
  "order_type": "delivery",
  "items": [
    {
      "product_id": "prod_1",
      "quantity": 2,
      "addon_ids": ["addon_cheese"]
    }
  ],
  "delivery_zone_id": "zone_north",
  "coupon_code": "DISCOUNT10"
}
```

### Breakdown Response
```json
{
  "success": true,
  "data": {
    "subtotal": 30.00,
    "discount_total": 3.00,
    "delivery_fee": 5.00,
    "service_fee": 0.00,
    "tax_total": 2.70,
    "total": 34.70,
    "currency": "USD"
  }
}
```
