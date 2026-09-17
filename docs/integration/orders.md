# Order Creation & Idempotency

Placing an order creates an immutable snapshot of all product prices, discounts, taxes, and customer delivery information.

## Endpoint

`POST /api/v1/orders`

### Idempotency Header

Always pass `Idempotency-Key: <unique-uuid>` with order creation requests.
- If network drops and the client retries with the same `Idempotency-Key`, RMS returns the original order without double-charging or incrementing the sequential order number.
- If a different payload is sent with an existing key, RMS returns `409 Conflict`.

### Request Example

```json
{
  "branch_id": "branch_sushi_main",
  "order_type": "delivery",
  "delivery": {
    "zone_id": "zone_zamalek",
    "address": "15 Brazil St, Zamalek, Cairo"
  },
  "customer": {
    "name": "Mahmoud",
    "phone": "01012345678"
  },
  "items": [
    {
      "product_id": "prod_california_roll",
      "quantity": 2,
      "addon_ids": ["addon_extra_ginger"]
    }
  ],
  "payment_method": "cash"
}
```
