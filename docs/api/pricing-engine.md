# RMS Server-Side Pricing Engine Documentation (Phase 3A)

## 1. Overview & Architecture

The Pricing Engine is a pure, server-side, deterministic module designed to calculate authoritative order prices, addon costs, promotional discounts, delivery fees, and taxes.

```
External Client / App
        ↓
POST /api/v1/pricing/preview (or internal call by POST /api/v1/orders in Phase 3B)
        ↓
API Auth & Tenant Resolution (req.apiClient.tenantId)
        ↓
Branch Access Guard (req.apiClient.allowedBranchIds)
        ↓
Zod Input Validation (strict rejection of client prices/totals)
        ↓
Firestore / Service Authoritative Data Loading (tenant-scoped)
        ↓
Pure Pricing Engine (deterministic money math & clamping)
        ↓
Pricing Breakdown & Result Snapshot
```

---

## 2. Trusted vs. Untrusted Fields

| Field | Client Provided? | Server Handling |
| :--- | :--- | :--- |
| `product_id` | ✅ Yes | Validated against tenant's active menu in Firestore |
| `quantity` | ✅ Yes | Validated as integer between 1 and 999 |
| `addon_ids` | ✅ Yes | Validated and loaded from server |
| `branch_id` | ✅ Yes | Validated against tenant ownership and client's allowed branches |
| `order_type` | ✅ Yes | Validated (`dine_in`, `takeaway`, `delivery`, `curbside`) |
| `coupon_code` / `promotion_id` | ✅ Yes | Validated against date, status, usage limit, and min order |
| `delivery.zone_id` | ✅ Yes | Validated against delivery zones service |
| `price` / `unit_price` | ❌ Untrusted | **Ignored / Rejected**. Resolved from Firestore only. |
| `subtotal` | ❌ Untrusted | **Ignored / Rejected**. Calculated on server. |
| `discount` / `discount_amount`| ❌ Untrusted | **Ignored / Rejected**. Calculated on server. |
| `tax` / `tax_amount` | ❌ Untrusted | **Ignored / Rejected**. Calculated from restaurant settings. |
| `delivery_fee` | ❌ Untrusted | **Ignored / Rejected**. Calculated from zone rates. |
| `grand_total` | ❌ Untrusted | **Ignored / Rejected**. Calculated on server. |

---

## 3. Money Math & Rounding Strategy

To prevent floating-point representation drift (such as `0.1 + 0.2 !== 0.3` in JavaScript), the engine uses centralized arithmetic in `server/src/services/pricing/pricing.utils.ts`:

- `roundMoney(amount)`: `Math.round((amount + Number.EPSILON) * 100) / 100` (Banker's rounding to 2 decimal places).
- `addMoney(...amounts)`: Sums values and rounds cleanly.
- `subtractMoney(a, b)`: Subtracts values and rounds cleanly.
- `multiplyMoney(a, b)`: Multiplies price by quantity with clean rounding.
- `percentageMoney(amount, pct)`: Multiplies amount by percentage / 100 and rounds to 2 decimals.
- `clampNonNegative(amount)`: Guarantees that no monetary value is negative.

---

## 4. Calculation Rules

### A. Line Items:
$$\text{Single Item Price} = \text{Authoritative Unit Price} + \sum \text{Authoritative Addon Prices}$$
$$\text{Line Subtotal} = \text{Single Item Price} \times \text{Quantity}$$
$$\text{Subtotal} = \sum \text{Line Subtotals}$$

### B. Promotions & Coupons:
- Validates: `is_active === true`, `start_date <= now <= end_date`, `usage_count < usage_limit`, `subtotal >= min_order`.
- **Percentage Discount:**
  $$\text{Discount} = \min(\text{Percentage Amount}, \text{Max Discount (if set)})$$
- **Fixed Discount:**
  $$\text{Discount} = \min(\text{Fixed Amount}, \text{Subtotal})$$
- **Free Delivery:** Sets delivery fee to 0.
- **Safety Clamp:** $\text{Discount Total} \le \text{Subtotal}$. Grand total cannot become negative.

### C. Delivery Fees:
- If `order_type !== 'delivery'`, `delivery_fee = 0`.
- If `order_type === 'delivery'`, resolves `delivery_fee` from the validated delivery zone for the specified branch.

### D. Taxes:
- Derived from `tenants.settings`: `taxRate` and `taxIncluded`.
- If `taxIncluded === false`:
  $$\text{Tax Amount} = (\text{Subtotal} - \text{Discount Total}) \times \frac{\text{Tax Rate}}{100}$$
  $$\text{Grand Total} = (\text{Subtotal} - \text{Discount Total}) + \text{Delivery Fee} + \text{Tax Amount}$$
- If `taxIncluded === true`:
  $$\text{Tax Amount} = (\text{Subtotal} - \text{Discount Total}) - \frac{\text{Subtotal} - \text{Discount Total}}{1 + \frac{\text{Tax Rate}}{100}}$$
  $$\text{Grand Total} = (\text{Subtotal} - \text{Discount Total}) + \text{Delivery Fee}$$

---

## 5. Security & Isolation Guarantees

1. **Zero Database Mutation:** The engine executes purely as a read and calculation operation. It performs zero writes, counter increments, or status updates.
2. **Tenant Scoping:** All queries are filtered with `.where('tenant_id', '==', tenantId)`. Products, addons, coupons, or delivery zones from other tenants result in a `404 Not Found` or `400 Validation Error` without disclosing cross-tenant metadata.
3. **Strict Validation:** Unexpected payload properties (like client-sent prices) trigger a validation error via Zod `.strict()`.

---

## 6. Example API Preview Request & Response

### Request:
```http
POST /api/v1/pricing/preview
Authorization: Bearer rms_live_<clientId>.<secret>
Content-Type: application/json

{
  "branch_id": "branch_sushi_main",
  "order_type": "delivery",
  "items": [
    {
      "product_id": "prod_california",
      "quantity": 2,
      "addon_ids": ["addon_extra_ginger", "addon_spicy_mayo"]
    }
  ],
  "coupon_code": "WELCOME20",
  "delivery": {
    "zone_id": "zone_zamalek"
  }
}
```

### Response:
```json
{
  "success": true,
  "data": {
    "tenant_id": "tenant_sushi_bar",
    "branch_id": "branch_sushi_main",
    "order_type": "delivery",
    "currency": "EGP",
    "items": [
      {
        "product_id": "prod_california",
        "name": "كاليفورنيا رول",
        "quantity": 2,
        "unit_price": 250,
        "addons": [
          { "id": "addon_extra_ginger", "name": "زنجبيل إضافي", "price": 30 },
          { "id": "addon_spicy_mayo", "name": "سبايسي مايو", "price": 20 }
        ],
        "addons_total": 50,
        "line_subtotal": 600,
        "discount": 0,
        "line_total": 600
      }
    ],
    "subtotal": 600,
    "discounts": [
      {
        "id": "coupon_welcome20",
        "name": "كوبون (WELCOME20)",
        "code": "WELCOME20",
        "type": "percentage",
        "value": 20,
        "discount_amount": 100
      }
    ],
    "discount_total": 100,
    "delivery_fee": 45,
    "tax_rate": 14,
    "tax_included": false,
    "tax_amount": 70,
    "grand_total": 615,
    "calculated_at": "2026-08-20T09:36:00.000Z"
  }
}
```
