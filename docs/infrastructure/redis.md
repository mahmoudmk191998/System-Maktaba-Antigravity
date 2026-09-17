# Redis Distributed Infrastructure Guide

## Configuration

To enable distributed rate limiting across multiple RMS backend instances, configure Redis in your environment:

```env
RATE_LIMIT_STORE=redis
REDIS_URL=redis://:your_password@your-redis-host:6379/0
REDIS_RATE_LIMIT_PREFIX=rms:ratelimit:
```

## Atomic Execution
Redis rate limiting is executed via an atomic Lua script:
```lua
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local current = redis.call('INCR', key)
if current == 1 then
  redis.call('EXPIRE', key, window)
end
local ttl = redis.call('TTL', key)
return { current, ttl }
```

## High Availability & Graceful Fallback
If Redis experiences network latency, connection dropouts, or failure:
1. The `RedisRateLimitStore` transitions to `status: 'degraded'`.
2. Requests seamlessly fall back to local in-memory rate limiting.
3. The API never crashes, ensuring 100% uptime for restaurants.
