# Order Tracking API

External clients can track the live preparation and delivery status of an order via `GET /api/v1/orders/:id`.

## Privacy & Data Stripping

The order tracking endpoint strips all internal kitchen cost margins, supplier prices, and recipe formulations. It exposes only public-safe order status, line items, customer name/phone, delivery address, and pricing breakdown.

## Lifecycle States

- `pending` — Order received, waiting kitchen confirmation.
- `confirmed` — Kitchen confirmed order.
- `preparing` — Food is being prepared in kitchen.
- `ready` — Order packed and ready for pickup/courier.
- `out_for_delivery` — Courier dispatched.
- `delivered` — Order delivered to customer.
- `completed` — Order fully closed.
- `cancelled` — Order cancelled.
