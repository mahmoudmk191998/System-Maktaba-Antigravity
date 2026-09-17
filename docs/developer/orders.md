# Order Creation & Immutable Snapshots

Submit customer orders with guaranteed server-side calculation and immutable pricing snapshots.

## Create Order Endpoint
```http
POST /api/v1/orders
Authorization: Bearer <API_KEY>
Idempotency-Key: chk_sess_987654321
Content-Type: application/json

{
  "branch_id": "branch_123",
  "order_type": "delivery",
  "items": [
    { "product_id": "prod_1", "quantity": 2 }
  ],
  "customer": {
    "name": "Sarah Miller",
    "phone": "+15559876543"
  },
  "delivery_address": {
    "street": "742 Evergreen Terrace",
    "city": "Springfield"
  },
  "payment_method": "cash"
}
```

## Immutable Snapshot Architecture
Once created, order line items, addon prices, tax rates, and delivery fees are permanently snapshot. Future menu price updates will NEVER alter historical orders or financial accounting.
