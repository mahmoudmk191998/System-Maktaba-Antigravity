# Official TypeScript SDK Reference

The `@rms/sdk` package provides full TypeScript support and automatic error handling.

## SDK Initialization
```typescript
import { RmsApiClient } from '@rms/sdk';

const client = new RmsApiClient({
  baseUrl: 'https://api.example-restaurant.com/api/v1',
  apiKey: process.env.RMS_API_KEY!,
  timeoutMs: 10000,
  maxRetries: 2,
});
```

## Available SDK Methods
- `getHealth()`
- `getSettings()`
- `getBranches()`
- `getCategories()`
- `getProducts(categoryId?)`
- `getProductById(productId)`
- `getMenu()`
- `getDeliveryZones()`
- `getOffers()`
- `previewPricing(input)`
- `createOrder(input, options)`
- `getOrder(orderId)`
- `trackOrder(orderId)`
- `updateOrderStatus(orderId, status, notes?)`
- `checkDelivery(branchId, address)`
- `verifyWebhookSignature(options)`
