# Changelog

All notable changes to the `@rms/sdk` package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-08-20

### Added
- **RmsApiClient**: Primary HTTP client for the RMS REST API (v1 & v2).
- **Core Endpoints**:
  - `getHealth()`: Gateway and service health check.
  - `getSettings()`: Public restaurant branding and operational settings.
  - `getBranches()` / `getBranchById()`: Multi-branch queries with tenant isolation.
  - `getCategories()` / `getProducts()` / `getProductById()`: Full catalog discovery.
  - `getMenu()`: Hierarchical category and nested products tree.
  - `getDeliveryZones()`: Delivery zone polygons, fees, and minimum thresholds.
  - `getOffers()`: Active restaurant promotions and discounts.
  - `previewPricing()`: Server-side authoritative price calculation.
  - `createOrder()`: Order creation with idempotency fingerprinting.
  - `getOrder()` / `trackOrder()` / `updateOrderStatus()`: Lifecycle order tracking.
- **Typed Error Hierarchy**: `RmsAuthError`, `RmsPermissionError`, `RmsNotFoundError`, `RmsValidationError`, `RmsConflictError`, `RmsRateLimitError`, `RmsServerError`.
- **Webhook Security**: `verifyWebhookSignature()` with HMAC-SHA256, constant-time comparison, and replay attack tolerance.
- **Resilience**: Configurable automatic exponential backoff retry policy and timeout handling.
- **TypeScript Support**: Full TypeScript definitions and source maps included.
