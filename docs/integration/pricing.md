# Server-Side Deterministic Pricing Engine

External clients MUST NEVER calculate authoritative totals or apply discounts on the client side. The RMS Pricing Engine provides a secure preview endpoint.

## Endpoint

`POST /api/v1/pricing/preview`

### Request Body

```json
{
  "branch_id": "branch_sushi_main",
  "order_type": "delivery",
  "delivery_zone_id": "zone_zamalek",
  "coupon_code": "WELCOME20",
  "items": [
    {
      "product_id": "prod_california_roll",
      "quantity": 2,
      "addon_ids": ["addon_extra_ginger", "addon_spicy_mayo"]
    }
  ]
}
```

### Response

```json
{
  "success": true,
  "data": {
    "currency": "EGP",
    "subtotal": 500,
    "discount_total": 100,
    "discounted_subtotal": 400,
    "delivery_fee": 45,
    "tax_rate": 14,
    "tax_amount": 56,
    "tax_included": false,
    "grand_total": 501,
    "items": [...]
  }
}
```
