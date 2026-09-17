# Idempotency & Fingerprinting

To prevent accidental double submissions (e.g. user double-clicks 'Pay' or mobile network retry), include the `Idempotency-Key` header on `POST /orders`.

## Header
```http
Idempotency-Key: <unique_client_generated_key>
```

## Guarantees
1. **Deduplication**: If the exact same payload is received with the same key, the original response is returned without creating a new order or charging twice.
2. **Conflict Detection**: If a different payload is sent with an existing key, the API returns `409 Conflict`.
3. **Isolation**: Idempotency records are strictly isolated by tenant and API client.
