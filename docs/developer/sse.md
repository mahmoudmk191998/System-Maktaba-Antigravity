# Server-Sent Events (SSE) Guide

Server-Sent Events (SSE) provide a lightweight, HTTP-native stream for receiving live updates from the RMS platform over standard HTTPS connections.

---

## 1. Connecting to the Event Stream

### Endpoint
```http
GET /api/v1/realtime/events
```

### Request Headers
| Header | Required | Description |
| :--- | :--- | :--- |
| `Authorization` | Yes | `Bearer <API_KEY>` |
| `Accept` | Yes | `text/event-stream` |
| `X-Branch-ID` | Optional | Filter events for a specific branch. |
| `Last-Event-ID` | Optional | Replay missed events starting after this event ID. |

### Query Parameters
- `types`: Comma-separated list of event types to subscribe to (e.g. `order.created,order.status_changed`).
- `branch_id`: Branch ID filter.
- `last_event_id`: Replay start ID.

---

## 2. Example: Using `@rms/sdk`

```typescript
import { RmsApiClient } from '@rms/sdk';

const rms = new RmsApiClient({
  baseUrl: process.env.RMS_API_URL || 'https://api.example-restaurant.com/api/v1',
  apiKey: process.env.RMS_API_KEY!,
});

// Subscribe to order status transitions
const stream = rms.events.subscribe({
  types: ['order.status_changed', 'order.cancelled'],
  branchId: 'branch_downtown_01',
});

stream.on('order.status_changed', (event) => {
  console.log(`Order ${event.data.order_number} status updated to: ${event.data.status}`);
});

stream.on('error', (err) => {
  console.error('SSE Stream error:', err);
});

// Cleanly close connection
// stream.close();
```

---

## 3. Example: Using Native `fetch` / `EventSource` (Node.js)

```javascript
const response = await fetch('https://api.example-restaurant.com/api/v1/realtime/events?types=order.created', {
  headers: {
    'Authorization': 'Bearer ' + process.env.RMS_API_KEY,
    'Accept': 'text/event-stream',
  },
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  console.log(decoder.decode(value));
}
```
