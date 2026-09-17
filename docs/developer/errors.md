# Errors & Standard Envelope

All error responses from the RMS API follow a uniform JSON structure.

## Error Response Envelope
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid delivery address zone",
    "details": {}
  }
}
```

## Standard Error Codes
| Code | HTTP Status | Description |
| :--- | :--- | :--- |
| `UNAUTHORIZED` | 401 | Missing or invalid API credential |
| `FORBIDDEN` | 403 | Insufficient permission or unauthorized branch |
| `NOT_FOUND` | 404 | Resource does not exist or tenant mismatch |
| `VALIDATION_ERROR` | 400 | Request body failed schema validation |
| `CONFLICT` | 409 | Idempotency payload mismatch or conflict |
| `RATE_LIMIT_EXCEEDED` | 429 | Exceeded request quota for tier |
| `INTERNAL_ERROR` | 500 | Server error (internal details redacted) |
