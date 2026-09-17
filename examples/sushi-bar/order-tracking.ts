import { rmsClient } from './rms-client.js';

export async function trackSushiBarOrder(orderId: string) {
  try {
    const order = await rmsClient.getOrder(orderId);
    console.log(`Order #${order.order_number} Status: ${order.status}`);
    console.log(`Items count: ${order.items.length}, Total: ${order.pricing.grand_total} ${order.pricing.currency}`);
    return order;
  } catch (error) {
    console.error(`Failed to track order ${orderId}:`, error);
    throw error;
  }
}
