# API Key Management & Secret Rotation

## Secret Lifecycle

1. **Generation**: Generated using `crypto.randomBytes(32)` providing 256 bits of cryptographic entropy.
2. **Storage**: Plaintext secrets are NEVER stored in databases or logs. Only salted bcrypt / SHA256 hashes are persisted.
3. **One-Time Exposure**: The full secret is returned strictly once during initial creation or rotation.

## Secret Rotation
To rotate an integration's secret without downtime:
```http
POST /api/v1/admin/integrations/:id/rotate-secret
Authorization: Bearer <ADMIN_KEY>
```

The previous secret is instantly invalidated upon rotation.
