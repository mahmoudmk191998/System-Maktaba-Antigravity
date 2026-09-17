# Universal Restaurant Developer Platform

Welcome to the **Universal RMS Developer Portal**. This platform provides secure REST APIs, SDKs, and Webhook subscriptions to connect any restaurant website, mobile app, self-service kiosk, point-of-sale terminal, or third-party delivery service.

## Architecture Principles
1. **Multi-Tenant SaaS**: Every restaurant tenant is strictly isolated by cryptographic credentials.
2. **Server-Side Pricing Engine**: Client applications never compute discounts, taxes, or total prices directly in frontend code.
3. **Deterministic Idempotency**: Order creation requests use `Idempotency-Key` to eliminate duplicate billing and double ordering.
4. **Resilient Webhook Workers**: Real-time event notifications powered by distributed queues, automatic retries with exponential backoff, and circuit breakers.

## Documentation Index
- [Quickstart Guide](quickstart.md)
- [Authentication & API Keys](authentication.md)
- [Universal Integrations](integrations.md)
- [API Key Management & Rotation](api-keys.md)
- [Branches & Location Filtering](branches.md)
- [Catalog & Menu APIs](menu.md)
- [Delivery Zones & Address Validation](delivery.md)
- [Authoritative Pricing Engine](pricing.md)
- [Order Creation & Snapshots](orders.md)
- [Live Order Tracking & Status](tracking.md)
- [Webhooks & Signature Verification](webhooks.md)
- [Distributed Rate Limiting](rate-limits.md)
- [Errors & HTTP Codes](errors.md)
- [Idempotency & Fingerprinting](idempotency.md)
- [Security & Anti-SSRF Protection](security.md)
- [API Versioning Strategy](versioning.md)
- [Interactive Developer Playground](playground.md)
- [Official TypeScript SDK (@rms/sdk)](sdk.md)
- [SDK Publishing & Release Pipeline](sdk-publishing.md)
- [Universal Real-Time Event Platform](realtime.md)
- [Standard Events Catalog](events.md)
- [Server-Sent Events (SSE) Guide](sse.md)
- [WebSocket Protocol Guide](websockets.md)
- [Event Replay & Recovery](event-replay.md)
- [Troubleshooting & FAQs](troubleshooting.md)
