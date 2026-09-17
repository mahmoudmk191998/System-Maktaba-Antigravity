# Standard Event Types & Schema

All events published by the RMS Real-Time Platform adhere to a strict, typed envelope with globally unique IDs and sanitized payloads.

---

## 1. Event Envelope Schema

```json
{
  "id": "evt_a1b2c3d4e5f67890",
  "type": "order.status_changed",
  "version": "1",
  "tenant_id": "tenant_downtown_eats",
  "integration_id": "cli_987654321",
  "branch_id": "branch_main_01",
  "resource_type": "order",
  "resource_id": "ord_88291038192",
  "request_id": "req_881920381",
  "timestamp": "2026-08-20T12:00:00.000Z",
  "data": {
    "order_id": "ord_88291038192",
    "order_number": "#104",
    "status": "preparing",
    "updated_at": "2026-08-20T12:00:00.000Z"
  }
}
```

---

## 2. Standard Event Catalog

| Event Type | Resource Type | Required Permission | Description |
| :--- | :--- | :--- | :--- |
| `order.created` | `order` | `orders:read` | Triggered when an order is submitted and accepted. |
| `order.updated` | `order` | `orders:read` | Triggered when order details or items change. |
| `order.status_changed` | `order` | `orders:read` | Triggered when order status transitions (e.g. `preparing`, `delivered`). |
| `order.cancelled` | `order` | `orders:read` | Triggered when an order is cancelled. |
| `payment.created` | `payment` | `orders:read` | Triggered when a payment attempt is registered. |
| `payment.completed` | `payment` | `orders:read` | Triggered on successful transaction completion. |
| `payment.failed` | `payment` | `orders:read` | Triggered when a payment transaction fails. |
| `menu.updated` | `menu` | `menu:read` | Triggered when menu categories or prices change. |
| `product.created` | `product` | `menu:read` | Triggered when a new product is added. |
| `product.updated` | `product` | `menu:read` | Triggered when a product is modified. |
| `branch.created` | `branch` | `branches:read` | Triggered when a branch is created. |
| `branch.updated` | `branch` | `branches:read` | Triggered when branch operating hours or settings change. |
| `delivery.status_changed` | `delivery` | `delivery:read` | Triggered when driver dispatch or delivery status changes. |
| `reservation.created` | `reservation` | `reservations:read` | Triggered when a table reservation is created. |
