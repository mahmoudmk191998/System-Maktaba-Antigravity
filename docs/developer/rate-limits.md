# Distributed Rate Limiting

The RMS enforces tiered rate limits on all API requests based on integration configuration.

## Tier Quotas
- **Free**: 100 requests / minute
- **Standard**: 500 requests / minute
- **Premium**: 2000 requests / minute

## HTTP Response Headers
- `X-RateLimit-Limit`: Maximum requests per 60-second window.
- `X-RateLimit-Remaining`: Number of requests remaining.
- `X-RateLimit-Reset`: Seconds remaining until reset.
- `Retry-After`: Returned with HTTP 429 stating exact seconds to pause.
