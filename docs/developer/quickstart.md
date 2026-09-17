# Quickstart Guide

Get up and running with the Universal RMS API in under 5 minutes.

## 1. Obtain API Credentials
Obtain an API key from your Restaurant Administrator Portal or via the Onboarding API (`POST /api/v1/admin/integrations`).

Key format:
```
rms_live_<client_id>.<secret>
```

## 2. Install the Official SDK
```bash
npm install @rms/sdk
```

## 3. Initialize the Client
```typescript
import { RmsApiClient } from '@rms/sdk';

const rms = new RmsApiClient({
  baseUrl: 'https://api.example-restaurant.com/api/v1',
  apiKey: process.env.RMS_API_KEY!,
});

// Fetch active menu
const menu = await rms.getMenu();
console.log(`Loaded ${menu.total_products} products`);
```

## 4. Place an Order
```typescript
const order = await rms.createOrder({
  branch_id: 'branch_1',
  order_type: 'takeaway',
  items: [{ product_id: 'prod_1', quantity: 1 }],
  customer: { name: 'Alex Johnson', phone: '+15551234567' },
  payment_method: 'cash',
});

console.log(`Order #${order.order_number} confirmed!`);
```
