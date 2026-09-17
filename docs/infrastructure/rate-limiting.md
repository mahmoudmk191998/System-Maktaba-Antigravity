# Distributed Rate Limiting Architecture

## Overview

The RMS platform utilizes an abstract provider architecture for rate limiting. This decouples API middleware from specific storage implementations and allows horizontal scaling across multiple instances.

## Architecture

```
Incoming Request
      ↓
rateLimiter Middleware
      ↓
RateLimitStore (Abstraction)
 ├── InMemoryRateLimitStore (Default, zero external dependencies)
 └── RedisRateLimitStore (Distributed atomic Lua script with graceful fallback)
```

## Supported Tiers
- **Free**: 100 requests / minute
- **Standard**: 500 requests / minute
- **Premium**: 2000 requests / minute

## Response Headers
- `X-RateLimit-Limit`: Maximum allowed requests in current window.
- `X-RateLimit-Remaining`: Remaining requests.
- `X-RateLimit-Reset`: Unix timestamp when window resets.
- `Retry-After`: Returned with HTTP 429 stating exact seconds to wait.
