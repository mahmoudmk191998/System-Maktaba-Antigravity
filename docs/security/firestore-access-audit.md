# Firestore Direct Access Security Audit

## Executive Summary

This document audits every collection and direct Firestore SDK access across the RMS frontend (`src/`) and backend (`server/src/`).

## Collection Categorization Matrix

| Collection | Context | Operations | Category | Action / Target Endpoint |
| :--- | :--- | :--- | :--- | :--- |
| `api_clients` | Backend Only | `get`, `set`, `update` | **A. Server-Only** | Direct client access forbidden (`if false;`). Exposed via `/api/v1/admin/api-clients`. |
| `api_client_audit_logs` | Backend Only | `get`, `set` | **A. Server-Only** | Direct client access forbidden (`if false;`). Exposed via `/api/v1/admin/api-clients/:id/audit-logs`. |
| `api_usage_events` | Backend Only | `set`, `query` | **A. Server-Only** | Direct client access forbidden (`if false;`). Exposed via `/api/v1/admin/api-clients/:id/usage`. |
| `webhook_endpoints` | Backend Only | `get`, `set`, `delete` | **A. Server-Only** | Direct client access forbidden (`if false;`). Exposed via `/api/v1/webhooks`. |
| `integrations` | Backend Only | `get`, `set`, `update` | **A. Server-Only** | Direct client access forbidden (`if false;`). Exposed via `/api/v1/admin/integrations`. |
| `webhook_events` | Backend Only | `set` | **A. Server-Only** | Direct client access forbidden (`if false;`). Processed asynchronously by RMS dispatcher. |
| `webhook_delivery_attempts`| Backend Only | `set` | **A. Server-Only** | Direct client access forbidden (`if false;`). Internal retry tracking only. |
| `webhook_dead_letters` | Backend Only | `set`, `query` | **A. Server-Only** | Direct client access forbidden (`if false;`). Exposed via `/api/v1/admin/integrations/:id/dead-letters`. |
| `branch_counters` / `orderCounters` | Backend Only | `transaction get/set` | **A. Server-Only** | Direct client access forbidden (`if false;`). Atomic counter managed exclusively in `order.service.ts`. |
| `idempotency_records` | Backend Only | `transaction get/set` | **A. Server-Only** | Direct client access forbidden (`if false;`). Handled transparently by RMS Orders API. |
| `tenants` | POS / Staff | `getDoc`, `updateDoc` | **B. Client-Accessible (Auth)** | Requires `request.auth != null`. Stores company name, tax rates, and settings. |
| `branches` | POS / Staff | `query`, `addDoc`, `updateDoc` | **B. Client-Accessible (Auth)** | Requires `request.auth != null`. Exposed publicly via `/api/v1/branches`. |
| `menu_categories` | POS / Staff | `query`, `addDoc`, `updateDoc` | **B. Client-Accessible (Auth)** | Requires `request.auth != null`. Exposed publicly via `/api/v1/categories`. |
| `menu_items` / `products` | POS / Staff | `query`, `addDoc`, `updateDoc` | **B. Client-Accessible (Auth)** | Requires `request.auth != null`. Exposed publicly via `/api/v1/products`. |
| `addons` | POS / Staff | `query`, `addDoc` | **B. Client-Accessible (Auth)** | Requires `request.auth != null`. Embedded in `/api/v1/menu`. |
| `orders` | POS / Staff | `addDoc`, `updateDoc`, `query` | **B. Client-Accessible (Auth)** | Requires `request.auth != null`. External orders placed via `/api/v1/orders`. |
| `order_items` | POS / Staff | `addDoc`, `query` | **B. Client-Accessible (Auth)** | Requires `request.auth != null`. POS kitchen line item records. |
| `order_status_history` | POS / Staff | `addDoc`, `query` | **B. Client-Accessible (Auth)** | Requires `request.auth != null`. State transition audit logs. |
| `payments` | POS / Staff | `addDoc`, `query` | **B. Client-Accessible (Auth)** | Requires `request.auth != null`. Cash/Card transactions in POS. |
| `pos_shifts` | POS / Staff | `addDoc`, `updateDoc`, `query` | **B. Client-Accessible (Auth)** | Requires `request.auth != null`. Cashier shift balancing. |
| `call_center_orders` | POS / Staff | `addDoc`, `query` | **B. Client-Accessible (Auth)** | Requires `request.auth != null`. Call center dispatch queue. |
| `accounting_records` / `expenses` | POS / Staff | `addDoc`, `query` | **B. Client-Accessible (Auth)** | Requires `request.auth != null`. Back-office financial accounting. |
| `tables` / `reservations` | POS / Staff | `addDoc`, `updateDoc`, `query` | **B. Client-Accessible (Auth)** | Requires `request.auth != null`. Dine-in seat and table management. |
| `inventory_items` / `units` | POS / Staff | `addDoc`, `updateDoc`, `query` | **B. Client-Accessible (Auth)** | Requires `request.auth != null`. Raw ingredient stock items. |
| `suppliers` / `purchase_orders` | POS / Staff | `addDoc`, `updateDoc`, `query` | **B. Client-Accessible (Auth)** | Requires `request.auth != null`. Vendor purchasing cycles. |
| `recipes` / `recipe_ingredients` | POS / Staff | `addDoc`, `updateDoc`, `query` | **B. Client-Accessible (Auth)** | Requires `request.auth != null`. Recipe costing and ingredient formulas. |
| `branch_stock` / `stock_movements` | POS / Staff | `addDoc`, `updateDoc`, `query` | **B. Client-Accessible (Auth)** | Requires `request.auth != null`. Real-time quantity balances per branch. |
| `user_roles` / `user_permissions` | POS / Staff | `addDoc`, `query` | **B. Client-Accessible (Auth)** | Requires `request.auth != null`. Staff permission verification. |

## Category Definitions

- **Category A (Must be Server-Only)**: Security-critical collections containing secrets, hashes, counters, or idempotency locks. Direct client access is rejected with `allow read, write: if false;`.
- **Category B (Can remain client-accessible with authentication)**: POS and management collections required by staff users with active Firebase Auth sessions (`request.auth != null`).
- **Category C (Requires migration)**: Identified operations migrated to server endpoints where appropriate.
- **Category D (Already migrated)**: REST API operations (e.g. `POST /api/v1/orders`, `POST /api/v1/pricing/preview`, `GET /api/v1/menu`) completely decoupled from direct Firestore client rules.
