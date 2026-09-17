# Sushi Bar Complete Integration Guide

This guide walks through the exact end-to-end integration for the **Sushi Bar Website & Mobile App**.

```
1. Initialize SDK
   const client = new RmsApiClient({ baseUrl, apiKey: 'rms_live_...', branchId: 'branch_sushi_main' });

2. Fetch Menu & Settings
   const [settings, menu] = await Promise.all([client.getSettings(), client.getMenu()]);

3. Check Delivery Zone
   const zones = await client.getDeliveryZones();

4. Real-Time Price Preview (Server-Side)
   const pricing = await client.previewPricing({
     branch_id: 'branch_sushi_main',
     order_type: 'delivery',
     delivery_zone_id: 'zone_zamalek',
     coupon_code: 'SUSHI20',
     items: [{ product_id: 'prod_california', quantity: 2 }]
   });

5. Submit Order (with Idempotency-Key)
   const order = await client.createOrder(orderPayload, 'idem_uuid_key');

6. Receive Live Updates via Webhook
   App endpoint receives HMAC-signed event `order.out_for_delivery` -> Notifies customer on mobile app!
```
