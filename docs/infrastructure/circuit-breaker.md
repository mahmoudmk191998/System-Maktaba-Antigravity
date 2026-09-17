# Webhook Endpoint Circuit Breaker

## Overview

The circuit breaker protects both the RMS infrastructure and external restaurant destinations from cascading failures and endless retry storms when an external endpoint goes offline.

## Scoping & Isolation

Circuit breakers are scoped strictly per endpoint: `tenant_id:endpoint_id`.
A failure on one external website NEVER impacts other channels or tenants.

## State Transitions

```
[ CLOSED ] (Normal Operation)
    │
    │ (5 consecutive failures)
    ▼
[  OPEN  ] (Temporarily halt delivery attempts, preserve events safely)
    │
    │ (cooldown: 60s)
    ▼
[ HALF_OPEN ] (Allow 1 probe request)
    ├── Probe succeeds ──► [ CLOSED ]
    └── Probe fails ─────► [  OPEN  ]
```

## Configuration
```env
WEBHOOK_CIRCUIT_FAILURE_THRESHOLD=5
WEBHOOK_CIRCUIT_COOLDOWN_SECONDS=60
WEBHOOK_CIRCUIT_HALF_OPEN_REQUESTS=1
```
