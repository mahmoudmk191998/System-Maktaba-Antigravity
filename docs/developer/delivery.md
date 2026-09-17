# Delivery Zones & Address Validation

Check delivery coverage and calculate authoritative delivery fees based on branch delivery zones.

## Get Delivery Zones
```http
GET /api/v1/delivery-zones?branch_id=branch_123
Authorization: Bearer <API_KEY>
```

## Check Delivery via SDK
```typescript
const result = await rms.checkDelivery('branch_123', {
  zone_id: 'zone_north',
  city: 'Metropolis',
  street: '5th Avenue',
});

if (result.is_deliverable) {
  console.log(`Delivery Fee: $${result.delivery_fee}`);
}
```
