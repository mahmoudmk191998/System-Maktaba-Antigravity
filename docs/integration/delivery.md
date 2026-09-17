# Delivery & Zones API

The Delivery API enables external websites to retrieve valid delivery areas, verify coverage for a customer's address, and determine exact delivery fees.

## Endpoints

- `GET /api/v1/delivery/zones`: List active delivery zones for the tenant/branch.
- `GET /api/v1/delivery/zones/:id`: Retrieve zone details, minimum order value, and estimated delivery time.

## SDK Example

```typescript
const zones = await client.getDeliveryZones();
const zamalekZone = zones.find(z => z.name.includes('Zamalek'));
console.log(`Delivery Fee: ${zamalekZone.delivery_fee} EGP, Est Time: ${zamalekZone.estimated_time_minutes} mins`);
```
